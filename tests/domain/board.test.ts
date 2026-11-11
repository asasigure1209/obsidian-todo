import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type Board,
  dayPomodoros,
  dayProgress,
  runningCard,
  toBoard,
  toBoardView,
} from "@/domain/board";
import { moveCard } from "@/domain/commands/card";
import { isRejection, type LineRef } from "@/domain/commands/command";
import { editWork } from "@/domain/commands/work";
import { parseDocument, todoBlocks } from "@/domain/document/body";
import type { RunningTarget } from "@/domain/timer";
import { markdownLike } from "./document/arbitraries";

const board = `---
date: 2026-11-04
---
朝のメモ
- [ ] API設計レビューの指摘に対応 [est:: 2]
- [/] 提案資料の構成を固める [est:: 3]
    - 25分 ポモドーロ
    参考: 前回の資料
- [x] 経費精算を提出 [est:: 小]
    - 12分 ポモドーロ
- [ ] 見積もりの返信を書く
`;

const boardOf = (body: string) => toBoard(parseDocument(body));

/** 列ごとのカード名だけを並べて、見比べやすくする */
const names = (b: Board) => ({
  todo: b.todo.map((c) => c.name),
  doing: b.doing.map((c) => c.name),
  done: b.done.map((c) => c.name),
});

const allCards = (b: Board) => [...b.todo, ...b.doing, ...b.done];

