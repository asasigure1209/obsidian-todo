import type { DayEditor } from "@/app/day-editor";
import { type Board, toBoard } from "@/domain/board";
import type { Clock } from "@/domain/clock";
import {
  completeCard,
  type DocumentCommand,
  isRejection,
  type LineRef,
  moveCard,
} from "@/domain/commands";
import { canEdit, type EditKind, toDayKey } from "@/domain/day";
import type { DayFiles } from "@/domain/day-files";
import { type DayDocument, parseDocument, type Status } from "@/domain/document";
import type { Notifier } from "@/domain/notifier";
import { findTarget, type TimerOp } from "@/domain/timer";

/** Svelte のストアの約束と同じ形。subscribe はすぐに今の値を渡し、戻り値で購読をやめる */
export interface Readable<T> {
  subscribe(run: (value: T) => void): () => void;
}

/** 計測中のカード。key は Card.key、startedAt から残り時間を出す */
export interface RunningCard {
  key: string;
  startedAt: number;
}

export type BoardState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "unreadable" }
  | { kind: "board"; board: Board; running?: RunningCard };

/** 1日のボードの窓口。表示する状態と、ボードからの操作をまとめて持つ */
export interface BoardSession extends Readable<BoardState> {
  /** カードを列の中の位置へ動かす（design 8.6）。着手中へ動かすと計測が始まる（design 8.1） */
  move(card: LineRef, status: Status, position: number): Promise<void>;
  /** 「完了にする」 */
  complete(card: LineRef): Promise<void>;
  /** 「中断（割り込み）」 */
  interrupt(): Promise<void>;
  /** 「次のポモドーロを開始」 */
  next(card: LineRef): Promise<void>;
  /** 変更の購読をやめ、以後の読み込みと操作を何もしない */
  close(): void;
}

export interface BoardDeps {
  files: DayFiles;
  clock: Clock;
  notifier: Notifier;
  /** 書き込みとタイマーの窓口。プラグインに1つ */
  editor: DayEditor;
  /** 受け取る側や本文の解釈で起きた例外の行き先 */
  onError: (error: unknown) => void;
}

const LOADING: BoardState = { kind: "loading" };
const MISSING: BoardState = { kind: "missing" };
const UNREADABLE: BoardState = { kind: "unreadable" };
const PAST_DAY_MESSAGE = "過去の日は、作業時間の修正だけができます";

export function openBoard(deps: BoardDeps, dayKey: string): BoardSession {
  return new Session(deps, dayKey);
}

/**
 * - ファイルが変わるたびに読み直して流す（AD-2）。読み込みは追い越されることがあるので、最後に始めた読み込みの結果だけを使う
 * - 読めなかったときは前の状態のまま次の変更を待つ。まだ何も読めていなければ、読めなかったことを流す
 * - 操作は、最後に読んだ本文に当てた結果をすぐに流してから（先読み）、DayEditor の並びに乗せて書き込む（AD-3）。
 *   書き込みが終わるまでは読み直しの結果を捨て、書き込みのたびに読み直す
 * - 書き込みが断られたら、それより前に受けた操作は、断られた操作の先読みをもとにしているので書き込まずに捨てる
 */
class Session implements BoardSession {
  private state = LOADING;
  private doc: DayDocument | undefined;
  private loaded = false;
  private closed = false;
  private latest = 0;
  private pendingWrites = 0;
  /** 書き込みが断られるたびに進める。進む前に受けた操作は捨てる */
  private epoch = 0;
  private readonly runs = new Set<(state: BoardState) => void>();
  private readonly stopListening: () => void;

  constructor(
    private readonly deps: BoardDeps,
    private readonly dayKey: string,
  ) {
    this.stopListening = deps.files.onChange(dayKey, () => this.reload());
    this.reload();
  }

  subscribe(run: (state: BoardState) => void): () => void {
    this.runs.add(run);
    run(this.state);
    return () => this.runs.delete(run);
  }

