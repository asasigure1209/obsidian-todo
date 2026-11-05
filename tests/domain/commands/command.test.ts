import { describe, expect, it } from "vitest";
import { addTodo } from "@/domain/commands/card";
import { isRejection } from "@/domain/commands/command";
import { parseDocument } from "@/domain/document/body";
import { board, run } from "./fixtures";

describe("isRejection", () => {
  it("書き戻した本文は断りではない。断りの理由を持つものだけが断り", () => {
    expect(isRejection(run(board, (doc) => addTodo(doc, "a")))).toBe(false);
    expect(isRejection(run(board, (doc) => addTodo(doc, "")))).toBe(true);
    expect(isRejection(parseDocument(board))).toBe(false);
  });
});
