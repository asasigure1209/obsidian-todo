import { describe, expect, it } from "vitest";
import { parseDocument, type TodoBlock } from "@/domain/document";
import { childIndent, formatWorkEntry, parseWorkEntry } from "@/domain/work-entry";

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
