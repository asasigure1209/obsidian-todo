import { markdownLike } from "@tests/domain/document/arbitraries";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseDocument } from "@/domain/document/body";
import {
  DEFAULT_WORKDAY,
  focus,
  focusMinutes,
  formatClock,
  hourMarks,
  minuteOfDay,
  nowOffset,
  parseEvent,
  type ScheduledEvent,
  scheduledEvents,
  timelineBlocks,
  type Workday,
} from "@/domain/schedule";

/** 時:分 を0時からの分数に */
const at = (hour: number, minute = 0) => hour * 60 + minute;
const event = (start: number, end: number, title = "予定"): ScheduledEvent => ({
  start,
  end,
  title,
});
/** 9:00〜18:00、休憩 12:00〜13:00（既定値と同じ） */
const workday: Workday = {
  hours: { start: at(9), end: at(18) },
  breaks: [{ start: at(12), end: at(13) }],
};

describe("DEFAULT_WORKDAY", () => {
  it("設定画面ができるまでは 9:00〜18:00、休憩 12:00〜13:00", () => {
    expect(DEFAULT_WORKDAY).toEqual(workday);
  });
});

describe("parseEvent（予定の行。design 7.3）", () => {
  it("「HH:MM-HH:MM 予定名」を、0時からの分数と予定名にする", () => {
    expect(parseEvent("10:00-11:30 チーム定例")).toEqual(event(at(10), at(11, 30), "チーム定例"));
    expect(parseEvent("9:05-9:20 朝会")).toEqual(event(at(9, 5), at(9, 20), "朝会"));
  });

  it("予定名の前後の空白は予定名に入れない", () => {
    expect(parseEvent("10:00-11:00 定例  ")).toEqual(event(at(10), at(11), "定例"));
    expect(parseEvent("10:00-11:00   定例")).toEqual(event(at(10), at(11), "定例"));
  });

  it.each([
    "終日 休み",
    "10:00-11:00",
    "10:00 - 11:00 定例",
    "10:00-11:00  ",
    "x10:00-11:00 定例",
    "23:00-24:00 夜",
    "10:00-10:60 定例",
    "11:00-11:00 定例",
    "12:00-11:00 定例",
  ])("「%s」は予定にしない", (line) => {
    expect(parseEvent(line)).toBeUndefined();
  });
});

describe("scheduledEvents", () => {
  it("どんな本文でも、読めた予定は0時から24時の中で、始まりが終わりより前", () => {
    fc.assert(
      fc.property(markdownLike, (body) => {
        for (const { start, end } of scheduledEvents(parseDocument(body))) {
          expect(start).toBeGreaterThanOrEqual(0);
          expect(start).toBeLessThan(end);
          expect(end).toBeLessThan(24 * 60);
        }
      }),
    );
  });

  it("frontmatter の events から、読める予定だけを書いた順に取り出す", () => {
    const doc = parseDocument(
      "---\nevents:\n  - 14:00-15:00 レビュー\n  - 終日 休み\n  - 10:00-11:00 定例\n---\n",
    );

    expect(scheduledEvents(doc)).toEqual([
      event(at(14), at(15), "レビュー"),
      event(at(10), at(11), "定例"),
    ]);
  });
});

