import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addTodo,
  addWork,
  applyToBody,
  completeCard,
  type DocumentCommand,
  isRejection,
  type LineRef,
  moveCard,
  removeWork,
  updateWork,
} from "@/domain/commands";
import { type DayDocument, parseDocument, type Status, type TodoBlock } from "@/domain/document";
import { markdownLike } from "./arbitraries";

const run = (body: string, command: DocumentCommand) => applyToBody(body, command);

/** n 番目の TODO ブロックを、その行の文字列とともに指す */
const card = (index: number, text: string): LineRef => ({ index, text });

const board = `---
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

const doing = card(0, "- [/] 提案資料の構成を固める [est:: 3]");
const review = card(1, "- [ ] API設計レビューの指摘に対応 [est:: 2]");
const reply = card(2, "- [ ] 見積もりの返信を書く [est:: 1]");
const expense = card(3, "- [x] 経費精算を提出 [est:: 小]");

describe("addTodo（M4）", () => {
  it("今日やるのいちばん下に追加する", () => {
    expect(run(board, (doc) => addTodo(doc, "打ち合わせのメモを整理", "1"))).toBe(`---
date: 2026-11-04
---
朝のメモ
- [/] 提案資料の構成を固める [est:: 3]
    - 25分 ポモドーロ
    参考: 前回の資料
- [ ] API設計レビューの指摘に対応 [est:: 2]
- [ ] 見積もりの返信を書く [est:: 1]
- [ ] 打ち合わせのメモを整理 [est:: 1]
- [x] 経費精算を提出 [est:: 小]
    - 12分 ポモドーロ
`);
  });

  it("今日やるが0件なら、最後の TODO ブロックの直後に追加する", () => {
    const body = "- [x] 経費精算を提出\n    - 12分 ポモドーロ\n末尾のメモ\n";

    expect(run(body, (doc) => addTodo(doc, "メールの返信"))).toBe(
      "- [x] 経費精算を提出\n    - 12分 ポモドーロ\n- [ ] メールの返信\n末尾のメモ\n",
    );
  });

  it("TODO が1件もなければ本文の末尾に追加する", () => {
    expect(
      run("---\ndate: 2026-11-04\n---\n朝のメモ\n", (doc) => addTodo(doc, "メールの返信")),
    ).toBe("---\ndate: 2026-11-04\n---\n朝のメモ\n- [ ] メールの返信\n");
  });

  it("空の本文に追加すると改行付きの1行になる", () => {
    expect(run("", (doc) => addTodo(doc, "メールの返信"))).toBe("- [ ] メールの返信\n");
  });

  it("名前の改行や前後の空白は1つの空白にまとめる", () => {
    expect(run("", (doc) => addTodo(doc, "  メールの \n 返信  "))).toBe("- [ ] メールの 返信\n");
  });

  it.each(["", "   ", "見積もりつき [est:: 1]"])("名前「%s」は追加しない", (name) => {
    expect(run(board, (doc) => addTodo(doc, name))).toEqual({ rejected: "invalid" });
  });
});

describe("moveCard（並べ替え・列の移動）", () => {
  it("列の中で並べ替えると、固定行と他のブロックはそのまま", () => {
    expect(run(board, (doc) => moveCard(doc, reply, "todo", 0))).toBe(`---
date: 2026-11-04
---
朝のメモ
- [/] 提案資料の構成を固める [est:: 3]
    - 25分 ポモドーロ
    参考: 前回の資料
- [ ] 見積もりの返信を書く [est:: 1]
- [ ] API設計レビューの指摘に対応 [est:: 2]
- [x] 経費精算を提出 [est:: 小]
    - 12分 ポモドーロ
`);
  });

  it("列を移すと記号が変わり、子の行とメモはそのカードの下に残る", () => {
    expect(run(board, (doc) => moveCard(doc, doing, "done", 0))).toBe(`---
date: 2026-11-04
---
朝のメモ
- [ ] API設計レビューの指摘に対応 [est:: 2]
- [ ] 見積もりの返信を書く [est:: 1]
- [x] 提案資料の構成を固める [est:: 3]
    - 25分 ポモドーロ
    参考: 前回の資料
- [x] 経費精算を提出 [est:: 小]
    - 12分 ポモドーロ
`);
  });

  it("着手中へ動かしたカードは元の位置のまま記号だけ変わり、前の着手中は今日やるの先頭へ戻る", () => {
    expect(run(board, (doc) => moveCard(doc, reply, "doing", 0))).toBe(`---
