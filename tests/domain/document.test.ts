import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  childIndent,
  eventLines,
  formatTodoLine,
  formatWorkEntry,
  parseDocument,
  parseTodoLine,
  parseWorkEntry,
  type Segment,
  serializeDocument,
  type TodoBlock,
} from "@/domain/document";
import { markdownLike } from "./arbitraries";

const lf = (text: string) => ({ text, eol: "\n" });

/** 区切りごとの行の文字列だけを並べて、構造を見比べやすくする */
const shape = (segments: Segment[]) =>
  segments.map((s) =>
    s.kind === "todo"
      ? { todo: s.head.text, children: s.children.map((c) => c.text) }
      : { fixed: s.line.text },
  );

describe("parseDocument / serializeDocument", () => {
  it("空の本文を読んで書き戻すと空のまま", () => {
    const doc = parseDocument("");

    expect(doc).toEqual({ frontmatter: [], segments: [] });
    expect(serializeDocument(doc)).toBe("");
  });

  it("frontmatter を生の行のまま持つ", () => {
    const body = `---
date: 2026-11-04
---
- [ ] 見積もりの返信を書く
`;

    const doc = parseDocument(body);

    expect(doc.frontmatter).toEqual([lf("---"), lf("date: 2026-11-04"), lf("---")]);
    expect(shape(doc.segments)).toEqual([{ todo: "- [ ] 見積もりの返信を書く", children: [] }]);
  });

  it("閉じていない frontmatter は固定行として扱う", () => {
    const doc = parseDocument("---\ndate: 2026-11-04\n");

    expect(doc.frontmatter).toEqual([]);
    expect(doc.segments).toEqual([
      { kind: "fixed", line: lf("---") },
      { kind: "fixed", line: lf("date: 2026-11-04") },
    ]);
  });

  it("本文の途中の --- は frontmatter ではない", () => {
    const doc = parseDocument("朝のメモ\n---\n");

    expect(doc.frontmatter).toEqual([]);
    expect(shape(doc.segments)).toEqual([{ fixed: "朝のメモ" }, { fixed: "---" }]);
  });

  it("トップレベルの TODO 行と、深く字下げされた後続の行を1つの TODO ブロックにする", () => {
    const body = `- [x] メールの返信 [est:: 1]
    - 25分 ポモドーロ
\t参考メモ
- [ ] 経費精算を提出
`;

    const doc = parseDocument(body);

    expect(shape(doc.segments)).toEqual([
      { todo: "- [x] メールの返信 [est:: 1]", children: ["    - 25分 ポモドーロ", "\t参考メモ"] },
      { todo: "- [ ] 経費精算を提出", children: [] },
    ]);
  });

  it("空行で TODO ブロックが終わる", () => {
    const body = "- [ ] 経費精算を提出\n\n    離れたメモ\n";

    const doc = parseDocument(body);

    expect(shape(doc.segments)).toEqual([
      { todo: "- [ ] 経費精算を提出", children: [] },
      { fixed: "" },
      { fixed: "    離れたメモ" },
    ]);
  });

  it("TODO ブロックに属さない行は固定行になる", () => {
    const body = "朝のメモ\n- [ ] 経費精算を提出\n* [ ] 別の書式\n";

    const doc = parseDocument(body);

    expect(shape(doc.segments)).toEqual([
      { fixed: "朝のメモ" },
      { todo: "- [ ] 経費精算を提出", children: [] },
      { fixed: "* [ ] 別の書式" },
    ]);
  });

  it("CRLF と末尾の改行の有無を保つ", () => {
    const body = "---\r\ndate: 2026-11-04\r\n---\r\n- [ ] 経費精算を提出\r\n    - 5分 手動";

    const doc = parseDocument(body);

    expect(doc.frontmatter[0]).toEqual({ text: "---", eol: "\r\n" });
    expect(doc.segments[0]).toMatchObject({ children: [{ text: "    - 5分 手動", eol: "" }] });
    expect(serializeDocument(doc)).toBe(body);
  });

  it("どんな本文でも、読んでそのまま書き戻すと元と完全に一致する", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string({ unit: "grapheme" }), markdownLike), (body) => {
        expect(serializeDocument(parseDocument(body))).toBe(body);
      }),
    );
  });
});

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

