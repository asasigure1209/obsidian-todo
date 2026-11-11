import { type Board, type Card, dayPomodoros, type WorkRecord } from "@/domain/board";
import type { Estimate } from "@/domain/document/todo-line";
import type { WorkKind } from "@/domain/document/work-entry";
import { HOUR_MINUTES, POMODORO_MINUTES, pomodoroEquivalent } from "@/domain/minutes";

/** 見積もりとの差（design 5章 M3）。over の pomodoros は小数1桁 */
export type Difference = { kind: "over"; pomodoros: number } | { kind: "early" } | { kind: "even" };

/** 日報の材料の、見積もりの2倍以上かかった完了 TODO。ratio は小数1桁 */
export interface Overrun {
  name: string;
  ratio: number;
}

/** 見積もりと実績の表の1行。完了した TODO だけ。見積もりのない TODO は estimate と difference を持たない */
export interface ReviewRow {
  key: string;
  name: string;
  estimate?: Estimate;
  /** 実績。作業時間の合計（手動を含む） */
  minutes: number;
  difference?: Difference;
}

/** 終業の振り返り（design 5章 M3）。何も書き込まない */
export interface DayReview {
  /** 完了の数 */
  completed: number;
  /** その日の TODO の数（3列の合計） */
  total: number;
  /** 人の集中時間。ポモドーロと中断の分の合計（手動は数えない） */
  focusMinutes: number;
  /** ポモドーロの行の数（ヘッダーの完了数と同じ） */
  pomodoros: number;
  /** 中断の行の数 */
  interruptions: number;
  rows: ReviewRow[];
  /** 今日やると着手中の数（翌日へ複製される数） */
  unfinished: number;
  /** メモのある中断のメモ。本文の順 */
  interruptionMemos: string[];
  /** 見積もりの2倍以上かかった完了 TODO */
  overruns: Overrun[];
}

/** タイマーで測った記録（ポモドーロと中断）。手動は人の集中時間に数えない */
const TIMED: ReadonlySet<WorkKind> = new Set(["ポモドーロ", "中断"]);

/** 表と見積もり超過は完了した TODO だけ。集中時間と中断はすべての列のカードから数える */
export function toReview(board: Board): DayReview {
  // 中断のメモを本文の順に並べるため、列ではなく行の順に
  const cards = [...board.todo, ...board.doing, ...board.done].sort(
    (a, b) => a.ref.index - b.ref.index,
  );
  const entries = cards.flatMap((card) => card.entries);
  const interrupts = entries.filter((entry) => entry.kind === "中断");
  return {
    completed: board.done.length,
    total: cards.length,
    focusMinutes: sumMinutes(entries.filter((entry) => TIMED.has(entry.kind))),
    pomodoros: dayPomodoros(board),
    interruptions: interrupts.length,
    rows: board.done.map(toRow),
    unfinished: board.todo.length + board.doing.length,
    interruptionMemos: interrupts.flatMap((entry) => (entry.memo ? [entry.memo] : [])),
    overruns: board.done.flatMap(overrun),
  };
}

function sumMinutes(entries: WorkRecord[]): number {
  return entries.reduce((sum, entry) => sum + entry.minutes, 0);
}

function toRow({ key, name, estimate, workedMinutes: minutes }: Card): ReviewRow {
  return estimate
    ? { key, name, estimate, minutes, difference: difference(minutes, estimate) }
    : { key, name, minutes };
}

/** 見積もりの2倍以上。丸める前の分数で比べる（49分は見積もり1の2倍に届かない） */
function overrun({ name, estimate, workedMinutes }: Card): Overrun[] {
  return estimate && workedMinutes >= 2 * estimateMinutes(estimate)
    ? [{ name, ratio: estimateRatio(workedMinutes, estimate) }]
    : [];
}

/** 小数1桁に四捨五入する。引き算の誤差（2.3 − 1 = 1.2999…）もここで消す */
const tenths = (value: number): number => Math.round(value * 10) / 10;

/** 人の集中時間。「3h 05m」、1時間未満は「45m」 */
export function formatFocusTime(minutes: number): string {
  const hours = Math.floor(minutes / HOUR_MINUTES);
  const rest = minutes % HOUR_MINUTES;
  return hours === 0 ? `${rest}m` : `${hours}h ${String(rest).padStart(2, "0")}m`;
}

/** 実績。ポモドーロを小数1桁（整数は「4」）、25分未満は分で「12分」 */
export function formatActual(minutes: number): string {
  return minutes < POMODORO_MINUTES ? `${minutes}分` : String(pomodoroEquivalent(minutes));
}

/**
 * 見積もりを「この範囲なら ±0」の幅で表す。`小` は1以下、`4` は4以上（design 7.5）。
 * 1〜3 は、その数ちょうど
 */
function estimateRange(estimate: Estimate): { lower: number; upper: number } {
  if (estimate === "小") {
    return { lower: Number.NEGATIVE_INFINITY, upper: 1 };
  }
  const value = Number(estimate);
  return { lower: value, upper: estimate === "4" ? Number.POSITIVE_INFINITY : value };
}

/** 実績（小数1桁のポモドーロ）と見積もりの差 */
export function difference(minutes: number, estimate: Estimate): Difference {
  const actual = pomodoroEquivalent(minutes);
  const { lower, upper } = estimateRange(estimate);
  if (actual > upper) {
    return { kind: "over", pomodoros: tenths(actual - upper) };
  }
  return actual < lower ? { kind: "early" } : { kind: "even" };
}

const DIFFERENCE_TEXT = { early: "早く完了", even: "±0" } as const;

/** 「+2（超過）」「早く完了」「±0」 */
export function formatDifference(value: Difference): string {
  return value.kind === "over" ? `+${value.pomodoros}（超過）` : DIFFERENCE_TEXT[value.kind];
}

/** 見積もりの分数。`小` は25分、`4` は100分として数える */
function estimateMinutes(estimate: Estimate): number {
  return estimate === "小" ? POMODORO_MINUTES : Number(estimate) * POMODORO_MINUTES;
}

/** 見積もりの何倍かかったか。小数1桁に四捨五入 */
export function estimateRatio(minutes: number, estimate: Estimate): number {
  return tenths(minutes / estimateMinutes(estimate));
}

/** 「API設計レビューの指摘に対応は見積もりの2倍」 */
export function formatOverrun({ name, ratio }: Overrun): string {
  return `${name}は見積もりの${ratio}倍`;
}
