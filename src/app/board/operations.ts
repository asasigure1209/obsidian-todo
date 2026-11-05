import type { LineRef } from "@/domain/commands/command";
import { editWork, type WorkEdits } from "@/domain/commands/work";
import type { EditKind } from "@/domain/day";
import type { Status } from "@/domain/document/todo-line";
import type { TimerOp } from "@/domain/timer";

/** ボードからの操作1回。kind はその日にできるかの区分（design 8.3）、op は書き込むタイマーの遷移 */
export interface BoardEdit {
  kind: EditKind;
  op: TimerOp;
}

/** ボードの操作ごとの区分と遷移。「次のポモドーロを開始」はカードを着手中へ戻すので、移動と同じ区分にする */
export const boardEdits = {
  move: (card: LineRef, status: Status, position: number): BoardEdit => ({
    kind: "move",
    op: { kind: "move", card, status, position },
  }),
  complete: (card: LineRef): BoardEdit => ({ kind: "complete", op: { kind: "complete", card } }),
  interrupt: (): BoardEdit => ({ kind: "interrupt", op: { kind: "interrupt" } }),
  next: (card: LineRef): BoardEdit => ({ kind: "move", op: { kind: "next", card } }),
  editWork: (card: LineRef, edits: WorkEdits): BoardEdit => ({
    kind: "work",
    op: { kind: "edit", command: (doc) => editWork(doc, card, edits) },
  }),
};
