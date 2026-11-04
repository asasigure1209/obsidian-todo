import { describe, expect, it } from "vitest";
import { recordableMinutes } from "@/domain/minutes";

const start = Date.UTC(2026, 10, 4, 0, 0, 0);
const at = (minutes: number, seconds = 0): number => start + minutes * 60_000 + seconds * 1000;

describe("recordableMinutes", () => {
  it("分未満を切り捨てる", () => {
    expect(recordableMinutes(start, at(12, 59))).toBe(12);
  });

  it("1分未満は0（記録しない）", () => {
    expect(recordableMinutes(start, at(0, 59))).toBe(0);
  });

  it("25分を超えたら25分で止める（スリープ後の再計算）", () => {
    expect(recordableMinutes(start, at(90))).toBe(25);
  });

  it("時計が戻っても負にならない", () => {
    expect(recordableMinutes(start, at(-3))).toBe(0);
  });
});
