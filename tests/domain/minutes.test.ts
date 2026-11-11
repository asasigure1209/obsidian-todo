import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { pomodoroEquivalent, recordableMinutes, roundTenths, toPomodoros } from "@/domain/minutes";

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

  it("どんな開始・終了時刻でも、0〜25の整数になる", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (startedAt, now) => {
        const minutes = recordableMinutes(startedAt, now);
        expect(Number.isInteger(minutes)).toBe(true);
        expect(minutes).toBeGreaterThanOrEqual(0);
        expect(minutes).toBeLessThanOrEqual(25);
      }),
    );
  });
});

describe("pomodoroEquivalent", () => {
  it.each([
    [62, 2.5],
    [60, 2.4],
    [25, 1],
    [1, 0],
    [0, 0],
  ])("%d分は %dポモドーロ（小数1桁に四捨五入）", (minutes, pomodoros) => {
    expect(pomodoroEquivalent(minutes)).toBe(pomodoros);
  });
});

describe("roundTenths", () => {
  it.each([
    [2.48, 2.5],
    [2.44, 2.4],
    [2.3 - 1, 1.3],
    [2, 2],
  ])("%d は小数1桁に四捨五入して %d（引き算の誤差も消す）", (value, rounded) => {
    expect(roundTenths(value)).toBe(rounded);
  });
});

describe("toPomodoros", () => {
  it.each([
    [0, 0],
    [24, 0],
    [25, 1],
    [74, 2],
    [75, 3],
  ])("%d分は %dポモドーロ（25分で割って切り捨て）", (minutes, pomodoros) => {
    expect(toPomodoros(minutes)).toBe(pomodoros);
  });
});
