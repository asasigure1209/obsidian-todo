import type { Clock } from "@/domain/clock";
import { applyToBody, isRejection, type Rejection } from "@/domain/commands";
import type { DayFiles } from "@/domain/day-files";
import { parseDocument } from "@/domain/document";
import { POMODORO_MINUTES } from "@/domain/minutes";
import type { Alarm, Notifier } from "@/domain/notifier";
import { stepTimer, type Timer, type TimerOp, type TimerStep } from "@/domain/timer";
import type { TimerStore } from "@/domain/timer-store";

export interface EditorDeps {
  files: DayFiles;
  store: TimerStore;
  clock: Clock;
  notifier: Notifier;
  alarm: Alarm;
  /** 書き込みの失敗など、例外の行き先 */
  onError: (error: unknown) => void;
}

/** done：書き込んだ（または変える必要がなかった）、refused：断って知らせた、skipped：続けてよいかの確認で取りやめた */
export type EditOutcome = "done" | "refused" | "skipped";

const REJECTION_MESSAGES: Record<Rejection["rejected"], string> = {
  stale: "ファイルが変わっていたので、操作を取りやめて読み直しました",
  invalid: "入力が書式に合わないため、追加・変更しませんでした",
  unstable: "この操作をするとファイルの区切りが変わるため、取りやめました",
};
const WRITE_FAILED_MESSAGE = "ファイルに書き込めませんでした";
const EXPIRED_MESSAGE = "25分たちました。ポモドーロを記録しました";
const DISCARDED_MESSAGE =
  "着手中のカードが見つからないため、計測を取りやめました（記録していません）";
const missingMessage = (dayKey: string) => `${dayKey} のファイルがありません`;
const POMODORO_MS = POMODORO_MINUTES * 60_000;

class Refused extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage);
  }
}

/** 保存したタイマーを読み込んで開く */
export async function openDayEditor(deps: EditorDeps): Promise<DayEditor> {
  return new DayEditor(deps, await deps.store.load());
}

/**
 * その日のファイルへの操作とタイマーをまとめて扱う。プラグインに1つ（AD-6）。
 * - 操作は1本に並べて順番に行う。ボードの操作もタイマーの確定も同じ並びに乗る
 * - 1回の操作は「最新の本文を読む → タイマーの遷移を計算 → タイマーを保存 → 書き込む」。
 *   読んでから書くまでに本文が変わっていたら、書かずにタイマーを元に戻す
 * - 毎秒の判定（tick）で25分の満了を確定する。保留中は、対象の日のファイルが変わるたびに読み直す
 */
export class DayEditor {
  private queue: Promise<unknown> = Promise.resolve();
  private expiring = false;
  private closed = false;
  private stopWatching: () => void = () => {};
  private watchedDay: string | undefined;

  constructor(
    private readonly deps: EditorDeps,
    private timer: Timer,
  ) {
    this.watch();
  }

  /** 今のタイマー。ボードは表示を組み立てるたびに読む */
  current(): Timer {
    return this.timer;
  }

  /** guard は順番が来た時点で確かめ、false なら何もしない（ボードが、先に断られた操作の後に並んだものを捨てるため） */
  edit(dayKey: string, op: TimerOp, guard: () => boolean = () => true): Promise<EditOutcome> {
    return this.enqueue(async () => {
      if (!guard()) {
        return "skipped";
      }
      await this.finishOtherDay(dayKey, op);
      return this.apply(dayKey, op);
    });
  }

  /** 毎秒呼ぶ。25分たっていれば確定する。確定の途中の判定は重ねず、保留中は読み直しに任せる */
  tick(): void {
    const timer = this.timer;
    const due = timer && !timer.held && this.now() - timer.startedAt >= POMODORO_MS;
    if (this.closed || this.expiring || !due) {
      return;
    }
    this.expiring = true;
    void this.edit(timer.dayKey, { kind: "expire" }).finally(() => {
      this.expiring = false;
    });
  }

  close(): void {
    this.closed = true;
    this.stopWatching();
  }

  /** ほかの日のタイマーがあるときに新しく計測を始めるなら、先にその日のファイルへ中断を記録する */
  private async finishOtherDay(dayKey: string, op: TimerOp): Promise<void> {
    const starts = (op.kind === "move" && op.status === "doing") || op.kind === "next";
    if (starts && this.timer && this.timer.dayKey !== dayKey) {
      await this.apply(this.timer.dayKey, { kind: "interrupt" });
    }
  }

  private enqueue(task: () => Promise<EditOutcome>): Promise<EditOutcome> {
    const result = this.queue.then(task);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async apply(dayKey: string, op: TimerOp): Promise<EditOutcome> {
    const before = this.timer;
    try {
      const step = await this.write(dayKey, op);
      this.announce(step);
      return "done";
    } catch (error) {
      await this.setTimer(before);
      this.report(error);
      return "refused";
    }
  }

  /** タイマーを先に保存してから書く（AD-6）。二重に記録されるより、欠けるほうがよい */
  private async write(dayKey: string, op: TimerOp): Promise<TimerStep> {
    const body = await this.deps.files.read(dayKey);
    if (body === undefined) {
      throw new Refused(missingMessage(dayKey));
    }
    const step = stepTimer(this.timer, parseDocument(body), dayKey, op, this.now());
    const written = isRejection(step.result) ? step.result : applyToBody(body, () => step.result);
    if (isRejection(written)) {
      throw new Refused(REJECTION_MESSAGES[written.rejected]);
    }
    await this.setTimer(step.timer);
    if (written !== body) {
      await this.replace(dayKey, body, written);
    }
    return step;
  }

  /** 読んだときの本文のままなら書き換える。変わっていたら書かずに断る */
  private async replace(dayKey: string, body: string, written: string): Promise<void> {
    let stale = false;
    const found = await this.deps.files.process(dayKey, (latest) => {
      stale = latest !== body;
      return stale ? latest : written;
    });
    if (!found) {
      throw new Refused(missingMessage(dayKey));
    }
    if (stale) {
      throw new Refused(REJECTION_MESSAGES.stale);
    }
  }

  private announce(step: TimerStep): void {
    if (step.notice === "expired") {
      this.deps.notifier.notify(EXPIRED_MESSAGE);
      this.deps.alarm.ring();
    } else if (step.notice === "discarded") {
      this.deps.notifier.notify(DISCARDED_MESSAGE);
    }
  }

  private report(error: unknown): void {
    if (error instanceof Refused) {
      this.deps.notifier.notify(error.userMessage);
      return;
    }
    this.deps.onError(error);
    this.deps.notifier.notify(WRITE_FAILED_MESSAGE);
  }

  private async setTimer(timer: Timer): Promise<void> {
    if (sameTimer(timer, this.timer)) {
      return;
    }
    this.timer = timer;
    await this.deps.store.save(timer);
    this.watch();
  }

  /** タイマーの日のファイルを見張り、保留中なら変わるたびに読み直す */
  private watch(): void {
    const dayKey = this.timer?.dayKey;
    if (this.closed || dayKey === this.watchedDay) {
      return;
    }
    this.stopWatching();
    this.watchedDay = dayKey;
    this.stopWatching = dayKey
      ? this.deps.files.onChange(dayKey, () => this.recheck(dayKey))
      : () => {};
  }

  private recheck(dayKey: string): void {
    if (this.timer?.held) {
      void this.edit(dayKey, { kind: "recheck" });
    }
  }

  private now(): number {
    return this.deps.clock.now().getTime();
  }
}

function sameTimer(a: Timer, b: Timer): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
