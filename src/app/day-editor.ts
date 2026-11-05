import {
  DISCARDED_MESSAGE,
  expiredMessage,
  missingMessage,
  REJECTION_MESSAGES,
  WRITE_FAILED_MESSAGE,
} from "@/app/messages";
import type { Clock } from "@/domain/clock";
import { applyToBody, isRejection } from "@/domain/commands/command";
import type { DayFiles } from "@/domain/day-files";
import { parseDocument } from "@/domain/document/body";
import type { Alarm, Notifier } from "@/domain/notifier";
import {
  isDue,
  type RunningTimer,
  sameTimer,
  startsTimer,
  stepTimer,
  type Timer,
  type TimerOp,
  type TimerStep,
} from "@/domain/timer";
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
  private recheckQueued = false;
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
    if (this.closed || this.expiring || !isDue(timer, this.now())) {
      return;
    }
    this.expiring = true;
    void this.edit(timer.dayKey, { kind: "expire" })
      .then(() => this.holdIfUnchanged(timer))
      .catch(this.deps.onError)
      .finally(() => {
        this.expiring = false;
      });
  }

  /**
   * 満了を確定できなかった（ファイルがない、書き込めない）とき、タイマーは元のまま残る。
   * そのときは保留にして毎秒やり直さず、タイマーの日のファイルが変わったときか、次の操作で判定し直す
   */
  private async holdIfUnchanged(timer: RunningTimer): Promise<void> {
    if (sameTimer(this.timer, timer)) {
      await this.setTimer({ ...timer, held: true });
    }
  }

  close(): void {
    this.closed = true;
    this.stopWatching();
  }

  /** ほかの日のタイマーがあるときに新しく計測を始めるなら、先にその日のファイルへ中断を記録する */
  private async finishOtherDay(dayKey: string, op: TimerOp): Promise<void> {
    if (!(startsTimer(op) && this.timer && this.timer.dayKey !== dayKey)) {
      return;
    }
    await this.apply(this.timer.dayKey, { kind: "interrupt" });
    // 中断を記録できずに残ったタイマーは、置き換える前に捨てて知らせる（AD-6）
    if (this.timer && this.timer.dayKey !== dayKey) {
      await this.setTimer(undefined);
      this.deps.notifier.notify(DISCARDED_MESSAGE);
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
      this.announce(step, before);
      return "done";
    } catch (error) {
      await this.setTimer(before).catch(this.deps.onError);
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

  /** 満了は見逃さないよう Alarm で知らせる。カードの名前は、確定する前のタイマーの行から取る */
  private announce(step: TimerStep, before: Timer): void {
    if (step.timer && step.timer.startedAt !== before?.startedAt) {
      this.deps.alarm.prepare();
    }
    if (step.notice === "expired" && before) {
      this.deps.alarm.ring(expiredMessage(before.text));
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
    // 保存できてから持ち替える。保存に失敗したら、今のタイマーは変えない
    await this.deps.store.save(timer);
    this.timer = timer;
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

  /**
   * 編集中は変更が続くので、読み直しは並びに1つだけ置く。
   * 順番が来て読み始めた時点で印を外すので、その後の変更はまた読み直す
   */
  private recheck(dayKey: string): void {
    if (!this.timer?.held || this.recheckQueued) {
      return;
    }
    this.recheckQueued = true;
    void this.edit(dayKey, { kind: "recheck" }, () => {
      this.recheckQueued = false;
      return true;
    });
  }

  private now(): number {
    return this.deps.clock.now().getTime();
  }
}
