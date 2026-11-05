import { LatestReader, type ReadResult } from "@/app/board/reader";
import { BoardWriter } from "@/app/board/writer";
import type { DayEditor } from "@/app/day-editor";
import { PAST_DAY_MESSAGE } from "@/app/messages";
import { type Readable, Store } from "@/app/store";
import { type BoardView, toBoardView } from "@/domain/board";
import type { Clock } from "@/domain/clock";
import { isRejection, type LineRef } from "@/domain/commands/command";
import { editWork, type WorkEdits } from "@/domain/commands/work";
import { canEdit, type EditKind, toDayKey } from "@/domain/day";
import type { DayFiles } from "@/domain/day-files";
import { type DayDocument, parseDocument } from "@/domain/document/body";
import type { Status } from "@/domain/document/todo-line";
import type { Notifier } from "@/domain/notifier";
import { stepTimer, type TimerOp } from "@/domain/timer";

export type BoardState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "unreadable" }
  | ({ kind: "board" } & BoardView);

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

export function openBoard(deps: BoardDeps, dayKey: string): BoardSession {
  return new Session(deps, dayKey);
}

/**
 * - ファイルが変わるたびに LatestReader で読み直して流す（AD-2）。閉じた後と書き込み中に読んだ結果は捨てる
 * - 読めなかったときは前の状態のまま次の変更を待つ。まだ何も読めていなければ、読めなかったことを流す
 * - 操作は、最後に読んだ本文に当てた結果をすぐに流してから（先読み）、BoardWriter で書き込む（AD-3）。
 *   書き込みが終わるまでは読み直しの結果を捨て、書き込みのたびに読み直す
 */
class Session implements BoardSession {
  private doc: DayDocument | undefined;
  private loaded = false;
  private closed = false;
  private readonly states: Store<BoardState>;
  private readonly writer: BoardWriter;
  private readonly reader: LatestReader;
  private readonly stopListening: () => void;

  constructor(
    private readonly deps: BoardDeps,
    private readonly dayKey: string,
  ) {
    this.states = new Store(LOADING, deps.onError);
    this.reader = new LatestReader(deps.files, dayKey, (read) => this.receive(read), deps.onError);
    // 書き込み中の読み直しは receive が捨てるので、書き込みが終わるたびに読み直してよい
    this.writer = new BoardWriter(
      deps.editor,
      dayKey,
      () => this.reloadUnlessClosed(),
      deps.onError,
    );
    this.stopListening = deps.files.onChange(dayKey, () => this.reader.reload());
    this.reader.reload();
  }

  subscribe(run: (state: BoardState) => void): () => void {
    return this.states.subscribe(run);
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

  /** カードを着手中へ戻すので、移動と同じく過去の日にはできない */
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
    this.preview(op);
    return this.writer.write(op);
  }

  private reloadUnlessClosed(): void {
    if (!this.closed) {
      this.reader.reload();
    }
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
      this.states.emit(this.boardState(next));
    }
  }

  /** 閉じた後と書き込み中に読んだ結果は捨てる */
  private receive(read: ReadResult): void {
    if (!(this.closed || this.writer.isWriting())) {
      this.applyRead(read);
    }
  }

  /** 本文の解釈で起きた例外は読めなかったことにせず、onError へ渡す */
  private applyRead(read: ReadResult): void {
    if (!read) {
      if (!this.loaded) {
        this.states.emit(UNREADABLE);
      }
      return;
    }
    this.loaded = true;
    this.doc = read.body === undefined ? undefined : parseDocument(read.body);
    this.states.emit(this.doc ? this.boardState(this.doc) : MISSING);
  }

  /** タイマーが変わる操作の後は必ず読み直すので、タイマーはそのつど DayEditor から読めばよい */
  private boardState(doc: DayDocument): BoardState {
    return { kind: "board", ...toBoardView(doc, this.deps.editor.current(), this.dayKey) };
  }
}
