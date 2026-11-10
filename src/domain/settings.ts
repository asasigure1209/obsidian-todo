import { HOUR_MINUTES } from "@/domain/minutes";
import {
  DEFAULT_WORKDAY,
  formatClock,
  parseClock,
  type TimeRange,
  type Workday,
} from "@/domain/schedule";

/** 3つのフォルダ（design 7.1）。どれも同じ日付のファイル名でつながる */
export interface Folders {
  /** その日の TODO ファイル。プラグインが読み書きする */
  todo: string;
  /** 作業ログ。ヘッダーのリンクで開く */
  workLog: string;
  /** 日報。終業の振り返り（M3）で開く */
  dailyReport: string;
}

/** プラグインの設定（design 7.7）。Markdown には書かず、プラグインの保存領域に置く */
export interface Settings {
  folders: Folders;
  /** 就業時間と休憩（design 8.2） */
  workday: Workday;
  /** 25分の満了で短い音を鳴らすか（design 8.1）。オフでも通知は出す */
  sound: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  folders: { todo: "TODO", workLog: "作業ログ", dailyReport: "日報" },
  workday: DEFAULT_WORKDAY,
  sound: true,
};

const DAY_MINUTES = 24 * HOUR_MINUTES;

type Fields = Record<string, unknown>;

/** オブジェクトでなければ、項目のない値として扱う */
function fields(value: unknown): Fields {
  return typeof value === "object" && value !== null ? (value as Fields) : {};
}

/**
 * 保存領域から読んだ値を設定にする。項目ごとに、形が合わなければ既定値にする
 * （プラグインの更新や手での編集で一部が崩れていても、ほかの項目は残す）
 */
export function parseSettings(value: unknown): Settings {
  const { folders, workday, sound } = fields(value);
  return {
    folders: parseFolders(folders),
    workday: parseWorkday(workday),
    sound: typeof sound === "boolean" ? sound : DEFAULT_SETTINGS.sound,
  };
}

function parseFolders(value: unknown): Folders {
  const { todo, workLog, dailyReport } = fields(value);
  const defaults = DEFAULT_SETTINGS.folders;
  return {
    todo: folderOr(todo, defaults.todo),
    workLog: folderOr(workLog, defaults.workLog),
    dailyReport: folderOr(dailyReport, defaults.dailyReport),
  };
}

function folderOr(value: unknown, fallback: string): string {
  return (typeof value === "string" && readFolder(value)) || fallback;
}

/** 就業時間が読めなければ既定の就業時間にする。休憩は1つずつ確かめ、就業時間の中のものだけ残す */
function parseWorkday(value: unknown): Workday {
  const { hours, breaks } = fields(value);
  const open = parseRange(hours) ?? DEFAULT_WORKDAY.hours;
  const listed = Array.isArray(breaks) ? breaks : DEFAULT_WORKDAY.breaks;
  return {
    hours: open,
    breaks: listed.flatMap((item) => {
      const range = parseRange(item);
      return range && within(range, open) ? [range] : [];
    }),
  };
}

function parseRange(value: unknown): TimeRange | undefined {
  const { start, end } = fields(value);
  return isMinute(start) && isMinute(end) && start < end ? { start, end } : undefined;
}

/** 0:00〜23:59 の、整数の分 */
function isMinute(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < DAY_MINUTES;
}

function within(range: TimeRange, hours: TimeRange): boolean {
  return range.start >= hours.start && range.end <= hours.end;
}

/**
 * フォルダ名の入力。前後の空白と / を除く（「TODO/」と「TODO」を同じフォルダとして扱う）。
 * 空になれば読まない（Vault の直下に日付のファイルを散らさない）
 */
export function readFolder(text: string): string | undefined {
  // 空白と / が混ざっていても、前後からまとめて除く（「仕事 /」「/ /」）
  const folder = text.replace(/^[\s/]+|[\s/]+$/g, "");
  return folder === "" ? undefined : folder;
}

/** 設定画面の時刻の欄。始まりと終わりの入力をそのまま持つ */
export interface RangeDraft {
  start: string;
  end: string;
}

/** 設定画面の就業時間と休憩の入力 */
export interface WorkdayDraft {
  hours: RangeDraft;
  breaks: RangeDraft[];
}

/** 時刻の欄の問題。format：時刻の書式に合わない、order：終わりが始まりより後でない、outside：休憩が就業時間の外 */
export type TimeProblem = "format" | "order" | "outside";

/** 入力を読んだ結果。問題がなければ workday に読めた値が入り、問題があれば欄ごとに知らせる */
export interface WorkdayCheck {
  workday: Workday | undefined;
  hours: TimeProblem | undefined;
  /** 休憩の欄ごと。入力と同じ順番・同じ数 */
  breaks: Array<TimeProblem | undefined>;
}

/** 今の就業時間と休憩を、設定画面の入力の形に（「9:00」） */
export function workdayDraft(workday: Workday): WorkdayDraft {
  return { hours: rangeDraft(workday.hours), breaks: workday.breaks.map(rangeDraft) };
}

function rangeDraft(range: TimeRange): RangeDraft {
  return { start: formatClock(range.start), end: formatClock(range.end) };
}

/**
 * 就業時間と休憩の入力を読む。どこか1つでも問題があれば、まとめて読まない
 * （休憩は就業時間の中にあるので、片方だけを変えると、保存した値の組み合わせが崩れることがある）。
 * 就業時間が読めないときは、休憩が中にあるかは確かめない
 */
export function readWorkday(draft: WorkdayDraft): WorkdayCheck {
  const hours = readRange(draft.hours);
  const open = typeof hours === "string" ? undefined : hours;
  const breaks = draft.breaks.map((item) => readBreak(item, open));
  const problems = breaks.filter((item) => typeof item === "string");
  const workday =
    open && problems.length === 0 ? { hours: open, breaks: breaks as TimeRange[] } : undefined;
  return {
    workday,
    hours: typeof hours === "string" ? hours : undefined,
    breaks: breaks.map((item) => (typeof item === "string" ? item : undefined)),
  };
}

function readBreak(draft: RangeDraft, hours: TimeRange | undefined): TimeRange | TimeProblem {
  const range = readRange(draft);
  if (typeof range === "string" || !hours) {
    return range;
  }
  return within(range, hours) ? range : "outside";
}

function readRange(draft: RangeDraft): TimeRange | TimeProblem {
  const start = parseClock(draft.start);
  const end = parseClock(draft.end);
  if (start === undefined || end === undefined) {
    return "format";
  }
  return start < end ? { start, end } : "order";
}