describe("parseWorkEntry / formatWorkEntry", () => {
  it("字下げされた「{分}分 {種類} {メモ}」を作業時間として読む", () => {
    expect(parseWorkEntry("    - 12分 中断 チャットでの問い合わせ")).toEqual({
      indent: "    ",
      minutes: 12,
      kind: "中断",
      memo: "チャットでの問い合わせ",
    });
  });

  it("メモは省略できる", () => {
    expect(parseWorkEntry("\t- 120分 ポモドーロ")).toStrictEqual({
      indent: "\t",
      minutes: 120,
      kind: "ポモドーロ",
    });
  });

  it.each([
    "    - 25分 休憩",
    "    - 0分 手動",
    "    - 025分 手動",
    "    - 25分 手動 ",
    "- 25分 手動",
    "    - 25 分 手動",
    "    メモ - 5分 手動",
  ])("「%s」は作業時間ではない", (text) => {
    expect(parseWorkEntry(text)).toBeUndefined();
  });

  it.each([
    "    - 25分 ポモドーロ",
    "  - 12分 中断 チャットでの問い合わせ",
    "\t- 90分 手動 午後 まとめて",
  ])("「%s」を読んで組み立て直すと元の行と一致する", (text) => {
    const entry = parseWorkEntry(text);

    expect(entry && formatWorkEntry(entry)).toBe(text);
  });
});

describe("childIndent", () => {
  const blockOf = (body: string) => parseDocument(body).segments[0] as TodoBlock;

  it("既存の子の行の字下げに合わせる", () => {
    expect(childIndent(blockOf("- [ ] a\n\t- 5分 手動\n"))).toBe("\t");
    expect(childIndent(blockOf("- [ ] a\n  メモ\n"))).toBe("  ");
  });

  it("子の行がなければスペース4つ", () => {
    expect(childIndent(blockOf("- [ ] a\n"))).toBe("    ");
  });
});

describe("eventLines", () => {
  it("frontmatter の events の各項目を文字列として取り出す", () => {
    const doc = parseDocument(`---
date: 2026-11-04
events:
  - 10:00-11:00 定例
- 14:00-15:00 API設計レビュー
tags: []
---
`);

    expect(eventLines(doc)).toEqual(["10:00-11:00 定例", "14:00-15:00 API設計レビュー"]);
  });

  it("引用符で囲んだ項目は引用符を外す", () => {
    const doc = parseDocument(
      `---\nevents:\n  - "16:00-16:30 1on1"\n  - '17:00-17:30 振り返り'\n---\n`,
    );

    expect(eventLines(doc)).toEqual(["16:00-16:30 1on1", "17:00-17:30 振り返り"]);
  });

  it("events の後ろの空白は無視し、リストでない行で読み終わる", () => {
    const doc = parseDocument(
      "---\nevents:  \n  - 10:00-11:00 定例\ntags: a - b\n  - 12:00-13:00 昼\n---\n",
    );

    expect(eventLines(doc)).toEqual(["10:00-11:00 定例"]);
  });

  it("引用符が項目の一部にしかなければそのまま", () => {
    const doc = parseDocument(`---\nevents:\n  - 16:00-16:30 "1on1"\n  - "定例" の後\n---\n`);

    expect(eventLines(doc)).toEqual(['16:00-16:30 "1on1"', '"定例" の後']);
  });

  it("events がなければ空", () => {
    expect(eventLines(parseDocument("---\nsubevents:\n  - 10:00-11:00 定例\n---\n"))).toEqual([]);
    expect(eventLines(parseDocument("---\ndate: 2026-11-04\n---\n"))).toEqual([]);
    expect(eventLines(parseDocument("events:\n  - 10:00-11:00 定例\n"))).toEqual([]);
  });
});
