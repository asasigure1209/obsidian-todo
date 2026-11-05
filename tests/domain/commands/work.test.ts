import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isRejection, type LineRef } from "@/domain/commands/command";
import { addWork, editWork, type WorkEdits } from "@/domain/commands/work";
import { parseDocument, todoBlocks } from "@/domain/document/body";
import { parseWorkEntry } from "@/domain/document/work-entry";
import {
  board,
  bodyWithCard,
  card,
  doing,
  expense,
  fixedTexts,
  reply,
  review,
  run,
} from "./fixtures";

describe("addWork（作業時間を足す）", () => {
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

  it("作業時間を足すカードの位置または文字列が一致しなければ何もしない", () => {
    expect(
      run(board, (doc) => addWork(doc, card(9, reply.text), { minutes: 5, kind: "手動" })),
    ).toEqual({
      rejected: "stale",
    });
  });
});

describe("editWork（M2 の保存）", () => {
  const mail = card(0, "- [x] メールの返信");
  const body = `- [x] メールの返信
    - 25分 ポモドーロ
    - 12分 中断 問い合わせ
    メモ
    - 25分 ポモドーロ
`;
  const entry = (index: number, text: string): LineRef => ({ index, text: `    - ${text}` });
  const noEdits: WorkEdits = { updated: [], removed: [], added: [] };
  const updated = (ref: LineRef, minutes: number): WorkEdits => ({
    ...noEdits,
    updated: [{ entry: ref, minutes }],
  });

  it("分数を書き換えると、その行の字下げと位置とメモを保ち、種類は手動になる", () => {
    const text = "- [x] メールの返信\n  - 25分 ポモドーロ\n  - 12分 中断 問い合わせ\n";
    const ref = { index: 1, text: "  - 12分 中断 問い合わせ" };

    expect(run(text, (doc) => editWork(doc, mail, updated(ref, 20)))).toBe(
      "- [x] メールの返信\n  - 25分 ポモドーロ\n  - 20分 手動 問い合わせ\n",
    );
  });

  it("分数を変えずに書き換えたときは、種類を変えない", () => {
    expect(
      run(body, (doc) => editWork(doc, mail, updated(entry(1, "12分 中断 問い合わせ"), 12))),
    ).toBe(body);
  });

  it("書き換えた分数や足した分数が書式にならなければ何もしない", () => {
    expect(
      run(body, (doc) => editWork(doc, mail, updated(entry(0, "25分 ポモドーロ"), 0))),
    ).toEqual({ rejected: "invalid" });
    expect(run(body, (doc) => editWork(doc, mail, { ...noEdits, added: [2.5] }))).toEqual({
      rejected: "invalid",
    });
  });

  it("作業時間を削除しても、書式外の子の行は残る", () => {
    const removed = { ...noEdits, removed: [entry(0, "25分 ポモドーロ")] };

    expect(run(board, (doc) => editWork(doc, doing, removed))).toContain(
      "- [/] 提案資料の構成を固める [est:: 3]\n    参考: 前回の資料\n- [ ]",
    );
  });

  it("作業時間の文字列が一致しなければ何もしない", () => {
    const removed = { ...noEdits, removed: [entry(0, "25分 ポモドーロ")] };

    expect(run(board, (doc) => editWork(doc, expense, removed))).toEqual({ rejected: "stale" });
  });

  it("書式外の子の行は、作業時間の位置として数えない", () => {
    expect(
      run(board, (doc) =>
        editWork(doc, doing, updated({ index: 1, text: "    参考: 前回の資料" }, 5)),
      ),
    ).toEqual({ rejected: "stale" });
  });

  it("分数の書き換え・削除・追加を1回の変更にまとめる", () => {
    const edits: WorkEdits = {
      updated: [{ entry: entry(2, "25分 ポモドーロ"), minutes: 20 }],
      removed: [entry(1, "12分 中断 問い合わせ")],
      added: [5, 15],
    };

    expect(run(body, (doc) => editWork(doc, mail, edits))).toBe(`- [x] メールの返信
    - 25分 ポモドーロ
    メモ
    - 20分 手動
    - 5分 手動
    - 15分 手動
`);
  });

  it("前にある記録を消しても、後ろの記録の書き換えや削除は当たる", () => {
    const edits: WorkEdits = {
      ...noEdits,
      removed: [entry(0, "25分 ポモドーロ"), entry(2, "25分 ポモドーロ")],
      updated: [{ entry: entry(1, "12分 中断 問い合わせ"), minutes: 10 }],
    };

    expect(run(body, (doc) => editWork(doc, mail, edits))).toBe(`- [x] メールの返信
    - 10分 手動 問い合わせ
    メモ
`);
  });

  it("開いた後に足された記録（タイマーの記録）は、そのまま残る", () => {
    const later = `${body}    - 25分 ポモドーロ\n`;
    const edits: WorkEdits = { ...noEdits, removed: [entry(2, "25分 ポモドーロ")], added: [5] };

    expect(run(later, (doc) => editWork(doc, mail, edits))).toBe(`- [x] メールの返信
    - 25分 ポモドーロ
    - 12分 中断 問い合わせ
    メモ
    - 25分 ポモドーロ
    - 5分 手動
`);
  });

  it("1つでも位置や文字列が一致しなければ、全体を何もしない", () => {
    const edits: WorkEdits = {
      updated: [{ entry: entry(0, "25分 ポモドーロ"), minutes: 20 }],
      removed: [entry(1, "12分 中断 電話")],
      added: [5],
    };

    expect(run(body, (doc) => editWork(doc, mail, edits))).toEqual({ rejected: "stale" });
    expect(run(body, (doc) => editWork(doc, card(0, "- [ ] メールの返信"), noEdits))).toEqual({
      rejected: "stale",
    });
  });

  it("変更が空なら本文は変わらない", () => {
    expect(run(body, (doc) => editWork(doc, mail, noEdits))).toBe(body);
  });
});

