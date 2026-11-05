import { describe, expect, it } from "vitest";
import { formatTodoLine, parseTodoLine } from "@/domain/document/todo-line";

describe("parseTodoLine / formatTodoLine", () => {
  it("状態の記号を 今日やる・着手中・完了 として読む", () => {
    expect(parseTodoLine("- [ ] a")?.status).toBe("todo");
    expect(parseTodoLine("- [/] a")?.status).toBe("doing");
    expect(parseTodoLine("- [x] a")?.status).toBe("done");
  });

  it("行末の [est:: 値] を見積もりとして読む", () => {
    expect(parseTodoLine("- [ ] 提案資料の構成を固める [est:: 3]")).toEqual({
      status: "todo",
      name: "提案資料の構成を固める",
      estimate: "3",
    });
    expect(parseTodoLine("- [x] 経費精算を提出 [est:: 小]")?.estimate).toBe("小");
  });

  it("見積もりを省略した TODO は見積もりなし", () => {
    expect(parseTodoLine("- [ ] 経費精算を提出")).toStrictEqual({
      status: "todo",
      name: "経費精算を提出",
    });
  });

  it("書式外の見積もりは名前の一部として読む", () => {
    expect(parseTodoLine("- [ ] 経費精算を提出 [est:: 5]")?.name).toBe("経費精算を提出 [est:: 5]");
  });

  it.each([
    "- [X] 大文字",
    "- [-] 取り消し",
    "* [ ] アスタリスク",
    "1. [ ] 番号",
    "  - [ ] 字下げ",
    "- [ ]",
    "- [ ]  ",
  ])("「%s」は TODO 行ではない", (text) => {
    expect(parseTodoLine(text)).toBeUndefined();
  });

  it.each(["- [ ] 経費精算を提出", "- [/] 提案資料の構成を固める [est:: 3]", "- [x] 末尾に空白 "])(
    "「%s」を読んで組み立て直すと元の行と一致する",
    (text) => {
      const todo = parseTodoLine(text);

      expect(todo && formatTodoLine(todo)).toBe(text);
    },
  );
});
