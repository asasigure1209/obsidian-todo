/** ローカル時刻での日付を、ファイル名に使う `YYYY-MM-DD` にする */
export function toDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** `YYYY-MM-DD` をローカル時刻のその日の0時に */
function fromDayKey(dayKey: string): Date {
  const [year = 0, month = 1, day = 1] = dayKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** days 日ずらした日。Date に日をまたがせ、月末・年末・うるう年を任せる */
function shiftDay(dayKey: string, days: number): string {
  const date = fromDayKey(dayKey);
  date.setDate(date.getDate() + days);
  return toDayKey(date);
}

const DAY_KEY_LENGTH = "YYYY-MM-DD".length;

/**
 * 暦にある日の `YYYY-MM-DD` か。Date に通して同じ文字列に戻れば、形が正しく、ありえない日付（2月30日など）でもない。
 * 長さは、4桁でない年（`999-01-01`）を除くために見る
 */
export function isDayKey(text: string): boolean {
  return text.length === DAY_KEY_LENGTH && shiftDay(text, 0) === text;
}

/** 前日（ヘッダーの「前の日」。design 8.3） */
export function previousDay(dayKey: string): string {
  return shiftDay(dayKey, -1);
}

/** 翌日（ヘッダーの「次の日」）。今日より先へ進めるかは canOpen で決める */
export function nextDay(dayKey: string): string {
  return shiftDay(dayKey, 1);
}

/** 今日と過去の日のボードは開ける。未来の日は開けない（design 8.3） */
export function canOpen(dayKey: string, today: string): boolean {
  return dayKey <= today;
}

const WEEKDAYS = "日月火水木金土";

/** 「M月D日」。月と日は0で埋めない */
function monthDay(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/** ヘッダーの日付。「11月10日（火）」 */
export function formatDayLabel(dayKey: string): string {
  const date = fromDayKey(dayKey);
  return `${monthDay(date)}（${WEEKDAYS[date.getDay()]}）`;
}

/** タブの見出し。今日は「今日のボード」、過去の日は「11月9日のボード」 */
export function boardTitle(dayKey: string, today: string): string {
  return dayKey === today ? "今日のボード" : `${monthDay(fromDayKey(dayKey))}のボード`;
}

const DAY_FILE_EXTENSION = ".md";

/** その日のファイル名 `YYYY-MM-DD.md`。TODO・作業ログ・日報は、同じ日付のファイル名でつながる（design 7.1） */
export function dayFileName(dayKey: string): string {
  return dayKey + DAY_FILE_EXTENSION;
}

/** その日のファイル名（`YYYY-MM-DD.md`）なら、その日。ほかの名前とありえない日付は undefined */
export function dayKeyOfFileName(name: string): string | undefined {
  const dayKey = name.slice(0, -DAY_FILE_EXTENSION.length);
  return name.endsWith(DAY_FILE_EXTENSION) && isDayKey(dayKey) ? dayKey : undefined;
}

/** その日のファイル */
export function dayFilePath(folder: string, dayKey: string): string {
  return `${folder}/${dayFileName(dayKey)}`;
}

/** ボードの操作の種類。work は作業時間の追加・修正・削除（M2）、interrupt は計測の「中断」、create は「今日のファイルを作る」（design 7.8） */
export type EditKind = "move" | "complete" | "add" | "work" | "interrupt" | "create";

/** 過去の日にもできる操作。中断は経過分を記録するだけなので、日付をまたいだボードでもその日の計測を止められる */
const PAST_DAY_KINDS: ReadonlySet<EditKind> = new Set(["work", "interrupt"]);

/** 今日はすべて、過去の日は作業時間の修正と中断だけ、未来の日は何もできない（design 8.3）。日付は `YYYY-MM-DD` なので文字列で比べられる */
export function canEdit(kind: EditKind, dayKey: string, today: string): boolean {
  if (!canOpen(dayKey, today)) {
    return false;
  }
  return dayKey === today || PAST_DAY_KINDS.has(kind);
}
