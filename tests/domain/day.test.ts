import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  boardTitle,
  canEdit,
  canOpen,
  dayFilePath,
  formatDayLabel,
  nextDay,
  previousDay,
  toDayKey,
} from "@/domain/day";

/** 1970〜2100年のどれかの日の日付のキー */
const dayKey = fc
  .date({ min: new Date(1970, 0, 1), max: new Date(2100, 11, 31), noInvalidDate: true })
  .map(toDayKey);

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

  it.each(["move", "complete", "add", "work", "interrupt"] as const)(
    "今日は「%s」ができる",
    (kind) => {
      expect(canEdit(kind, today, today)).toBe(true);
    },
  );

  it("過去の日は作業時間の修正と、計測の中断だけができる", () => {
    expect(canEdit("work", "2026-11-04", today)).toBe(true);
    expect(canEdit("interrupt", "2026-11-04", today)).toBe(true);
    expect(canEdit("move", "2026-11-04", today)).toBe(false);
    expect(canEdit("complete", "2025-12-31", today)).toBe(false);
    expect(canEdit("add", "2026-11-04", today)).toBe(false);
  });

  it("未来の日は何もできない", () => {
    expect(canEdit("work", "2026-11-06", today)).toBe(false);
    expect(canEdit("interrupt", "2026-11-06", today)).toBe(false);
    expect(canEdit("move", "2027-01-01", today)).toBe(false);
  });
});

describe("previousDay・nextDay（前日・翌日への移動。design 8.3）", () => {
  it("前日と翌日の日付のキー", () => {
    expect(previousDay("2026-11-10")).toBe("2026-11-09");
    expect(nextDay("2026-11-10")).toBe("2026-11-11");
  });

  it("月と年の境をまたぐ", () => {
    expect(previousDay("2026-11-01")).toBe("2026-10-31");
    expect(nextDay("2026-10-31")).toBe("2026-11-01");
    expect(previousDay("2027-01-01")).toBe("2026-12-31");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
  });

  it("うるう年の2月29日をはさむ", () => {
    expect(nextDay("2028-02-28")).toBe("2028-02-29");
    expect(nextDay("2028-02-29")).toBe("2028-03-01");
    expect(previousDay("2027-03-01")).toBe("2027-02-28");
  });

  it("どの日でも、前日の翌日・翌日の前日は元の日で、前日は前・翌日は後", () => {
    fc.assert(
      fc.property(dayKey, (key) => {
        expect(nextDay(previousDay(key))).toBe(key);
        expect(previousDay(nextDay(key))).toBe(key);
        expect(previousDay(key) < key).toBe(true);
        expect(nextDay(key) > key).toBe(true);
      }),
    );
  });
});

describe("canOpen（開ける日）", () => {
  it("今日と過去の日は開ける。未来の日は開けない", () => {
    expect(canOpen("2026-11-10", "2026-11-10")).toBe(true);
    expect(canOpen("2026-11-09", "2026-11-10")).toBe(true);
    expect(canOpen("2026-11-11", "2026-11-10")).toBe(false);
  });
});

describe("formatDayLabel（ヘッダーの日付）", () => {
  it("「M月D日（曜）」にする", () => {
    // 月と日は0で埋めない
    expect(formatDayLabel("2027-01-03")).toBe("1月3日（日）");
  });

  it.each([
    ["2026-11-08", "日"],
    ["2026-11-09", "月"],
    ["2026-11-10", "火"],
    ["2026-11-11", "水"],
    ["2026-11-12", "木"],
    ["2026-11-13", "金"],
    ["2026-11-14", "土"],
  ])("%s の曜日は「%s」", (key, weekday) => {
    expect(formatDayLabel(key)).toContain(`（${weekday}）`);
  });
});

describe("boardTitle（タブの見出し）", () => {
  it("今日は「今日のボード」", () => {
    expect(boardTitle("2026-11-10", "2026-11-10")).toBe("今日のボード");
  });

  it("過去の日は「M月D日のボード」", () => {
    expect(boardTitle("2026-11-09", "2026-11-10")).toBe("11月9日のボード");
    expect(boardTitle("2025-12-31", "2026-11-10")).toBe("12月31日のボード");
  });
});

describe("dayFilePath（その日のファイル。design 7.1）", () => {
  it("フォルダの YYYY-MM-DD.md。TODO・作業ログ・日報が同じ日付のファイル名でつながる", () => {
    expect(dayFilePath("作業ログ", "2026-11-10")).toBe("作業ログ/2026-11-10.md");
    expect(dayFilePath("TODO", "2026-11-10")).toBe("TODO/2026-11-10.md");
  });
});
