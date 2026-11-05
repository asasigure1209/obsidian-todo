import type { Rejection } from "@/domain/commands/command";
import { parseTodoLine } from "@/domain/document/todo-line";

/** 利用者への知らせの文言。day-editor と board/session が使う */

export const REJECTION_MESSAGES: Record<Rejection["rejected"], string> = {
  stale: "ファイルが変わっていたので、操作を取りやめて読み直しました",
  invalid: "入力が書式に合わないため、追加・変更しませんでした",
  unstable: "この操作をするとファイルの区切りが変わるため、取りやめました",
};
export const WRITE_FAILED_MESSAGE = "ファイルに書き込めませんでした";
export const expiredMessage = (text: string) =>
  `25分たちました。「${parseTodoLine(text)?.name ?? text}」にポモドーロを記録しました`;
export const DISCARDED_MESSAGE =
  "着手中のカードが見つからないため、計測を取りやめました（記録していません）";
export const missingMessage = (dayKey: string) => `${dayKey} のファイルがありません`;
export const PAST_DAY_MESSAGE = "過去の日は、作業時間の修正だけができます";
