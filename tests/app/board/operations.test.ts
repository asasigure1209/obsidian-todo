import { describe, expect, it } from "vitest";
import { boardEdits } from "@/app/board/operations";
import { editWork } from "@/domain/commands/work";
import { parseDocument } from "@/domain/document/body";

const card = { index: 0, text: "- [/] 提案資料" };

describe("boardEdits", () => {
  it("カードの移動は「移動」として、移動の遷移を渡す", () => {
    expect(boardEdits.move(card, "done", 0)).toEqual({
      kind: "move",
      op: { kind: "move", card, status: "done", position: 0 },
    });
  });

  it("「完了にする」と「中断」は、それぞれの区分と遷移を渡す", () => {
    expect(boardEdits.complete(card)).toEqual({ kind: "complete", op: { kind: "complete", card } });
    expect(boardEdits.interrupt()).toEqual({ kind: "interrupt", op: { kind: "interrupt" } });
  });

  it("「次のポモドーロを開始」は移動と同じく、過去の日にはできない区分になる", () => {
    expect(boardEdits.next(card)).toEqual({ kind: "move", op: { kind: "next", card } });
  });

  it("作業時間の修正は「作業時間」の区分で、作業時間のコマンドを当てる", () => {
    const doc = parseDocument("- [/] 提案資料\n");
    const edits = { updated: [], removed: [], added: [25] };
    const { kind, op } = boardEdits.editWork(card, edits);
    expect(kind).toBe("work");
    expect(op.kind === "edit" && op.command(doc)).toEqual(editWork(doc, card, edits));
  });
});
