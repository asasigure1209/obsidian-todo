import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { dayPomodoros, toBoard } from "@/domain/board";
import { parseDocument } from "@/domain/document/body";
import type { Estimate } from "@/domain/document/todo-line";
import {
  difference,
  estimateRatio,
  formatActual,
  formatDifference,
  formatFocusTime,
  formatOverrun,
  toReview,
} from "@/domain/review";
import { markdownLike } from "./document/arbitraries";

const estimateArb = fc.constantFrom<Estimate>("小", "1", "2", "3", "4");

const day = `---
date: 2026-11-03
events:
  - 10:00-11:00 定例
---
- [/] 提案資料の構成を固める [est:: 3]
    - 25分 ポモドーロ
    - 10分 中断 チャットでの問い合わせ
- [ ] 見積もりの返信を書く [est:: 1]
- [x] API設計レビューの指摘に対応 [est:: 2]
    - 25分 ポモドーロ
    - 25分 ポモドーロ
    - 50分 手動
- [x] 経費精算を提出 [est:: 小]
    - 12分 ポモドーロ
- [x] メールの返信
    - 25分 ポモドーロ
    - 12分 中断
    - 25分 手動
`;

const reviewOf = (body: string) => toReview(toBoard(parseDocument(body)));

describe("toReview（終業の振り返り）", () => {
  it("完了の数と、その日の TODO の数（3列の合計）", () => {
    const review = reviewOf(day);

    expect([review.completed, review.total]).toStrictEqual([3, 5]);
  });

  it("人の集中時間は、すべてのカードのポモドーロと中断の分の合計。手動は数えない", () => {
    expect(reviewOf(day).focusMinutes).toBe(25 + 10 + 25 + 25 + 12 + 25 + 12);
  });

  it("ポモドーロの数はヘッダーの完了数と同じ、中断の回数は中断の行の数", () => {
    const board = toBoard(parseDocument(day));
    const review = toReview(board);

    expect([review.pomodoros, review.interruptions]).toStrictEqual([dayPomodoros(board), 2]);
  });

  it("見積もりと実績の表は、完了した TODO だけを完了の列の順に並べる", () => {
    expect(reviewOf(day).rows.map((row) => row.name)).toStrictEqual([
      "API設計レビューの指摘に対応",
      "経費精算を提出",
      "メールの返信",
    ]);
  });

  it("表の行は、見積もりと、手動を含む作業時間の合計と、見積もりとの差を持つ", () => {
    const [row] = reviewOf(day).rows;

    expect(row).toStrictEqual({
      key: "- [x] API設計レビューの指摘に対応 [est:: 2]#0",
      name: "API設計レビューの指摘に対応",
      estimate: "2",
      minutes: 100,
      difference: { kind: "over", pomodoros: 2 },
    });
  });

  it("見積もりのない TODO は、見積も差も持たない", () => {
    const row = reviewOf(day).rows[2];

    expect(row).toStrictEqual({
      key: "- [x] メールの返信#0",
      name: "メールの返信",
      minutes: 62,
    });
  });

  it("未完了の数は、今日やると着手中の数", () => {
    expect(reviewOf(day).unfinished).toBe(2);
  });

  it("中断のメモは、メモのある中断だけをすべての列から本文の順に", () => {
    const body = `- [x] メールの返信
    - 5分 中断 電話
    - 5分 手動 手で足した
    - 5分 中断
- [ ] 見積もりの返信を書く
    - 3分 中断 チャットでの問い合わせ
`;

    expect(reviewOf(body).interruptionMemos).toStrictEqual(["電話", "チャットでの問い合わせ"]);
  });

  it("見積もりの2倍以上かかった完了 TODO を挙げる。倍率は小数1桁", () => {
    const body = `- [x] ちょうど2倍 [est:: 1]
    - 50分 手動
- [x] 2倍に届かない [est:: 1]
    - 49分 ポモドーロ
- [x] 小は25分として数える [est:: 小]
    - 60分 ポモドーロ
- [x] 4は100分として数える [est:: 4]
    - 199分 ポモドーロ
- [x] 見積もりなし
    - 100分 ポモドーロ
- [/] 未完了 [est:: 1]
    - 100分 ポモドーロ
`;

    expect(reviewOf(body).overruns).toStrictEqual([
      { name: "ちょうど2倍", ratio: 2 },
      { name: "小は25分として数える", ratio: 2.4 },
    ]);
  });

  it("カードがなければ、どの数も 0 で表も材料も空", () => {
    expect(reviewOf("")).toStrictEqual({
      completed: 0,
      total: 0,
      focusMinutes: 0,
      pomodoros: 0,
      interruptions: 0,
      rows: [],
      unfinished: 0,
      interruptionMemos: [],
      overruns: [],
    });
  });

  it("どんな本文でも、表の行の数は完了の数と同じで、完了と未完了で TODO の数になる", () => {
    fc.assert(
      fc.property(markdownLike, (body) => {
        const review = reviewOf(body);

        expect(review.rows).toHaveLength(review.completed);
        expect(review.completed + review.unfinished).toBe(review.total);
      }),
    );
  });

  it("どんな本文でも、人の集中時間は作業時間の合計を超えない", () => {
    fc.assert(
      fc.property(markdownLike, (body) => {
        const board = toBoard(parseDocument(body));
        const worked = [...board.todo, ...board.doing, ...board.done].reduce(
          (sum, card) => sum + card.workedMinutes,
          0,
        );

        expect(toReview(board).focusMinutes).toBeLessThanOrEqual(worked);
      }),
    );
  });
});

