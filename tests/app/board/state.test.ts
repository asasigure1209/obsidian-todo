import { NINE, runningTimer, TODAY } from "@tests/app/fakes/timer";
import { describe, expect, it } from "vitest";
import { boardState, readState } from "@/app/board/state";
import { parseDocument } from "@/domain/document/body";

const body = "- [ ] 議事録\n- [/] 提案資料\n- [x] 日報\n";
const names = (cards: { name: string }[]) => cards.map((c) => c.name);

describe("boardState", () => {
  it("本文から3列のボードを作る", () => {
    const state = boardState(parseDocument(body), undefined, TODAY);
    expect(state.kind).toBe("board");
    if (state.kind === "board") {
      expect([state.board.todo, state.board.doing, state.board.done].map(names)).toEqual([
        ["議事録"],
        ["提案資料"],
        ["日報"],
      ]);
    }
  });

  it("この日のタイマーの対象が見つかれば、計測中のカードを示す", () => {
    const state = boardState(parseDocument(body), runningTimer("- [/] 提案資料"), TODAY);
    expect(state).toMatchObject({
      running: { key: "- [/] 提案資料#0", startedAt: NINE, count: 1 },
    });
  });

  it("ほかの日のタイマーなら、計測中のカードを示さない", () => {
    const timer = runningTimer("- [/] 提案資料", { dayKey: "2026-11-04" });
    expect(boardState(parseDocument(body), timer, TODAY)).not.toHaveProperty("running");
  });
});

describe("readState", () => {
  it("ファイルがなければ、本文はなくファイルなしを流す", () => {
    expect(readState(undefined, undefined, TODAY)).toEqual({ state: { kind: "missing" } });
  });

  it("ファイルがあれば、読んだ本文とボードを返す", () => {
    const { doc, state } = readState(body, undefined, TODAY);
    expect(doc).toEqual(parseDocument(body));
    expect(state.kind).toBe("board");
  });
});
