import { type Board, toBoard } from "@/domain/board";
import type { DayFiles } from "@/domain/day-files";
import { parseDocument } from "@/domain/document";

export type BoardState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "unreadable" }
  | { kind: "board"; board: Board };

/** Svelte のストアの約束と同じ形。subscribe はすぐに今の値を渡し、戻り値で購読をやめる */
export interface Readable<T> {
  subscribe(run: (value: T) => void): () => void;
}

const LOADING: BoardState = { kind: "loading" };
const MISSING: BoardState = { kind: "missing" };
const UNREADABLE: BoardState = { kind: "unreadable" };

/**
 * その日のボードを、ファイルが変わるたびに読み直して渡す（AD-2）。
 * - 読み込みは非同期で追い越されることがあるので、最後に始めた読み込みの結果だけを渡す
 * - 読めなかったときは前の状態のまま次の変更を待つ。まだ何も読めていなければ、読めなかったことを渡す
 * - 受け取る側の例外は onError に渡し、次の変更も受け取れるようにする
 */
export function watchBoard(
  files: DayFiles,
  dayKey: string,
  onError: (error: unknown) => void,
): Readable<BoardState> {
  return {
    subscribe(run) {
      let latest = 0;
      let loaded = false;
      let stopped = false;
      const load = async () => {
        const current = ++latest;
        const next = await nextState(files, dayKey, loaded);
        if (next && !stopped && current === latest) {
          loaded = true;
          run(next);
        }
      };
      const reload = () => {
        load().catch(onError);
      };
      run(LOADING);
      const stopListening = files.onChange(dayKey, reload);
      reload();
      return () => {
        stopped = true;
        stopListening();
      };
    },
  };
}

/**
 * 読めなかったときは、まだ何も読めていなければ読めなかったことを、読めていれば undefined（前の状態のまま）を返す。
 * 本文の解釈で起きた例外は読めなかったことにせず、呼び出し元の onError へ渡す
 */
async function nextState(
  files: DayFiles,
  dayKey: string,
  loaded: boolean,
): Promise<BoardState | undefined> {
  const read = await tryRead(files, dayKey);
  if (!read) {
    return loaded ? undefined : UNREADABLE;
  }
  return read.body === undefined
    ? MISSING
    : { kind: "board", board: toBoard(parseDocument(read.body)) };
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