describe("toBoard", () => {
  it("カードは作業時間の記録を本文の順番で持ち、各記録の ref はそのまま作業時間のコマンドに渡せる", () => {
    const body = `- [x] メールの返信
    - 25分 ポモドーロ
    参考: 30分 くらい
    - 12分 中断 チャットでの問い合わせ
`;
    const doc = parseDocument(body);
    const [card] = toBoard(doc).done;

    expect(card?.entries).toStrictEqual([
      { ref: { index: 0, text: "    - 25分 ポモドーロ" }, minutes: 25, kind: "ポモドーロ" },
      {
        ref: { index: 1, text: "    - 12分 中断 チャットでの問い合わせ" },
        minutes: 12,
        kind: "中断",
        memo: "チャットでの問い合わせ",
      },
    ]);
    const entry = card?.entries[1]?.ref as LineRef;
    const edits = { updated: [], removed: [entry], added: [] };
    expect(isRejection(editWork(doc, card?.ref as LineRef, edits))).toBe(false);
  });

  it("TODO 行を状態ごとに 今日やる・着手中・完了 の列へ分ける", () => {
    expect(names(boardOf(board))).toEqual({
      todo: ["API設計レビューの指摘に対応", "見積もりの返信を書く"],
      doing: ["提案資料の構成を固める"],
      done: ["経費精算を提出"],
    });
  });

  it("カードは名前と見積もりを持つ。見積もりを省略した TODO は見積もりなし", () => {
    const { todo } = boardOf(board);

    expect(todo[0]).toMatchObject({ name: "API設計レビューの指摘に対応", estimate: "2" });
    expect(todo[1]).not.toHaveProperty("estimate");
  });

  it("作業時間は子の行の分数の合計。書式外の子の行は数えない", () => {
    const body = `- [x] メールの返信 [est:: 1]
    - 25分 ポモドーロ
    - 12分 中断 チャットでの問い合わせ
    参考: 30分 くらい
\t- 25分 手動
- [ ] 経費精算を提出
`;

    const { todo, done } = boardOf(body);

    expect(done[0]?.workedMinutes).toBe(62);
    expect(todo[0]?.workedMinutes).toBe(0);
  });

  it("ポモドーロの数は、種類がポモドーロの作業時間の行の数", () => {
    const body = `- [/] メールの返信
    - 25分 ポモドーロ
    - 12分 中断
    - 25分 手動
\t- 10分 ポモドーロ
    - 5分 ポモドーロ
`;

    expect(boardOf(body).doing[0]?.pomodoros).toBe(3);
  });

  it("固定行と書式外の TODO はカードにならない", () => {
    const b = boardOf("朝のメモ\n* [ ] 別の書式\n- [X] 大文字\n\n- [ ] a\n");

    expect(allCards(b).map((c) => c.name)).toEqual(["a"]);
  });

  it("着手中が2件あっても両方とも着手中に出す", () => {
    expect(boardOf("- [/] a\n- [ ] b\n- [/] c\n").doing.map((c) => c.name)).toEqual(["a", "c"]);
  });

  it("カードの ref は TODO ブロックの何番目かと、その行の文字列", () => {
    const { todo, doing, done } = boardOf(board);

    expect(todo.map((c) => c.ref)).toEqual([
      { index: 0, text: "- [ ] API設計レビューの指摘に対応 [est:: 2]" },
      { index: 3, text: "- [ ] 見積もりの返信を書く" },
    ]);
    expect(doing[0]?.ref).toEqual({ index: 1, text: "- [/] 提案資料の構成を固める [est:: 3]" });
    expect(done[0]?.ref).toEqual({ index: 2, text: "- [x] 経費精算を提出 [est:: 小]" });
  });

  it("カードの key は行の文字列と、同じ文字列の何件目か。上に TODO が増えても変わらない", () => {
    const before = boardOf("- [ ] a\n- [ ] b\n- [ ] a\n");
    const after = boardOf("- [ ] 新しい\n- [ ] a\n- [ ] b\n- [ ] a\n");

    expect(before.todo.map((c) => c.key)).toEqual(["- [ ] a#0", "- [ ] b#0", "- [ ] a#1"]);
    expect(after.todo.slice(1).map((c) => c.key)).toEqual(before.todo.map((c) => c.key));
  });

  it("空の本文は3列とも空", () => {
    expect(boardOf("")).toEqual({ todo: [], doing: [], done: [] });
  });

  it("どんな本文でも、カードの数は TODO ブロックの数と同じ", () => {
    fc.assert(
      fc.property(markdownLike, (body) => {
        const doc = parseDocument(body);
        const blocks = todoBlocks(doc.segments);

        expect(allCards(toBoard(doc))).toHaveLength(blocks.length);
      }),
    );
  });

  it("どんな本文でも、カードの key は重ならない", () => {
    fc.assert(
      fc.property(markdownLike, (body) => {
        const keys = allCards(boardOf(body)).map((c) => c.key);

        expect(new Set(keys).size).toBe(keys.length);
      }),
    );
  });

  it("どんな本文でも、カードの ref を渡したコマンドは stale にならない", () => {
    fc.assert(
      fc.property(markdownLike, (body) => {
        const doc = parseDocument(body);

        for (const c of allCards(toBoard(doc))) {
          expect(isRejection(moveCard(doc, c.ref, "done", 0))).toBe(false);
        }
      }),
    );
  });

  it("どんな本文でも、列の中の順番は行の順番と同じ", () => {
    fc.assert(
      fc.property(markdownLike, (body) => {
        const b = boardOf(body);

        for (const column of [b.todo, b.doing, b.done]) {
          const indexes = column.map((c) => c.ref.index);
          expect(indexes).toEqual([...indexes].sort((x, y) => x - y));
        }
      }),
    );
  });
});

describe("runningCard", () => {
  const startedAt = new Date(2026, 10, 4, 9, 0).getTime();
  /** 本文の index 番目の TODO ブロックを計測している */
  const runningAt = (index: number, text: string): RunningTarget => ({
    timer: { dayKey: "2026-11-04", startedAt, text, held: false },
    target: { index, text },
  });

  it("計測中の対象のカードを示す", () => {
    const running = runningAt(1, "- [/] 提案資料の構成を固める [est:: 3]");
    expect(runningCard(boardOf(board), running)).toEqual({
      key: "- [/] 提案資料の構成を固める [est:: 3]#0",
      startedAt,
    });
  });

  it("計測中でなければ示さない", () => {
    expect(runningCard(boardOf(board), undefined)).toBeUndefined();
  });

  it("対象の位置に着手中のカードがなければ示さない", () => {
    const running = runningAt(0, "- [ ] API設計レビューの指摘に対応 [est:: 2]");
    expect(runningCard(boardOf(board), running)).toBeUndefined();
  });
});

