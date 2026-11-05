/** ローカル時刻での日付を、ファイル名に使う `YYYY-MM-DD` にする */
export function toDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** ボードの操作の種類。work は作業時間の追加・修正・削除（M2）、interrupt は計測の「中断」 */
export type EditKind = "move" | "complete" | "add" | "work" | "interrupt";

/** 過去の日にもできる操作。中断は経過分を記録するだけなので、日付をまたいだボードでもその日の計測を止められる */
const PAST_DAY_KINDS: ReadonlySet<EditKind> = new Set(["work", "interrupt"]);

/** 今日はすべて、過去の日は作業時間の修正と中断だけ、未来の日は何もできない（design 8.3）。日付は `YYYY-MM-DD` なので文字列で比べられる */
export function canEdit(kind: EditKind, dayKey: string, today: string): boolean {
  if (dayKey > today) {
    return false;
  }
  return dayKey === today || PAST_DAY_KINDS.has(kind);
}