  move(card: LineRef, status: Status, position: number): Promise<void> {
    return this.edit("move", { kind: "move", card, status, position }, (doc) =>
      moveCard(doc, card, status, position),
    );
  }

  complete(card: LineRef): Promise<void> {
    return this.edit("complete", { kind: "complete", card }, (doc) => completeCard(doc, card));
  }

  /** 経過分を記録するだけなので、作業時間の修正として扱う。日付をまたいで過去の日になったボードでも、その日の計測を止められる */
  interrupt(): Promise<void> {
    return this.edit("work", { kind: "interrupt" });
  }

  next(card: LineRef): Promise<void> {
    return this.edit("move", { kind: "next", card });
  }

  close(): void {
    this.closed = true;
    this.stopListening();
  }

  private edit(kind: EditKind, op: TimerOp, preview?: DocumentCommand): Promise<void> {
    if (this.closed) {
      return Promise.resolve();
    }
    if (!canEdit(kind, this.dayKey, toDayKey(this.deps.clock.now()))) {
      this.deps.notifier.notify(PAST_DAY_MESSAGE);
      return Promise.resolve();
    }
    const epoch = this.epoch;
    if (preview) {
      this.preview(preview);
    }
    this.pendingWrites++;
    return this.deps.editor
      .edit(this.dayKey, op, () => epoch === this.epoch)
      .then((outcome) => this.afterWrite(outcome === "refused"))
      .catch(this.deps.onError);
  }

  /** 書き込みが残っているうちの読み直しは load が捨てるので、毎回読み直してよい */
  private afterWrite(refused: boolean): void {
    if (refused) {
      this.epoch++;
    }
    this.pendingWrites--;
    this.reload();
  }

  /** 断られる操作は先読みしない。書き込みで改めて断られ、そこで知らせる */
  private preview(command: DocumentCommand): void {
    const next = this.doc && command(this.doc);
    if (next && !isRejection(next)) {
      this.doc = next;
      this.emit(this.toState(next));
    }
  }

  private reload(): void {
    this.load().catch(this.deps.onError);
  }

  private async load(): Promise<void> {
    const current = ++this.latest;
    const read = await tryRead(this.deps.files, this.dayKey);
    const outdated = current !== this.latest || this.pendingWrites > 0;
    if (!(this.closed || outdated)) {
      this.applyRead(read);
    }
  }

  /** 本文の解釈で起きた例外は読めなかったことにせず、onError へ渡す */
  private applyRead(read: { body: string | undefined } | undefined): void {
    if (!read) {
      if (!this.loaded) {
        this.emit(UNREADABLE);
      }
      return;
    }
    this.loaded = true;
    this.doc = read.body === undefined ? undefined : parseDocument(read.body);
    this.emit(this.doc ? this.toState(this.doc) : MISSING);
  }

  /**
   * 計測中のカードは、この日のタイマーの対象が見つかったときだけ示す。
   * タイマーが変わる操作の後は必ず読み直すので、タイマーはそのつど DayEditor から読めばよい
   */
  private toState(doc: DayDocument): BoardState {
    const board = toBoard(doc);
    const timer = this.deps.editor.current();
    const own = timer?.dayKey === this.dayKey ? timer : undefined;
    const target = own && findTarget(doc, own);
    const card = target && board.doing.find((c) => c.ref.index === target.index);
    return card && own
      ? { kind: "board", board, running: { key: card.key, startedAt: own.startedAt } }
      : { kind: "board", board };
  }

  /** 1つの受け取り手の例外で、ほかの受け取り手を止めない */
  private emit(state: BoardState): void {
    this.state = state;
    for (const run of this.runs) {
      try {
        run(state);
      } catch (error) {
        this.deps.onError(error);
      }
    }
  }
}

/** 読めなかったときは undefined */
async function tryRead(
  files: DayFiles,
  dayKey: string,
): Promise<{ body: string | undefined } | undefined> {
  try {
    return { body: await files.read(dayKey) };
  } catch {
    return undefined;
  }
}
