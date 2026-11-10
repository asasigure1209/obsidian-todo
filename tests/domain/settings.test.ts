import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { TimeRange, Workday } from "@/domain/schedule";
import {
  DEFAULT_SETTINGS,
  parseSettings,
  readFolder,
  readWorkday,
  type Settings,
  type WorkdayDraft,
  workdayDraft,
} from "@/domain/settings";

/** 時:分 を0時からの分数に */
const at = (hour: number, minute = 0) => hour * 60 + minute;
const DAY_MINUTES = 24 * 60;

const range = (start: number, end: number): TimeRange => ({ start, end });

/** 既定値とすべて違う、正しい設定 */
const saved: Settings = {
  folders: { todo: "仕事/TODO", workLog: "ログ", dailyReport: "日報/2026" },
  workday: { hours: range(at(8, 30), at(17, 30)), breaks: [range(at(11, 45), at(12, 30))] },
  sound: false,
};

/** 正しい時刻の範囲か（0:00〜23:59 の整数の分で、終わりが始まりより後） */
const isRange = (r: TimeRange) =>
  Number.isInteger(r.start) &&
  Number.isInteger(r.end) &&
  r.start >= 0 &&
  r.end < DAY_MINUTES &&
  r.start < r.end;

/** 正しい就業時間と休憩か（休憩はすべて就業時間の中） */
const isWorkday = (w: Workday) =>
  isRange(w.hours) &&
  w.breaks.every((b) => isRange(b) && b.start >= w.hours.start && b.end <= w.hours.end);

const isFolder = (folder: string) =>
  folder !== "" && folder === folder.trim().replace(/^\/+|\/+$/g, "");

/** 正しい就業時間と、その中の休憩 */
const validWorkday: fc.Arbitrary<Workday> = fc
  .tuple(fc.integer({ min: 0, max: DAY_MINUTES - 1 }), fc.integer({ min: 0, max: DAY_MINUTES - 1 }))
  .filter(([a, b]) => a !== b)
  .chain(([a, b]) => {
    const hours = range(Math.min(a, b), Math.max(a, b));
    const minute = fc.integer({ min: hours.start, max: hours.end });
    const inside = fc
      .tuple(minute, minute)
      .filter(([s, e]) => s !== e)
      .map(([s, e]) => range(Math.min(s, e), Math.max(s, e)));
    return fc.array(inside, { maxLength: 4 }).map((breaks) => ({ hours, breaks }));
  });

const validFolder = fc
  .string({ minLength: 1 })
  .map((s) => s.trim().replace(/^\/+|\/+$/g, ""))
  .filter((s) => s !== "");

const validSettings: fc.Arbitrary<Settings> = fc.record({
  folders: fc.record({ todo: validFolder, workLog: validFolder, dailyReport: validFolder }),
  workday: validWorkday,
  sound: fc.boolean(),
});

/** 入力欄の文字列 */
const draft = (hours: [string, string], ...breaks: [string, string][]): WorkdayDraft => ({
  hours: { start: hours[0], end: hours[1] },
  breaks: breaks.map(([start, end]) => ({ start, end })),
});

describe("DEFAULT_SETTINGS（設定の既定値）", () => {
  it("フォルダは TODO・作業ログ・日報、就業時間は 9:00〜18:00、休憩は 12:00〜13:00、満了の音はオン", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      folders: { todo: "TODO", workLog: "作業ログ", dailyReport: "日報" },
      workday: { hours: range(at(9), at(18)), breaks: [range(at(12), at(13))] },
      sound: true,
    });
  });
});

