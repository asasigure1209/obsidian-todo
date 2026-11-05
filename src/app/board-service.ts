import { type Board, toBoard } from "@/domain/board";
import type { Clock } from "@/domain/clock";
import {
  applyToBody,
  type DocumentCommand,
  isRejection,
  type LineRef,
  moveCard,
  type Rejection,
} from "@/domain/commands";
import { canEdit, type EditKind, toDayKey } from "@/domain/day";
import type { DayFiles } from "@/domain/day-files";
import { type DayDocument, parseDocument, type Status } from "@/domain/document";
import type { Notifier } from "@/domain/notifier";

export type BoardState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "unreadable" }
  | { kind: "board"; board: Board };

/** Svelte のストアの約束と同じ形。subscribe はすぐに今の値を渡し、戻り値で購読をやめる */
export interface Readable<T> {
  subscribe(run: (value: T) => void): () => void;
}

/** 1日のボードの窓口。表示する状態と、ボードからの操作をまとめて持つ */
export interface BoardSession extends Readable<BoardState> {
  /** カードを列の中の位置へ動かす（design 8.6）。書き込みが終わると解決する */
  move(card: LineRef, status: Status, position: number): Promise<void>;
  /** 変更の購読をやめ、以後の読み込みと操作を何もしない */
  close(): void;
}

export interface BoardDeps {
  files: DayFiles;
  clock: Clock;
  notifier: Notifier;
  /** 受け取る側や本文の解釈で起きた例外の行き先 */
  onError: (error: unknown) => void;
}

const LOADING: BoardState = { kind: "loading" };
const MISSING: BoardState = { kind: "missing" };
const UNREADABLE: BoardState = { kind: "unreadable" };

const REJECTION_MESSAGES: Record<Rejection["rejected"], string> = {
  stale: "ファイルが変わっていたので、操作を取りやめて読み直しました",
  invalid: "入力が書式に合わないため、追加・変更しませんでした",
  unstable: "この操作をするとファイルの区切りが変わるため、取りやめました",
};
const PAST_DAY_MESSAGE = "過去の日は、作業時間の修正だけができます";
const MISSING_MESSAGE = "今日のファイルがありません";

export function openBoard(deps: BoardDeps, dayKey: string): BoardSession {
  return new Session(deps, dayKey);
}

/**
 * - ファイルが変わるたびに読み直して流す（AD-2）。読み込みは追い越されることがあるので、最後に始めた読み込みの結果だけを使う
 * - 読めなかったときは前の状態のまま次の変更を待つ。まだ何も読めていなければ、読めなかったことを流す
 * - 操作は、最後に読んだ本文に当てた結果をすぐに流してから（先読み）、最新の本文に当てて書き込む（AD-3）。
 *   書き込みは1本に並べて順番に行い、終わるまでは読み直しの結果を捨てる。並びが空いたら読み直す
 */
class Session implements BoardSession {
  private state = LOADING;
  private doc: DayDocument | undefined;
  private loaded = false;
  private closed = false;
  private latest = 0;
  private pendingWrites = 0;
  private writes: Promise<void> = Promise.resolve();
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
    return this.edit("move", (doc) => moveCard(doc, card, status, position));
  }

  close(): void {
    this.closed = true;
    this.stopListening();
  }

  private edit(kind: EditKind, command: DocumentCommand): Promise<void> {
    if (this.closed) {
      return Promise.resolve();
    }
    if (!canEdit(kind, this.dayKey, toDayKey(this.deps.clock.now()))) {
      this.deps.notifier.notify(PAST_DAY_MESSAGE);
      return Promise.resolve();
    }
    this.preview(command);
    this.pendingWrites++;
    this.writes = this.writes.then(() => this.write(command)).catch(this.deps.onError);
    return this.writes;
  }

  /** 断られる操作は先読みしない。書き込みで改めて断られ、そこで知らせる */
  private preview(command: DocumentCommand): void {
    const next = this.doc && command(this.doc);
    if (next && !isRejection(next)) {
      this.doc = next;
      this.emit(toState(next));
    }
  }

  private async write(command: DocumentCommand): Promise<void> {
    try {
      const message = await writeCommand(this.deps.files, this.dayKey, command);
      if (message) {
        this.deps.notifier.notify(message);
      }
    } finally {
      // 書き込みが残っているうちの読み直しは load が捨てるので、毎回読み直してよい
      this.pendingWrites--;
      this.reload();
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
    this.emit(this.doc ? toState(this.doc) : MISSING);
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

function toState(doc: DayDocument): BoardState {
  return { kind: "board", board: toBoard(doc) };
}

/** 書き込んで、知らせることがあればその文言を返す */
async function writeCommand(
  files: DayFiles,
  dayKey: string,
  command: DocumentCommand,
): Promise<string | undefined> {
  let rejection: Rejection | undefined;
  const found = await files.process(dayKey, (body) => {
    const next = applyToBody(body, command);
    rejection = typeof next === "string" ? undefined : next;
    return typeof next === "string" ? next : body;
  });
  if (!found) {
    return MISSING_MESSAGE;
  }
  return rejection && REJECTION_MESSAGES[rejection.rejected];
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
