import type { DayDocument } from "@/domain/document/body";
import { eventLines } from "@/domain/document/events";
import { HOUR_MINUTES, toPomodoros } from "@/domain/minutes";

/** 時刻の範囲。どちらも0時からの分数で、end は含まない */
export interface TimeRange {
  start: number;
  end: number;
}

/** その日の予定（design 7.3）。Claude が Googleカレンダーから取得して events に書いたもの */
export interface ScheduledEvent extends TimeRange {
  title: string;
}

/** 就業時間と休憩（design 8.2） */
export interface Workday {
  hours: TimeRange;
  breaks: TimeRange[];
}

/** 設定画面ができるまでの既定値。9:00〜18:00、休憩 12:00〜13:00 */
export const DEFAULT_WORKDAY: Workday = {
  hours: { start: 9 * HOUR_MINUTES, end: 18 * HOUR_MINUTES },
  breaks: [{ start: 12 * HOUR_MINUTES, end: 13 * HOUR_MINUTES }],
};

// 予定名は時刻の後の空白を飛ばした最初の文字から、最後の空白でない文字まで（前後の空白は予定名に入れない）
const EVENT_LINE = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2}) +(\S.*\S|\S)/;
const HOUR = HOUR_MINUTES;

/** `HH:MM-HH:MM 予定名` を読む。書式に合わない行、ありえない時刻、終わりが始まり以前の行は予定にしない */
export function parseEvent(line: string): ScheduledEvent | undefined {
  const match = EVENT_LINE.exec(line);
  if (!match) {
    return undefined;
  }
  const [, sh = "", sm = "", eh = "", em = "", title = ""] = match;
  // ありえない時刻は NaN になり、start < end が成り立たない
  const start = toMinutes(sh, sm);
  const end = toMinutes(eh, em);
  return start < end ? { start, end, title } : undefined;
}

/** frontmatter の events から、読める予定だけを書いた順に。読めない行は描かずに残す（design 7.3） */
export function scheduledEvents(doc: DayDocument): ScheduledEvent[] {
  return eventLines(doc).flatMap((line) => parseEvent(line) ?? []);
}

/**
 * この後、集中できる分数（design 8.2）。今（就業前なら就業開始）から就業終了までのうち、予定と休憩を除いた分。
 * 重なった予定や休憩は、まとめてから除く
 */
export function focusMinutes(events: TimeRange[], workday: Workday, now: number): number {
  const open = { start: Math.max(now, workday.hours.start), end: workday.hours.end };
  // 就業終了の後は open が空になり、予定も休憩も入らない
  const busy = merge([...events, ...workday.breaks].flatMap((range) => clip(range, open) ?? []));
  const total = Math.max(0, open.end - open.start);
  return busy.reduce((rest, range) => rest - (range.end - range.start), total);
}

/** 集中できる時間の表示。就業終了の後は ended、それまでは約何時間・何ポモドーロか */
export type Focus = { kind: "ended" } | { kind: "open"; hours: number; pomodoros: number };

/** 時間は 0.5時間刻みで切り捨て、ポモドーロは25分で割って切り捨てる（多めに出さない） */
export function focus(events: TimeRange[], workday: Workday, now: number): Focus {
  if (now >= workday.hours.end) {
    return { kind: "ended" };
  }
  const minutes = focusMinutes(events, workday, now);
  return {
    kind: "open",
    hours: Math.floor(minutes / (HOUR / 2)) / 2,
    pomodoros: toPomodoros(minutes),
  };
}

/**
 * その日に可能なポモドーロ数（ヘッダーの分母）。就業時間の全体から予定と休憩を除き、25分で割って切り捨てる。
 * 今の時刻に左右されないので、1日の中で変わらない
 */
export function dayPomodoroCapacity(events: TimeRange[], workday: Workday): number {
  return toPomodoros(focusMinutes(events, workday, workday.hours.start));
}

/** 進捗バーの割合（0〜1）。可能な数を超えても満たすだけで、可能な数が 0 なら空のまま */
export function focusProgress(done: number, capacity: number): number {
  return capacity > 0 ? Math.min(done / capacity, 1) : 0;
}

/** 目盛り。top は就業開始からの分数 */
export interface HourMark {
  hour: number;
  top: number;
}

/** 就業時間の中の毎正時 */
export function hourMarks(hours: TimeRange): HourMark[] {
  const first = Math.ceil(hours.start / HOUR);
  const last = Math.floor(hours.end / HOUR);
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => ({
    hour: first + i,
    top: (first + i) * HOUR - hours.start,
  }));
}

/** 予定のブロック。top と height は就業開始からの分数で、就業時間からはみ出す分は切る */
export interface TimelineBlock {
  event: ScheduledEvent;
  top: number;
  height: number;
}

/** 就業時間の外の予定は描かない */
export function timelineBlocks(events: ScheduledEvent[], hours: TimeRange): TimelineBlock[] {
  return events.flatMap((event) => {
    const range = clip(event, hours);
    return range
      ? [{ event, top: range.start - hours.start, height: range.end - range.start }]
      : [];
  });
}

/** 現在時刻の線の位置（就業開始からの分数）。就業時間の外なら引かない */
export function nowOffset(now: number, hours: TimeRange): number | undefined {
  return now >= hours.start && now <= hours.end ? now - hours.start : undefined;
}

/** 0時からの分数を「時:分」に（9:05） */
export function formatClock(minutes: number): string {
  return `${Math.floor(minutes / HOUR)}:${String(minutes % HOUR).padStart(2, "0")}`;
}

/** 0時からの分数 */
export function minuteOfDay(date: Date): number {
  return date.getHours() * HOUR + date.getMinutes();
}

/** ありえない時刻は NaN */
function toMinutes(hour: string, minute: string): number {
  const h = Number(hour);
  const m = Number(minute);
  return h < 24 && m < HOUR ? h * HOUR + m : Number.NaN;
}

/** range のうち within に入る部分。入らなければ undefined */
function clip(range: TimeRange, within: TimeRange): TimeRange | undefined {
  const start = Math.max(range.start, within.start);
  const end = Math.min(range.end, within.end);
  return start < end ? { start, end } : undefined;
}

/** 重なる・接する範囲を1つにまとめる */
function merge(ranges: TimeRange[]): TimeRange[] {
  const merged: TimeRange[] = [];
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}
