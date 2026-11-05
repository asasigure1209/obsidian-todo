import type { Line, TodoBlock } from "@/domain/document/body";

export type WorkKind = "ポモドーロ" | "中断" | "手動";

/** 作業時間の子の行。字下げは書き戻しで元に戻すために持つ */
export interface WorkEntry {
  indent: string;
  minutes: number;
  kind: WorkKind;
  memo?: string;
}

const WORK_ENTRY = /^([ \t]+)- ([1-9]\d*)分 (ポモドーロ|中断|手動)(?: (.*\S))?$/;
const DEFAULT_CHILD_INDENT = "    ";

export function parseWorkEntry(text: string): WorkEntry | undefined {
  const match = WORK_ENTRY.exec(text);
  if (!match) {
    return undefined;
  }
  const [, indent = "", minutes = "", kind, memo] = match;
  const entry: WorkEntry = { indent, minutes: Number(minutes), kind: kind as WorkKind };
  return memo === undefined ? entry : { ...entry, memo };
}

export function formatWorkEntry(entry: WorkEntry): string {
  const memo = entry.memo === undefined ? "" : ` ${entry.memo}`;
  return `${entry.indent}- ${entry.minutes}分 ${entry.kind}${memo}`;
}

/** 作業時間の子の行と、その読み取り結果 */
export interface WorkLine {
  line: Line;
  entry: WorkEntry;
}

/** カードの作業時間の行を本文の順番で。n 番目が作業時間の LineRef の index になる（AD-5）。書式外の子の行は数えない */
export function workLines(block: TodoBlock): WorkLine[] {
  return block.children.flatMap((line) => {
    const entry = parseWorkEntry(line.text);
    return entry ? [{ line, entry }] : [];
  });
}

/** 作業時間の行に書ける分数か（1以上の整数。書式の `[1-9]\d*分` に当たる） */
export function isWorkMinutes(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes >= 1;
}

/** 作業時間の行を書き足すときの字下げ。既存の子の行に合わせ、なければスペース4つ */
export function childIndent(block: TodoBlock): string {
  const indent = block.children[0]?.text.match(/^[ \t]+/)?.[0];
  return indent ?? DEFAULT_CHILD_INDENT;
}