describe("作業時間のコマンドの性質", () => {
  /** 本文と、その中のカードを1つ、そのカードの作業時間の記録への変更とともに */
  const bodyWithWorkEdits = bodyWithCard.chain(({ body, ref }) => {
    const entries = todoBlocks(parseDocument(body).segments)[ref.index]?.children.flatMap(
      (child) => {
        const parsed = parseWorkEntry(child.text);
        return parsed ? [{ text: child.text, minutes: parsed.minutes }] : [];
      },
    ) as { text: string; minutes: number }[];
    const choice = fc.constantFrom("keep", "update", "remove");
    return fc
      .record({
        choices: fc.array(choice, { minLength: entries.length, maxLength: entries.length }),
        minutes: fc.array(fc.integer({ min: 1, max: 200 }), {
          minLength: entries.length,
          maxLength: entries.length,
        }),
        added: fc.array(fc.integer({ min: 1, max: 200 }), { maxLength: 3 }),
      })
      .map(({ choices, minutes, added }) => {
        const refs = entries.map((e, index) => ({ index, text: e.text }));
        const edits: WorkEdits = {
          updated: refs.flatMap((entry, i) =>
            choices[i] === "update" ? [{ entry, minutes: minutes[i] as number }] : [],
          ),
          removed: refs.filter((_, i) => choices[i] === "remove"),
          added,
        };
        const expected =
          entries.reduce(
            (sum, e, i) =>
              sum +
              (choices[i] === "keep" ? e.minutes : 0) +
              (choices[i] === "update" ? (minutes[i] as number) : 0),
            0,
          ) + added.reduce((sum, m) => sum + m, 0);
        return { body, ref, edits, expected };
      });
  });

  it("editWork の後、カードの作業時間の合計は、変更から求めた合計と同じ", () => {
    fc.assert(
      fc.property(bodyWithWorkEdits, ({ body, ref, edits, expected }) => {
        const next = editWork(parseDocument(body), ref, edits);
        if (isRejection(next)) {
          throw new Error(`拒否された: ${next.rejected}`);
        }

        const block = todoBlocks(next.segments)[ref.index];
        const total = block?.children
          .flatMap((child) => parseWorkEntry(child.text) ?? [])
          .reduce((sum, e) => sum + e.minutes, 0);
        expect(total).toBe(expected);
        expect(fixedTexts(next)).toEqual(fixedTexts(parseDocument(body)));
      }),
    );
  });
});
