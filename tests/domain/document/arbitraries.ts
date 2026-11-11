import fc from "fast-check";
import type { Estimate } from "@/domain/document/todo-line";

/** TODO・作業時間・frontmatter・書式外の行が混ざりやすい本文 */
export const markdownLike = fc
  .array(
    fc.tuple(
      fc.oneof(
        fc.constantFrom("---", "events:", "  - 10:00-11:00 定例", "", "  ", "\t", "メモ"),
        fc.constantFrom("- [ ] a", "- [/] b [est:: 2]", "- [x] c [est:: 小]", "- [X] d", "* [ ] e"),
        fc.constantFrom("    - 25分 ポモドーロ", "\t- 3分 中断 割り込み", "  字下げメモ", "\r"),
        fc.constantFrom("        深いメモ", "\t  タブの深いメモ", "        - 5分 手動"),
        fc.string(),
      ),
      fc.constantFrom("\n", "\r\n", ""),
    ),
  )
  .map((lines) => lines.map(([text, eol]) => text + eol).join(""));

/** 見積もり（design 7.5）。省略もある */
export const estimate = fc.option(fc.constantFrom<Estimate>("小", "1", "2", "3", "4"), {
  nil: undefined,
});