describe("formatFocusTime（人の集中時間の書式）", () => {
  it.each([
    [185, "3h 05m"],
    [60, "1h 00m"],
    [130, "2h 10m"],
  ])("1時間以上は「3h 05m」の形（%d分は %s）", (minutes, text) => {
    expect(formatFocusTime(minutes)).toBe(text);
  });

  it.each([
    [45, "45m"],
    [5, "5m"],
    [0, "0m"],
  ])("1時間未満は「45m」の形（%d分は %s）", (minutes, text) => {
    expect(formatFocusTime(minutes)).toBe(text);
  });
});

describe("formatActual（実績の書式）", () => {
  it.each([
    [62, "2.5"],
    [100, "4"],
    [25, "1"],
    [26, "1"],
  ])(
    "25分以上は、25で割って小数1桁に四捨五入したポモドーロ。整数は小数を付けない（%d分は %s）",
    (minutes, text) => {
      expect(formatActual(minutes)).toBe(text);
    },
  );

  it.each([
    [12, "12分"],
    [24, "24分"],
    [0, "0分"],
  ])("25分未満は分で出す（%d分は %s）", (minutes, text) => {
    expect(formatActual(minutes)).toBe(text);
  });
});

describe("difference（見積もりとの差）", () => {
  it("実績が見積もりより多ければ超過と、その差", () => {
    expect(difference(100, "2")).toStrictEqual({ kind: "over", pomodoros: 2 });
  });

  it("実績が見積もりより少なければ早く完了", () => {
    expect(difference(12, "1")).toStrictEqual({ kind: "early" });
  });

  it("同じなら ±0", () => {
    expect(difference(75, "3")).toStrictEqual({ kind: "even" });
  });

  it("実績は小数1桁に丸めてから比べる（26分は 1.0 なので、見積もり 1 と同じ）", () => {
    expect(difference(26, "1")).toStrictEqual({ kind: "even" });
  });

  it("超過の差は小数1桁（58分は 2.3 なので、見積もり 1 より 1.3 多い）", () => {
    expect(difference(58, "1")).toStrictEqual({ kind: "over", pomodoros: 1.3 });
  });

  it.each([
    [12, { kind: "even" }],
    [25, { kind: "even" }],
    [26, { kind: "even" }],
    [27, { kind: "over", pomodoros: 0.1 }],
    [50, { kind: "over", pomodoros: 1 }],
  ])("小は「1以下」として比べる（%d分）", (minutes, expected) => {
    expect(difference(minutes, "小")).toStrictEqual(expected);
  });

  it.each([
    [100, { kind: "even" }],
    [200, { kind: "even" }],
    [98, { kind: "early" }],
    [99, { kind: "even" }],
  ])("4は「4以上」として比べる（%d分）", (minutes, expected) => {
    expect(difference(minutes, "4")).toStrictEqual(expected);
  });

  it("どんな分数と見積もりでも、超過の差は 0 より大きい小数1桁", () => {
    fc.assert(
      fc.property(fc.nat(10_000), estimateArb, (minutes, estimate) => {
        const result = difference(minutes, estimate);
        if (result.kind === "over") {
          expect(result.pomodoros).toBeGreaterThan(0);
          expect(Math.round(result.pomodoros * 10) / 10).toBe(result.pomodoros);
        }
      }),
    );
  });
});

describe("formatDifference（差の書式）", () => {
  it.each([
    [{ kind: "over", pomodoros: 2 }, "+2（超過）"],
    [{ kind: "over", pomodoros: 0.5 }, "+0.5（超過）"],
    [{ kind: "early" }, "早く完了"],
    [{ kind: "even" }, "±0"],
  ] as const)("%o は %s", (value, text) => {
    expect(formatDifference(value)).toBe(text);
  });
});

describe("estimateRatio（見積もりの何倍かかったか）", () => {
  it.each([
    [100, "2", 2],
    [60, "1", 2.4],
    [50, "小", 2],
    [200, "4", 2],
    [62, "3", 0.8],
  ] as const)(
    "%d分・見積もり %s は %d倍（小は25分、4は100分。小数1桁に四捨五入）",
    (minutes, estimate, ratio) => {
      expect(estimateRatio(minutes, estimate)).toBe(ratio);
    },
  );
});

describe("formatOverrun（日報の材料の見積もり超過）", () => {
  it("「API設計レビューの指摘に対応は見積もりの2倍」の形", () => {
    expect(formatOverrun({ name: "API設計レビューの指摘に対応", ratio: 2 })).toBe(
      "API設計レビューの指摘に対応は見積もりの2倍",
    );
  });

  it("倍率の小数は1桁で出す", () => {
    expect(formatOverrun({ name: "メールの返信", ratio: 2.4 })).toBe(
      "メールの返信は見積もりの2.4倍",
    );
  });
});
