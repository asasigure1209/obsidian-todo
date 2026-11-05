import { describe, expect, it } from "vitest";
import { parseDocument } from "@/domain/document/body";
import { eventLines } from "@/domain/document/events";

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
