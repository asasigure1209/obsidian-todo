import type { DayEditor } from "@/app/day-editor";
import { type Board, toBoard } from "@/domain/board";
import type { Clock } from "@/domain/clock";
import { editWork, isRejection, type LineRef, type WorkEdits } from "@/domain/commands";
import { canEdit, type EditKind, toDayKey } from "@/domain/day";
import type { DayFiles } from "@/domain/day-files";
import { type DayDocument, parseDocument } from "@/domain/document/body";
import type { Status } from "@/domain/document/todo-line";
import type { Notifier } from "@/domain/notifier";
import { type RunningTarget, runningTarget, stepTimer, type TimerOp } from "@/domain/timer";

/** Svelte のストアの約束と同じ形。subscribe はすぐに今の値を渡し、戻り値で購読をやめる */
export interface Readable<T> {
  subscribe(run: (value: T) => void): () => void;
}

/** 計測中のカード。key は Card.key、startedAt から残り時間を出す。count は何個目のポモドーロか */
export interface RunningCard {
  key: string;
  startedAt: number;
  count: number;
}

export type BoardState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "unreadable" }
  | { kind: "board"; board: Board; running?: RunningCard };

/** 1日のボードの窓口。表示する状態と、ボードからの操作をまとめて持つ。操作は、書き込めたら true で終わる */
export interface BoardSession extends Readable<BoardState> {
  /** カードを列の中の位置へ動かす（design 8.6）。着手中へ動かすと計測が始まる（design 8.1） */
  move(card: LineRef, status: Status, position: number): Promise<boolean>;
  /** 「完了にする」 */
  complete(card: LineRef): Promise<boolean>;
  /** 「中断（割り込み）」 */
  interrupt(): Promise<boolean>;
  /** 「次のポモドーロを開始」 */
  next(card: LineRef): Promise<boolean>;
  /** M2 の「保存」。書き込めたら true、断られたり取りやめたりしたら false（ダイアログを開いたままにする） */
  editWork(card: LineRef, edits: WorkEdits): Promise<boolean>;
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

  move(card: LineRef, status: Status, position: number): Promise<boolean> {
    return this.edit("move", { kind: "move", card, status, position });
  }

  complete(card: LineRef): Promise<boolean> {
    return this.edit("complete", { kind: "complete", card });
  }

  interrupt(): Promise<boolean> {
    return this.edit("interrupt", { kind: "interrupt" });
  }

  next(card: LineRef): Promise<boolean> {
    return this.edit("move", { kind: "next", card });
  }

  editWork(card: LineRef, edits: WorkEdits): Promise<boolean> {
    return this.edit("work", { kind: "edit", command: (doc) => editWork(doc, card, edits) });
  }

  close(): void {
    this.closed = true;
    this.stopListening();
  }

  /** 書き込めたら true */
  private edit(kind: EditKind, op: TimerOp): Promise<boolean> {
    if (this.closed) {
      return Promise.resolve(false);
    }
    if (!canEdit(kind, this.dayKey, toDayKey(this.deps.clock.now()))) {
      this.deps.notifier.notify(PAST_DAY_MESSAGE);
      return Promise.resolve(false);
    }
    const epoch = this.epoch;
    this.preview(op);
    this.pendingWrites++;
    return this.deps.editor
      .edit(this.dayKey, op, () => epoch === this.epoch)
      .then((outcome) => {
        this.afterWrite(outcome === "refused");
        return outcome === "done";
      })
      .catch((error: unknown) => {
        this.deps.onError(error);
        return false;
      });
  }

  /** 書き込みが残っているうちの読み直しは load が捨てるので、毎回読み直してよい */
  private afterWrite(refused: boolean): void {
    if (refused) {
      this.epoch++;
    }
    this.pendingWrites--;
    this.reload();
  }

  /**
   * 書き込みと同じ stepTimer を最後に読んだ本文に当てて、結果をすぐに流す（記録の行も含む）。
   * 断られる操作は先読みしない。書き込みで改めて断られ、そこで知らせる
   */
  private preview(op: TimerOp): void {
    const now = this.deps.clock.now().getTime();
    const next =
      this.doc && stepTimer(this.deps.editor.current(), this.doc, this.dayKey, op, now).result;
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
    const running = runningCard(board, runningTarget(this.deps.editor.current(), doc, this.dayKey));
    return running ? { kind: "board", board, running } : { kind: "board", board };
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

/** 計測中の対象のカード。「何個目」は、そのカードのポモドーロの行の数＋1 */
function runningCard(board: Board, running: RunningTarget | undefined): RunningCard | undefined {
  const card = running && board.doing.find((c) => c.ref.index === running.target.index);
  return card && running
    ? { key: card.key, startedAt: running.timer.startedAt, count: card.pomodoros + 1 }
    : undefined;
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
