import { describe, expect, it } from "vitest";
import { toDayKey } from "@/domain/day";

describe("toDayKey", () => {
  it("月と日を2桁にそろえる", () => {
    expect(toDayKey(new Date(2026, 0, 5, 9, 0))).toBe("2026-01-05");
  });

  it("ローカル時刻の日付を使う", () => {
    expect(toDayKey(new Date(2026, 10, 3, 23, 59))).toBe("2026-11-03");
  });
});
