import { markdownLike } from "@tests/domain/document/arbitraries";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addTodo, completeCard, moveCard } from "@/domain/commands/card";
import { applyToBody, isRejection, type LineRef } from "@/domain/commands/command";
import { type DayDocument, parseDocument, todoBlocks } from "@/domain/document/body";
import type { Status } from "@/domain/document/todo-line";
import {
  board,
  bodyWithCard,
  card,
  doing,
  fixedTexts,
  reply,
  review,
  run,
  withCard,
} from "./fixtures";

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

describe("コマンドの性質", () => {
  const status = fc.constantFrom<Status>("todo", "doing", "done");
  const position = fc.integer({ min: -1, max: 6 });

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
        expect(todoBlocks(after.segments)).toHaveLength(todoBlocks(before.segments).length);
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
        const doing = todoBlocks(moved(body, ref, "doing", at).segments).filter((b) =>
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
        expect(todoBlocks((after as DayDocument).segments)).toHaveLength(
          todoBlocks(before.segments).length + 1,
        );
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

/** カードの名前ごとの子の行。カードの並びに依存しないよう並べ替えて比べる */
function childrenByCard(doc: DayDocument): string[] {
  return todoBlocks(doc.segments)
    .map((b) => JSON.stringify([b.head.text.slice(6), b.children.map((c) => c.text)]))
    .sort();
}

/** 区切りの種類と行の文字列（改行コードは含めない） */
function lineTexts(doc: DayDocument): string[][] {
  return doc.segments.map((s) =>
    s.kind === "todo" ? [s.head.text, ...s.children.map((c) => c.text)] : ["", s.line.text],
  );
}
