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
      let last = LOADING;
      const load = async () => {
        const current = ++latest;
        const next = await nextState(files, dayKey, last);
        if (next && current === latest) {
          last = next;
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
        latest = Number.NaN;
        stopListening();
      };
    },
  };
}

/** 読めなかったとき、まだ何も読めていなければ読めなかったことを、読めていれば undefined（前の状態のまま）を返す */
async function nextState(
  files: DayFiles,
  dayKey: string,
  last: BoardState,
): Promise<BoardState | undefined> {
  return (await readState(files, dayKey)) ?? (last === LOADING ? UNREADABLE : undefined);
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
