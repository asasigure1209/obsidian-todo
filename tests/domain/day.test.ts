import { describe, expect, it } from "vitest";
import { canEdit, toDayKey } from "@/domain/day";

describe("toDayKey", () => {
  it("月と日を2桁にそろえる", () => {
    expect(toDayKey(new Date(2026, 0, 5, 9, 0))).toBe("2026-01-05");
  });

  it("ローカル時刻の日付を使う", () => {
    expect(toDayKey(new Date(2026, 10, 3, 23, 59))).toBe("2026-11-03");
  });
});

describe("canEdit（design 8.3）", () => {
  const today = "2026-11-05";

  it.each(["move", "complete", "add", "work"] as const)("今日は「%s」ができる", (kind) => {
    expect(canEdit(kind, today, today)).toBe(true);
  });

  it("過去の日は作業時間の修正だけができる", () => {
    expect(canEdit("work", "2026-11-04", today)).toBe(true);
    expect(canEdit("move", "2026-11-04", today)).toBe(false);
    expect(canEdit("complete", "2025-12-31", today)).toBe(false);
    expect(canEdit("add", "2026-11-04", today)).toBe(false);
  });

  it("未来の日は何もできない", () => {
    expect(canEdit("work", "2026-11-06", today)).toBe(false);
    expect(canEdit("move", "2027-01-01", today)).toBe(false);
  });
});