describe("focusMinutes（この後、集中できる時間。design 8.2）", () => {
  it("今から就業終了までのうち、予定と休憩を除いた分数", () => {
    // 10:00〜18:00 の 480分から、14:00〜15:00 の予定と休憩を除く
    expect(focusMinutes([event(at(14), at(15))], workday, at(10))).toBe(360);
  });

  it("今が予定や休憩の途中なら、残りの分だけ除く", () => {
    // 12:30〜18:00 の 330分から、休憩の残りの 30分を除く
    expect(focusMinutes([], workday, at(12, 30))).toBe(300);
  });

  it("就業開始より前は、就業開始から数える", () => {
    expect(focusMinutes([], workday, at(7))).toBe(480);
  });

  it("就業終了の後は 0", () => {
    expect(focusMinutes([], workday, at(18))).toBe(0);
    expect(focusMinutes([], workday, at(20))).toBe(0);
  });

  it("重なった予定や休憩は二重に引かない。就業時間の外の予定は数えない", () => {
    const events = [
      event(at(11, 30), at(12, 30)),
      event(at(14), at(16)),
      event(at(15), at(15, 30)),
      event(at(17, 30), at(19)),
      event(at(7), at(8)),
    ];

    // 9:00〜18:00 の 540分から、11:30〜13:00・14:00〜16:00・17:30〜18:00 を除く
    expect(focusMinutes(events, workday, at(9))).toBe(540 - 90 - 120 - 30);
  });

  it("どんな予定と時刻でも、0 以上で、今から就業終了までの分数を超えない", () => {
    const minute = fc.integer({ min: 0, max: 24 * 60 });
    const events = fc.array(
      fc.tuple(minute, minute).map(([a, b]) => event(Math.min(a, b), Math.max(a, b) + 1)),
    );
    fc.assert(
      fc.property(events, minute, (list, now) => {
        const minutes = focusMinutes(list, workday, now);
        const open = Math.max(0, workday.hours.end - Math.max(now, workday.hours.start));

        expect(minutes).toBeGreaterThanOrEqual(0);
        expect(minutes).toBeLessThanOrEqual(open);
        expect(focusMinutes([...list, ...list], workday, now)).toBe(minutes);
      }),
    );
  });
});

describe("focus（集中できる時間の表示）", () => {
  /** 予定がなく、休憩もない日の 18:00 の minutes 分前 */
  const before = (minutes: number) => focus([], { ...workday, breaks: [] }, at(18) - minutes);

  it.each([
    [230, 3.5, 9],
    [210, 3.5, 8],
    [209, 3, 8],
    [29, 0, 1],
    [1, 0, 0],
  ])(
    "%d分は約 %d時間（%dポモドーロ）。時間は0.5時間刻み、ポモドーロは25分で切り捨て",
    (minutes, hours, pomodoros) => {
      expect(before(minutes)).toEqual({ kind: "open", hours, pomodoros });
    },
  );

  it("就業終了の時刻からは、就業時間が終わったことを示す", () => {
    expect(focus([], workday, at(18))).toEqual({ kind: "ended" });
    expect(focus([], workday, at(23, 59))).toEqual({ kind: "ended" });
  });
});

describe("formatClock", () => {
  it("0時からの分数を「時:分」にする", () => {
    expect(formatClock(at(9, 5))).toBe("9:05");
    expect(formatClock(at(13, 30))).toBe("13:30");
    expect(formatClock(0)).toBe("0:00");
  });
});

describe("タイムラインの配置", () => {
  it("目盛りは就業時間の中の毎正時", () => {
    expect(hourMarks(workday.hours).map((mark) => mark.hour)).toEqual([
      9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
    ]);
    expect(hourMarks({ start: at(8, 30), end: at(10, 30) })).toEqual([
      { hour: 9, top: 30 },
      { hour: 10, top: 90 },
    ]);
  });

  it("予定は就業開始からの位置と長さ。就業時間からはみ出す分は切り、外の予定は描かない", () => {
    const events = [
      event(at(10), at(11), "定例"),
      event(at(8), at(9, 30), "朝"),
      event(at(17, 30), at(19), "夜"),
      event(at(19), at(20), "外"),
      event(at(18), at(19), "終業から"),
    ];

    expect(timelineBlocks(events, workday.hours)).toEqual([
      { event: events[0], top: 60, height: 60 },
      { event: events[1], top: 0, height: 30 },
      { event: events[2], top: 510, height: 30 },
    ]);
  });

  it("現在時刻の位置は就業時間の中だけ", () => {
    expect(nowOffset(at(11, 20), workday.hours)).toBe(140);
    expect(nowOffset(at(9), workday.hours)).toBe(0);
    expect(nowOffset(at(18), workday.hours)).toBe(540);
    expect(nowOffset(at(8, 59), workday.hours)).toBeUndefined();
    expect(nowOffset(at(18, 1), workday.hours)).toBeUndefined();
  });
});

describe("minuteOfDay", () => {
  it("その日の0時からの分数", () => {
    expect(minuteOfDay(new Date(2026, 10, 10, 11, 20, 59))).toBe(at(11, 20));
  });
});
