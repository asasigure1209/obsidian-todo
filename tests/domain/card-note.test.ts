import { describe, expect, it } from "vitest";
import type { Card } from "@/domain/board";
import { cardNote } from "@/domain/card-note";

type Figures = Pick<Card, "estimate" | "workedMinutes" | "pomodoros">;

const card = (figures: Partial<Figures> = {}): Figures => ({
  workedMinutes: 0,
  pomodoros: 0,
  ...figures,
});

describe("cardNote", () => {
  it("今日やるは「見積 X」", () => {
    expect(cardNote(card({ estimate: "2" }), "todo")).toBe("見積 2");
  });

  it("今日やるで見積もりがなければ何も出さない", () => {
    expect(cardNote(card(), "todo")).toBe("");
  });

  it("計測中は「N個目のポモドーロ ／ 見積 X」。N はポモドーロの行の数＋1", () => {
    expect(cardNote(card({ pomodoros: 1, estimate: "3" }), "running")).toBe(
      "2個目のポモドーロ ／ 見積 3",
    );
  });

  it("計測中で見積もりがなければ「N個目のポモドーロ」だけ", () => {
    expect(cardNote(card(), "running")).toBe("1個目のポモドーロ");
  });

  it("停止中は「N個目が終わりました ／ 見積 X」。N はポモドーロの行の数", () => {
    expect(cardNote(card({ pomodoros: 2, estimate: "3" }), "stopped")).toBe(
      "2個目が終わりました ／ 見積 3",
    );
  });

  it("停止中でポモドーロの行がなければ「見積 X」だけ", () => {
    expect(cardNote(card({ workedMinutes: 10, estimate: "小" }), "stopped")).toBe("見積 小");
  });

  it("停止中で見積もりがなければ「N個目が終わりました」だけ", () => {
    expect(cardNote(card({ pomodoros: 1 }), "stopped")).toBe("1個目が終わりました");
  });

  it("停止中でポモドーロの行も見積もりもなければ何も出さない", () => {
    expect(cardNote(card(), "stopped")).toBe("");
  });

  it("完了は「実績 N分 ／ 見積 Y」", () => {
    expect(cardNote(card({ workedMinutes: 12, pomodoros: 0, estimate: "1" }), "done")).toBe(
      "実績 12分 ／ 見積 1",
    );
  });

  it("完了で見積もりがなければ「実績 N分」だけ", () => {
    expect(cardNote(card({ workedMinutes: 0 }), "done")).toBe("実績 0分");
  });
});