describe("toBoardView", () => {
  const body = "- [ ] 議事録\n- [/] 提案資料\n";
  const timer = { dayKey: "2026-11-05", startedAt: 0, text: "- [/] 提案資料", held: false };

  it("この日のタイマーの対象が見つかれば、計測中のカードを示す", () => {
    const view = toBoardView(parseDocument(body), timer, "2026-11-05");
    expect(view.board.doing.map((c) => c.name)).toEqual(["提案資料"]);
    expect(view.running).toEqual({ key: "- [/] 提案資料#0", startedAt: 0 });
  });

  it("その日の予定を、読める行だけ書いた順に持つ", () => {
    const doc = parseDocument(`---\nevents:\n  - 10:00-11:00 定例\n  - 終日 休み\n---\n${body}`);

    expect(toBoardView(doc, undefined, "2026-11-05").events).toEqual([
      { start: 600, end: 660, title: "定例" },
    ]);
  });

  it("ほかの日のタイマーなら、計測中のカードを示さない", () => {
    const view = toBoardView(parseDocument(body), timer, "2026-11-06");
    expect(view).not.toHaveProperty("running");
  });
});

describe("dayPomodoros（その日の集中ポモドーロ数）", () => {
  it("すべての列のカードの、種類がポモドーロの作業時間の行の数。中断と手動は数えない", () => {
    const body = `- [ ] 見積もりの返信を書く
    - 25分 ポモドーロ
- [/] 提案資料の構成を固める
    - 25分 ポモドーロ
    - 10分 中断 電話
    - 25分 ポモドーロ
- [x] 経費精算を提出
    - 25分 ポモドーロ
    - 15分 手動
    参考: 25分 ポモドーロ
`;
    expect(dayPomodoros(boardOf(body))).toBe(4);
  });

  it("カードがなければ 0", () => {
    expect(dayPomodoros(boardOf("朝のメモ\n"))).toBe(0);
  });
});

describe("dayProgress（ヘッダーの集中ポモドーロ数と進捗バー）", () => {
  const workday = { hours: { start: 540, end: 1080 }, breaks: [{ start: 720, end: 780 }] };
  const body = "- [x] a\n    - 25分 ポモドーロ\n    - 25分 ポモドーロ\n    - 25分 ポモドーロ\n";

  it("完了数はその日のポモドーロの行の数、可能な数は就業時間の全体から、割合はその比", () => {
    // 就業時間 480分（休憩を除く）から予定 105分を除いた 375分は 15ポモドーロ
    const events = [{ start: 600, end: 705, title: "定例" }];

    expect(dayProgress(boardOf(body), events, workday)).toEqual({
      done: 3,
      capacity: 15,
      ratio: 3 / 15,
    });
  });

  it("可能な数を超えた割合は 1 で止め、可能な数が 0 なら 0", () => {
    const full = [{ start: 0, end: 1439, title: "終日の作業" }];

    expect(dayProgress(boardOf(body), [], { hours: { start: 540, end: 590 }, breaks: [] })).toEqual(
      {
        done: 3,
        capacity: 2,
        ratio: 1,
      },
    );
    expect(dayProgress(boardOf(body), full, workday).ratio).toBe(0);
  });

  it("カードを並べ替え・移しても、完了数は変わらない", () => {
    fc.assert(
      fc.property(
        markdownLike,
        fc.nat(9),
        fc.constantFrom("todo" as const, "doing" as const, "done" as const),
        fc.nat(5),
        (body, index, status, position) => {
          const doc = parseDocument(body);
          const block = todoBlocks(doc.segments)[index];
          fc.pre(block !== undefined);
          const moved = moveCard(doc, { index, text: block?.head.text ?? "" }, status, position);
          fc.pre(!isRejection(moved));

          expect(dayPomodoros(toBoard(moved as typeof doc))).toBe(dayPomodoros(toBoard(doc)));
        },
      ),
    );
  });
});