describe("parseSettings（保存領域から読んだ設定）", () => {
  it("保存した設定をそのまま読む", () => {
    expect(parseSettings(saved)).toEqual(saved);
  });

  it.each([undefined, null, "settings", 1, [], {}])(
    "保存領域が空や形の合わない値（%j）なら、すべて既定値",
    (value) => {
      expect(parseSettings(value)).toEqual(DEFAULT_SETTINGS);
    },
  );

  it("形の合わない項目だけを既定値にし、ほかの項目は残す", () => {
    expect(parseSettings({ ...saved, sound: "off" })).toEqual({
      ...saved,
      sound: true,
    });
    expect(parseSettings({ ...saved, folders: { ...saved.folders, workLog: 3 } })).toEqual({
      ...saved,
      folders: { ...saved.folders, workLog: "作業ログ" },
    });
    expect(parseSettings({ ...saved, folders: null })).toEqual({
      ...saved,
      folders: DEFAULT_SETTINGS.folders,
    });
    expect(parseSettings({ ...saved, workday: "9-18" })).toEqual({
      ...saved,
      workday: DEFAULT_SETTINGS.workday,
    });
  });

  it("空のフォルダ名は既定値にする", () => {
    expect(parseSettings({ ...saved, folders: { ...saved.folders, todo: " / " } })).toEqual({
      ...saved,
      folders: { ...saved.folders, todo: "TODO" },
    });
  });

  it("形の合わない休憩と、就業時間の外の休憩は捨てる", () => {
    const breaks = [
      range(at(12), at(13)),
      range(at(15), at(14)),
      range(at(8), at(10)),
      range(at(17), at(19)),
      { start: "15:00", end: at(16) },
      { start: at(15, 0.5), end: at(16) },
      null,
      range(at(15), at(15, 10)),
    ];

    const settings = parseSettings({ ...saved, workday: { hours: range(at(9), at(18)), breaks } });

    expect(settings.workday.breaks).toEqual([range(at(12), at(13)), range(at(15), at(15, 10))]);
  });

  it("休憩が配列でなければ既定の休憩にする", () => {
    const settings = parseSettings({ workday: { hours: range(at(9), at(18)), breaks: "昼" } });

    expect(settings.workday.breaks).toEqual(DEFAULT_SETTINGS.workday.breaks);
  });

  it.each([
    undefined,
    range(at(18), at(9)),
    range(at(9), at(9)),
    range(-1, at(9)),
    range(at(9), DAY_MINUTES),
    { start: at(9) },
    { start: "9:00", end: "18:00" },
  ])("就業時間が読めなければ（%j）既定の就業時間にし、その中に入る休憩だけを残す", (hours) => {
    const breaks = [range(at(6), at(7)), range(at(12), at(12, 30))];

    expect(parseSettings({ workday: { hours, breaks } }).workday).toEqual({
      hours: range(at(9), at(18)),
      breaks: [range(at(12), at(12, 30))],
    });
  });

  it("どんな値を読んでも、正しい設定になる", () => {
    const loose = fc.oneof(
      fc.anything(),
      validSettings,
      validSettings.chain((s) =>
        fc.record({
          folders: fc.oneof(fc.anything(), fc.dictionary(fc.string(), fc.anything())),
          workday: fc.record({
            hours: fc.oneof(fc.anything(), fc.record({ start: fc.integer(), end: fc.integer() })),
            breaks: fc.array(
              fc.oneof(
                fc.anything(),
                fc.record({ start: fc.integer(), end: fc.integer() }),
                fc.constant(s.workday.hours),
              ),
            ),
          }),
          sound: fc.anything(),
        }),
      ),
    );
    fc.assert(
      fc.property(loose, (value) => {
        const settings = parseSettings(value);
        expect(isWorkday(settings.workday)).toBe(true);
        expect(Object.values(settings.folders).every(isFolder)).toBe(true);
        expect(typeof settings.sound).toBe("boolean");
      }),
    );
  });

  it("正しい設定は、保存して読み直すと元に戻る", () => {
    fc.assert(
      fc.property(validSettings, (settings) => {
        expect(parseSettings(JSON.parse(JSON.stringify(settings)))).toEqual(settings);
      }),
    );
  });
});

describe("readFolder（フォルダ名の入力）", () => {
  it("前後の空白と / を除いて読む", () => {
    expect(readFolder("TODO")).toBe("TODO");
    expect(readFolder("  仕事/TODO/ ")).toBe("仕事/TODO");
    expect(readFolder("/作業 ログ")).toBe("作業 ログ");
    expect(readFolder("//日報//")).toBe("日報");
    expect(readFolder("仕事 /")).toBe("仕事");
    expect(readFolder("/ TODO")).toBe("TODO");
  });

  it.each(["", "   ", "/", " // ", "/ /"])("空のフォルダ名（%j）は読まない", (text) => {
    expect(readFolder(text)).toBeUndefined();
  });

  it("読めたフォルダ名は、空でなく前後に空白も / もない", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const folder = readFolder(text);
        expect(folder === undefined || isFolder(folder)).toBe(true);
      }),
    );
  });
});

