import { type Board, type RunningCard, runningCard, toBoard } from "@/domain/board";
import { type DayDocument, parseDocument } from "@/domain/document/body";
import { runningTarget, type Timer } from "@/domain/timer";

export type BoardState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "unreadable" }
  | { kind: "board"; board: Board; running?: RunningCard };

export const LOADING: BoardState = { kind: "loading" };
export const UNREADABLE: BoardState = { kind: "unreadable" };
const MISSING: BoardState = { kind: "missing" };

/** 計測中のカードは、この日のタイマーの対象が見つかったときだけ示す */
export function boardState(doc: DayDocument, timer: Timer, dayKey: string): BoardState {
  const board = toBoard(doc);
  const running = runningCard(board, runningTarget(timer, doc, dayKey));
  return running ? { kind: "board", board, running } : { kind: "board", board };
}

/** 読めた本文の解釈と、流す状態。ファイルがなければ本文はない。本文の解釈で起きた例外はそのまま投げる */
export function readState(
  body: string | undefined,
  timer: Timer,
  dayKey: string,
): { doc?: DayDocument; state: BoardState } {
  if (body === undefined) {
    return { state: MISSING };
  }
  const doc = parseDocument(body);
  return { doc, state: boardState(doc, timer, dayKey) };
}
