import { markdownLike } from "@tests/domain/document/arbitraries";
import fc from "fast-check";
import { applyToBody, type DocumentCommand, type LineRef } from "@/domain/commands/command";
import { type DayDocument, parseDocument, todoBlocks } from "@/domain/document/body";

export const run = (body: string, command: DocumentCommand) => applyToBody(body, command);

/** n 番目の TODO ブロックを、その行の文字列とともに指す */
export const card = (index: number, text: string): LineRef => ({ index, text });

export const board = `---
date: 2026-11-04
---
朝のメモ
- [/] 提案資料の構成を固める [est:: 3]
    - 25分 ポモドーロ
    参考: 前回の資料
- [ ] API設計レビューの指摘に対応 [est:: 2]
- [ ] 見積もりの返信を書く [est:: 1]
- [x] 経費精算を提出 [est:: 小]
    - 12分 ポモドーロ
`;

export const doing = card(0, "- [/] 提案資料の構成を固める [est:: 3]");
export const review = card(1, "- [ ] API設計レビューの指摘に対応 [est:: 2]");
export const reply = card(2, "- [ ] 見積もりの返信を書く [est:: 1]");
export const expense = card(3, "- [x] 経費精算を提出 [est:: 小]");

/** 本文と、その中の TODO ブロックを1つ指す LineRef */
export const withCard = (bodies: fc.Arbitrary<string>) =>
  bodies
    .map((body) => ({ body, blocks: todoBlocks(parseDocument(body).segments) }))
    .filter(({ blocks }) => blocks.length > 0)
    .chain(({ body, blocks }) =>
      fc
        .nat({ max: blocks.length - 1 })
        .map((index) => ({ body, ref: card(index, blocks[index]?.head.text ?? "") })),
    );
export const bodyWithCard = withCard(markdownLike);

export function fixedTexts(doc: DayDocument): string[] {
  return doc.segments.flatMap((s) => (s.kind === "fixed" ? [s.line.text] : []));
}
