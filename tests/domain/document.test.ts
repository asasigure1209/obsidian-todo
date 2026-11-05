import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseDocument, type Segment, serializeDocument } from "@/domain/document";
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

    expect(doc).toEqual({ frontmatter: [], segments: [], eol: "\n", endsWithEol: true });
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

  it("改行が空の行は、本文で最初に使われている改行を付けて書き戻す", () => {
    const doc = parseDocument("---\r\n---\r\n- [ ] a");
    const added = { kind: "fixed" as const, line: { text: "メモ", eol: "" } };

    expect(serializeDocument({ ...doc, segments: [added, ...doc.segments] })).toBe(
      "---\r\n---\r\nメモ\r\n- [ ] a",
    );
  });

  it("末尾に改行がない本文でも、最後の行が空行なら改行を付ける", () => {
    const doc = parseDocument("- [ ] a\n\n- [ ] b");
    const [a, blank] = doc.segments;

    expect(serializeDocument({ ...doc, segments: [a, blank] as Segment[] })).toBe("- [ ] a\n\n");
  });

  it("行末に \\r だけがある行を途中に置くと、\\r を行の文字として残す", () => {
    const doc = parseDocument("- [ ] a\nメモ\r");
    const [a, memo] = doc.segments;

    expect(serializeDocument({ ...doc, segments: [memo, a] as Segment[] })).toBe(
      "メモ\r\r\n- [ ] a",
    );
  });

  it("どんな本文でも、読んでそのまま書き戻すと元と完全に一致する", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string({ unit: "grapheme" }), markdownLike), (body) => {
        expect(serializeDocument(parseDocument(body))).toBe(body);
      }),
    );
  });
});
