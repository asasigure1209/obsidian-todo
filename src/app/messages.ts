import type { Rejection } from "@/domain/commands/command";
import { parseTodoLine } from "@/domain/document/todo-line";
import type { TimeProblem } from "@/domain/settings";

/** 利用者への知らせの文言。day-editor・board/session・settings・BoardView・SettingsTab が使う */

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
export const WORK_LOG_FAILED_MESSAGE = "作業ログを開けませんでした";
export const DAILY_REPORT_FAILED_MESSAGE = "日報を開けませんでした";
export const SETTINGS_SAVE_FAILED_MESSAGE =
  "設定を保存できませんでした。Obsidian を開き直すと、前の設定に戻ります";

/** 設定画面の入力の問題。保存しなかったことも伝える（直すまで前の値を使う） */
export const FOLDER_EMPTY_MESSAGE = "フォルダ名を入れてください。直すまでは前のフォルダを使います";
export const TIME_PROBLEM_MESSAGES: Record<TimeProblem, string> = {
  format: "時刻は 9:00 の形で入れてください。直すまでは前の就業時間と休憩を使います",
  order: "終わりは始まりより後の時刻にしてください。直すまでは前の就業時間と休憩を使います",
  outside: "休憩は就業時間の中にしてください。直すまでは前の就業時間と休憩を使います",
};
