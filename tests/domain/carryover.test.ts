import { markdownLike } from "@tests/domain/document/arbitraries";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { carryOver, latestDayBefore } from "@/domain/carryover";
import { parseDocument, serializeDocument, todoBlocks } from "@/domain/document/body";
import { parseWorkEntry, workLines } from "@/domain/document/work-entry";

const today = "2026-11-11";

describe("latestDayBefore：直近の過去ファイル", () => {
  it("今日より前の日付のファイルのうち、いちばん新しい日を選ぶ（週末を挟んでも）", () => {
    const names = ["2026-11-05.md", "2026-11-06.md", "2026-11-02.md"];

    expect(latestDayBefore(names, "2026-11-09")).toBe("2026-11-06");
  });

  it("今日と未来の日付のファイルは選ばない", () => {
    const names = ["2026-11-10.md", "2026-11-11.md", "2026-11-12.md"];

    expect(latestDayBefore(names, today)).toBe("2026-11-10");
  });

  it("YYYY-MM-DD.md でない名前と、ありえない日付は選ばない", () => {
    const names = [
      "2026-11-01.md",
      "2026-11-10.txt",
      "2026-11-10.js",
      "2026-11-10.md.bak",
      "x2026-11-10.md",
      "2026-11-1.md",
      "2026-02-30.md",
      "2026-11-00.md",
      "メモ.md",
    ];

    expect(latestDayBefore(names, today)).toBe("2026-11-01");
  });

  it("過去のファイルがなければ undefined", () => {
    expect(latestDayBefore([], today)).toBeUndefined();
    expect(latestDayBefore(["2026-11-11.md", "メモ.md"], today)).toBeUndefined();
  });
});

describe("carryOver：今日のファイルの本文", () => {
  it("frontmatter の date に今日を書く", () => {
    expect(carryOver("- [ ] a\n", today)).toBe(`---
date: 2026-11-11
---
- [ ] a
`);
  });

  it("[ ] と [/] の TODO を順番どおりに複製し、記号を [ ] に戻す", () => {
    const previous = `- [ ] API設計レビューの指摘に対応
- [/] 提案資料の構成を固める
- [ ] 見積もりの返信を書く
`;

    expect(carryOver(previous, today)).toBe(`---
date: 2026-11-11
---
- [ ] API設計レビューの指摘に対応
- [ ] 提案資料の構成を固める
- [ ] 見積もりの返信を書く
`);
  });

  it("見積もりを残す", () => {
    const previous = "- [/] 提案資料の構成を固める [est:: 3]\n- [ ] 経費精算 [est:: 小]\n";

    expect(carryOver(previous, today)).toBe(`---
date: 2026-11-11
---
- [ ] 提案資料の構成を固める [est:: 3]
- [ ] 経費精算 [est:: 小]
`);
  });

  it("作業時間の子の行は複製せず、作業時間ではない子の行（メモ）は複製する", () => {
    const previous = `- [/] 提案資料の構成を固める [est:: 3]
    - 25分 ポモドーロ
    - 参考：前回の資料
\t- 12分 中断 チャットでの問い合わせ
\t  続きは3章から
    - 10分 手動
`;

    expect(carryOver(previous, today)).toBe(`---
date: 2026-11-11
---
- [ ] 提案資料の構成を固める [est:: 3]
    - 参考：前回の資料
\t  続きは3章から
`);
  });

  it("完了・frontmatter・書式外の行は複製しない", () => {
    const previous = `---
date: 2026-11-10
events:
  - 10:00-11:00 定例
---
# 朝のメモ
- [x] 経費精算を提出 [est:: 小]
    - 12分 ポモドーロ
    完了のメモ
- [X] 大文字の完了
* [ ] 星のチェックボックス

- [ ] 見積もりの返信を書く
`;

    expect(carryOver(previous, today)).toBe(`---
date: 2026-11-11
---
- [ ] 見積もりの返信を書く
`);
  });

  it("過去のファイルがない（空の本文）ときは frontmatter だけ", () => {
    expect(carryOver("", today)).toBe("---\ndate: 2026-11-11\n---\n");
  });

  it("未完了が0件のときも frontmatter だけ", () => {
    expect(carryOver("- [x] 経費精算を提出\n", today)).toBe("---\ndate: 2026-11-11\n---\n");
  });

  it("改行は過去のファイルに合わせる", () => {
    const previous = "- [ ] a\r\n    メモ\r\n- [ ] b";

    expect(carryOver(previous, today)).toBe(
      "---\r\ndate: 2026-11-11\r\n---\r\n- [ ] a\r\n    メモ\r\n- [ ] b\r\n",
    );
  });
  it("性質：未完了の TODO を元の順番で、名前・見積もり・メモとともに [ ] として持つ", () => {
    fc.assert(
      fc.property(markdownLike, (previous) => {
        const expected = todoBlocks(parseDocument(previous).segments)
          .filter((block) => block.todo.status !== "done")
          .map((block) => ({
            todo: { ...block.todo, status: "todo" },
            memos: block.children
              .map((line) => line.text)
              .filter((text) => parseWorkEntry(text) === undefined),
          }));

        const copied = parseDocument(carryOver(previous, today)).segments.map((segment) =>
          segment.kind === "todo"
            ? { todo: segment.todo, memos: segment.children.map((line) => line.text) }
            : segment,
        );

        expect(copied).toEqual(expected);
      }),
    );
  });

  it("性質：frontmatter は date だけで、作業時間の行と完了が残らない", () => {
    fc.assert(
      fc.property(markdownLike, (previous) => {
        const doc = parseDocument(carryOver(previous, today));

        expect(doc.frontmatter.map((line) => line.text)).toEqual(["---", `date: ${today}`, "---"]);
        for (const block of todoBlocks(doc.segments)) {
          expect(block.todo.status).toBe("todo");
          expect(workLines(block)).toEqual([]);
        }
      }),
    );
  });

  it("性質：読んでそのまま書き戻すと一致する", () => {
    fc.assert(
      fc.property(markdownLike, (previous) => {
        const body = carryOver(previous, today);

        expect(serializeDocument(parseDocument(body))).toBe(body);
      }),
    );
  });
});