describe("readWorkday（就業時間と休憩の入力）", () => {
  it("就業時間と休憩を、0時からの分数で読む", () => {
    expect(readWorkday(draft(["8:30", "17:30"], ["12:00", "12:45"]))).toEqual({
      workday: { hours: range(at(8, 30), at(17, 30)), breaks: [range(at(12), at(12, 45))] },
      hours: undefined,
      breaks: [undefined],
    });
  });

  it("休憩はなくてもよく、いくつあってもよい", () => {
    expect(readWorkday(draft(["9:00", "18:00"])).workday).toEqual({
      hours: range(at(9), at(18)),
      breaks: [],
    });
    expect(
      readWorkday(draft(["9:00", "18:00"], ["15:00", "15:15"], ["12:00", "13:00"])).workday?.breaks,
    ).toEqual([range(at(15), at(15, 15)), range(at(12), at(13))]);
  });

  it("時刻の書式に合わない欄を知らせる", () => {
    expect(readWorkday(draft(["9", "18:00"])).hours).toBe("format");
    expect(readWorkday(draft(["9:00", ""])).hours).toBe("format");
    expect(readWorkday(draft(["9:00", "18:00"], ["12:00", "13:00"], ["", ""])).breaks).toEqual([
      undefined,
      "format",
    ]);
  });

  it("終わりが始まりより後でない欄を知らせる", () => {
    expect(readWorkday(draft(["18:00", "9:00"])).hours).toBe("order");
    expect(readWorkday(draft(["9:00", "9:00"])).hours).toBe("order");
    expect(readWorkday(draft(["9:00", "18:00"], ["13:00", "12:00"])).breaks).toEqual(["order"]);
  });

  it("就業時間の外にはみ出す休憩を知らせる", () => {
    const check = readWorkday(
      draft(
        ["9:00", "18:00"],
        ["8:00", "9:30"],
        ["17:30", "18:30"],
        ["9:00", "18:00"],
        ["19:00", "20:00"],
      ),
    );

    expect(check.breaks).toEqual(["outside", "outside", undefined, "outside"]);
    expect(check.hours).toBeUndefined();
  });

  it("就業時間が読めないときは、休憩の書式と順番だけを確かめる", () => {
    expect(
      readWorkday(draft(["18:00", "9:00"], ["5:00", "6:00"], ["7:00", ""], ["7:00", "6:00"]))
        .breaks,
    ).toEqual([undefined, "format", "order"]);
  });

  it("どこか1つでも問題があれば、就業時間と休憩をまとめて読まない", () => {
    expect(readWorkday(draft(["9:00", "8:00"], ["12:00", "13:00"])).workday).toBeUndefined();
    expect(readWorkday(draft(["9:00", "18:00"], ["12:00", "x"])).workday).toBeUndefined();
    expect(readWorkday(draft(["9:00", "18:00"], ["8:00", "9:00"])).workday).toBeUndefined();
  });

  it("正しい就業時間と休憩を入力の形にして読むと、元に戻る", () => {
    expect(workdayDraft(DEFAULT_SETTINGS.workday)).toEqual(
      draft(["9:00", "18:00"], ["12:00", "13:00"]),
    );
    fc.assert(
      fc.property(validWorkday, (workday) => {
        expect(readWorkday(workdayDraft(workday)).workday).toEqual(workday);
      }),
    );
  });

  it("どんな入力でも、読めた就業時間と休憩は正しい", () => {
    const clock = fc.oneof(
      fc.string(),
      fc
        .tuple(fc.integer({ min: 0, max: 30 }), fc.integer({ min: 0, max: 70 }))
        .map(([h, m]) => `${h}:${String(m).padStart(2, "0")}`),
    );
    const rangeDraft = fc.record({ start: clock, end: clock });
    fc.assert(
      fc.property(rangeDraft, fc.array(rangeDraft, { maxLength: 4 }), (hours, breaks) => {
        const check = readWorkday({ hours, breaks });
        expect(check.breaks).toHaveLength(breaks.length);
        if (check.workday) {
          expect(isWorkday(check.workday)).toBe(true);
          expect(check.workday.breaks).toHaveLength(breaks.length);
        }
      }),
    );
  });
});