date: 2026-11-04
---
朝のメモ
- [ ] 提案資料の構成を固める [est:: 3]
    - 25分 ポモドーロ
    参考: 前回の資料
- [ ] API設計レビューの指摘に対応 [est:: 2]
- [/] 見積もりの返信を書く [est:: 1]
- [x] 経費精算を提出 [est:: 小]
    - 12分 ポモドーロ
`);
  });

  it("着手中のカードを着手中へ落としても本文は変わらない", () => {
    expect(run(board, (doc) => moveCard(doc, doing, "doing", 0))).toBe(board);
  });

  it("着手中が複数あれば、元の順番のまま今日やるの先頭へ戻る", () => {
    const body = "- [/] A\n- [/] B\n- [ ] C\n- [ ] D\n";

    expect(run(body, (doc) => moveCard(doc, card(3, "- [ ] D"), "doing", 0))).toBe(
      "- [ ] A\n- [ ] B\n- [ ] C\n- [/] D\n",
    );
  });

  it("移動先の列が空なら、最後の TODO ブロックの直後に入れる", () => {
    const body = "- [ ] メールの返信\n- [ ] 経費精算を提出\n末尾のメモ\n";

    expect(run(body, (doc) => moveCard(doc, card(0, "- [ ] メールの返信"), "done", 0))).toBe(
      "- [ ] 経費精算を提出\n- [x] メールの返信\n末尾のメモ\n",
    );
  });

  it("列の件数を超える位置は列の末尾になる", () => {
    const result = run(board, (doc) => moveCard(doc, review, "todo", 99));

    expect(result).toContain(
      "- [ ] 見積もりの返信を書く [est:: 1]\n- [ ] API設計レビューの指摘に対応 [est:: 2]\n",
    );
  });

  it("位置または行の文字列が一致しなければ何もしない", () => {
    expect(run(board, (doc) => moveCard(doc, card(1, reply.text), "done", 0))).toEqual({
      rejected: "stale",
    });
    expect(run(board, (doc) => moveCard(doc, card(9, reply.text), "done", 0))).toEqual({
      rejected: "stale",
    });
  });

  it("末尾に改行がない本文は、動かした後も末尾に改行を付けない", () => {
    const body = "- [ ] メールの返信\r\n- [ ] 経費精算を提出";

    expect(run(body, (doc) => moveCard(doc, card(1, "- [ ] 経費精算を提出"), "todo", 0))).toBe(
      "- [ ] 経費精算を提出\r\n- [ ] メールの返信",
    );
  });

  it("読み直すと frontmatter ができてしまう移動は、何もしない", () => {
    const body = "- [ ] a\n---\n---\n";

    expect(run(body, (doc) => moveCard(doc, card(0, "- [ ] a"), "todo", 0))).toEqual({
      rejected: "unstable",
    });
  });

  it("行末に \\r だけがある行に改行を足すときは、\\r を行の文字として残す", () => {
    const body = "- [ ] a\nメモ\r";

    expect(run(body, (doc) => moveCard(doc, card(0, "- [ ] a"), "todo", 0))).toBe(
      "メモ\r\r\n- [ ] a",
    );
  });

  it("末尾に改行がない本文でも、最後になった空行は改行を残して消さない", () => {
    const body = "- [ ] a\n\n- [ ] b";

    expect(run(body, (doc) => moveCard(doc, card(1, "- [ ] b"), "todo", 0))).toBe(
      "- [ ] b\n- [ ] a\n\n",
    );
  });
});

describe("completeCard（「完了にする」ボタン）", () => {
  it("完了の末尾に入れる", () => {
    const result = run(board, (doc) => completeCard(doc, review));

    expect(result).toContain(
      "- [x] 経費精算を提出 [est:: 小]\n    - 12分 ポモドーロ\n- [x] API設計レビューの指摘に対応 [est:: 2]\n",
    );
  });
});

describe("addWork / updateWork / removeWork（作業時間）", () => {
  it("作業時間をカードの最後の子の行として足す", () => {
    const result = run(board, (doc) =>
      addWork(doc, doing, { minutes: 12, kind: "中断", memo: "チャット" }),
    );

    expect(result).toContain("    参考: 前回の資料\n    - 12分 中断 チャット\n- [ ] API設計");
  });

  it("子の行がないカードにはスペース4つで足す", () => {
    const result = run(board, (doc) => addWork(doc, review, { minutes: 25, kind: "手動" }));

    expect(result).toContain("- [ ] API設計レビューの指摘に対応 [est:: 2]\n    - 25分 手動\n");
  });

  it("末尾に改行がない本文の最後のカードに足すと、前の行に改行を足す", () => {
    const body = "- [ ] メールの返信";

    expect(run(body, (doc) => addWork(doc, card(0, body), { minutes: 5, kind: "手動" }))).toBe(
      "- [ ] メールの返信\n    - 5分 手動",
    );
  });

  it.each([0, -1, 2.5, Number.NaN])("%d分は記録しない", (minutes) => {
    expect(run(board, (doc) => addWork(doc, review, { minutes, kind: "手動" }))).toEqual({
      rejected: "invalid",
    });
  });

  it("メモの改行は空白にまとめ、空のメモは書かない", () => {
    expect(
      run(board, (doc) =>
        addWork(doc, review, { minutes: 5, kind: "手動", memo: "午後\nまとめて" }),
      ),
    ).toContain("    - 5分 手動 午後 まとめて\n");
    expect(
      run(board, (doc) => addWork(doc, review, { minutes: 5, kind: "手動", memo: "  " })),
    ).toContain("    - 5分 手動\n");
  });

  it("作業時間を書き換えると、その行の字下げと位置を保ち、種類は手動になる", () => {
    const body = "- [x] メールの返信\n  - 25分 ポモドーロ\n  - 12分 中断 問い合わせ\n";
    const entry = { index: 1, text: "  - 12分 中断 問い合わせ" };

    expect(
      run(body, (doc) => updateWork(doc, card(0, "- [x] メールの返信"), entry, { minutes: 20 })),
    ).toBe("- [x] メールの返信\n  - 25分 ポモドーロ\n  - 20分 手動 問い合わせ\n");
  });

  it("作業時間のメモは、渡せば書き換え、空文字なら消す", () => {
    const body = "- [x] メールの返信\n  - 12分 中断 問い合わせ\n";
    const entry = { index: 0, text: "  - 12分 中断 問い合わせ" };
    const target = card(0, "- [x] メールの返信");

    expect(run(body, (doc) => updateWork(doc, target, entry, { minutes: 12, memo: "電話" }))).toBe(
      "- [x] メールの返信\n  - 12分 手動 電話\n",
    );
    expect(run(body, (doc) => updateWork(doc, target, entry, { minutes: 12, memo: "" }))).toBe(
      "- [x] メールの返信\n  - 12分 手動\n",
    );
  });

  it("書き換えた分数が書式にならなければ何もしない", () => {
    const entry = { index: 0, text: "    - 25分 ポモドーロ" };

    expect(run(board, (doc) => updateWork(doc, doing, entry, { minutes: 0 }))).toEqual({
      rejected: "invalid",
    });
  });

  it("作業時間を削除しても、書式外の子の行は残る", () => {
    const entry = { index: 0, text: "    - 25分 ポモドーロ" };

    expect(run(board, (doc) => removeWork(doc, doing, entry))).toContain(
      "- [/] 提案資料の構成を固める [est:: 3]\n    参考: 前回の資料\n- [ ]",
    );
  });

  it("作業時間の位置または文字列が一致しなければ何もしない", () => {
    const stale = { index: 0, text: "    - 20分 ポモドーロ" };

    expect(run(board, (doc) => removeWork(doc, doing, stale))).toEqual({ rejected: "stale" });
    expect(
      run(board, (doc) =>
        updateWork(doc, doing, { index: 1, text: "    参考: 前回の資料" }, { minutes: 5 }),
      ),
    ).toEqual({ rejected: "stale" });
    expect(
      run(board, (doc) => removeWork(doc, expense, { index: 0, text: "    - 25分 ポモドーロ" })),
    ).toEqual({ rejected: "stale" });
    expect(
      run(board, (doc) => addWork(doc, card(9, reply.text), { minutes: 5, kind: "手動" })),
    ).toEqual({
      rejected: "stale",
    });
  });
});

describe("コマンドの性質", () => {
  const status = fc.constantFrom<Status>("todo", "doing", "done");
  const position = fc.integer({ min: -1, max: 6 });

  /** 本文と、その中の TODO ブロックを1つ指す LineRef */
  const withCard = (bodies: fc.Arbitrary<string>) =>
    bodies
      .map((body) => ({ body, blocks: todoBlocksOf(parseDocument(body)) }))
      .filter(({ blocks }) => blocks.length > 0)
      .chain(({ body, blocks }) =>
        fc
          .nat({ max: blocks.length - 1 })
          .map((index) => ({ body, ref: card(index, blocks[index]?.head.text ?? "") })),
      );
  const bodyWithCard = withCard(markdownLike);
  const noFence = markdownLike.filter((body) => !body.includes("---"));
  /** --- を含まない本文と、その前に frontmatter を付けた本文（ふつうのファイルの形） */
  const plainBodyWithCard = withCard(
    fc.oneof(
      noFence,
      noFence.map((body) => `---\ndate: 2026-11-04\n---\n${body}`),
    ),
  );

  /** 動かした結果。対象は本文の中から選んでいるので、拒否されないはず */
  const moved = (body: string, ref: LineRef, to: Status, at: number) => {
    const next = moveCard(parseDocument(body), ref, to, at);
    if (isRejection(next)) {
      throw new Error(`拒否された: ${next.rejected}`);
    }
    return next;
  };

  it("並べ替え・列の移動の後も、固定行の並びと TODO の件数が変わらない", () => {
    fc.assert(
      fc.property(bodyWithCard, status, position, ({ body, ref }, to, at) => {
        const before = parseDocument(body);
        const after = moved(body, ref, to, at);

        expect(fixedTexts(after)).toEqual(fixedTexts(before));
        expect(todoBlocksOf(after)).toHaveLength(todoBlocksOf(before).length);
      }),
    );
  });

  it("並べ替え・列の移動の後も、各カードの子の行はそのカードの下にある", () => {
    fc.assert(
      fc.property(bodyWithCard, status, position, ({ body, ref }, to, at) => {
        const after = moved(body, ref, to, at);

        expect(childrenByCard(after)).toEqual(childrenByCard(parseDocument(body)));
      }),
    );
  });

  it("着手中へ動かした後、着手中はちょうど1件", () => {
    fc.assert(
      fc.property(bodyWithCard, position, ({ body, ref }, at) => {
        const doing = todoBlocksOf(moved(body, ref, "doing", at)).filter((b) =>
          b.head.text.startsWith("- [/]"),
        );

        expect(doing).toHaveLength(1);
      }),
    );
  });

  it("追加の後、TODO が1件増え、固定行の並びは変わらない", () => {
    fc.assert(
      fc.property(markdownLike, fc.string(), (body, name) => {
        const before = parseDocument(body);
        const after = addTodo(before, name);
        fc.pre(!isRejection(after));

        expect(fixedTexts(after as DayDocument)).toEqual(fixedTexts(before));
        expect(todoBlocksOf(after as DayDocument)).toHaveLength(todoBlocksOf(before).length + 1);
      }),
    );
  });

  it("ふつうの形の本文（frontmatter のありなし）では、並べ替え・列の移動は必ず書き込める", () => {
    fc.assert(
      fc.property(plainBodyWithCard, status, position, ({ body, ref }, to, at) => {
        const written = applyToBody(body, (doc) => moveCard(doc, ref, to, at));

        expect(written).toBeTypeOf("string");
      }),
    );
  });

  it("書き込んだ本文を読み直すと、コマンドの結果と同じ区切りになる", () => {
    fc.assert(
      fc.property(bodyWithCard, status, position, ({ body, ref }, to, at) => {
        const written = applyToBody(body, (doc) => moveCard(doc, ref, to, at));
        fc.pre(typeof written === "string");

        expect(lineTexts(parseDocument(written as string))).toEqual(
          lineTexts(moved(body, ref, to, at)),
        );
      }),
    );
  });
});

function todoBlocksOf(doc: DayDocument): TodoBlock[] {
  return doc.segments.filter((s): s is TodoBlock => s.kind === "todo");
}

function fixedTexts(doc: DayDocument): string[] {
  return doc.segments.flatMap((s) => (s.kind === "fixed" ? [s.line.text] : []));
}

/** カードの名前ごとの子の行。カードの並びに依存しないよう並べ替えて比べる */
function childrenByCard(doc: DayDocument): string[] {
  return todoBlocksOf(doc)
    .map((b) => JSON.stringify([b.head.text.slice(6), b.children.map((c) => c.text)]))
    .sort();
}

/** 区切りの種類と行の文字列（改行コードは含めない） */
function lineTexts(doc: DayDocument): string[][] {
  return doc.segments.map((s) =>
    s.kind === "todo" ? [s.head.text, ...s.children.map((c) => c.text)] : ["", s.line.text],
  );
}
