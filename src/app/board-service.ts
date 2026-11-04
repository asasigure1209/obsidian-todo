import { type Board, toBoard } from "@/domain/board";
import type { DayFiles } from "@/domain/day-files";
import { parseDocument } from "@/domain/document";

export type BoardState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "board"; board: Board };

/** Svelte のストアの約束と同じ形。subscribe はすぐに今の値を渡し、戻り値で購読をやめる */
export interface Readable<T> {
  subscribe(run: (value: T) => void): () => void;
}

const LOADING: BoardState = { kind: "loading" };
const MISSING: BoardState = { kind: "missing" };

/**
 * その日のボードを、ファイルが変わるたびに読み直して渡す（AD-2）。
 * 読み込みは非同期で追い越されることがあるので、最後に始めた読み込みの結果だけを渡す
 */
export function watchBoard(files: DayFiles, dayKey: string): Readable<BoardState> {
  return {
    subscribe(run) {
      let latest = 0;
      const reload = async () => {
        const current = ++latest;
        const state = await readState(files, dayKey);
        if (state && current === latest) {
          run(state);
        }
      };
      run(LOADING);
      const stopListening = files.onChange(dayKey, reload);
      void reload();
      return () => {
        latest = Number.NaN;
        stopListening();
      };
    },
  };
}

/** 読めなかったときは undefined にして、前の状態のまま次の変更を待つ */
async function readState(files: DayFiles, dayKey: string): Promise<BoardState | undefined> {
  try {
    const body = await files.read(dayKey);
    return body === undefined ? MISSING : { kind: "board", board: toBoard(parseDocument(body)) };
  } catch {
    return undefined;
  }
}
