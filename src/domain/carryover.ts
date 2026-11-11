import { isDayKey } from "@/domain/day";
import {
  type DayDocument,
  type Line,
  parseDocument,
  serializeDocument,
  type TodoBlock,
  todoBlocks,
} from "@/domain/document/body";
import { formatTodoLine } from "@/domain/document/todo-line";
import { parseWorkEntry } from "@/domain/document/work-entry";

/** 前日の未完了の複製（design 7.8） */

const EXTENSION = ".md";

/** 直近の過去ファイルの日。TODO のフォルダにある、今日より前の日付の `YYYY-MM-DD.md` のうちいちばん新しい日 */
export function latestDayBefore(names: readonly string[], today: string): string | undefined {
  return names
    .filter((name) => name.endsWith(EXTENSION))
    .map((name) => name.slice(0, -EXTENSION.length))
    .filter((dayKey) => isDayKey(dayKey) && dayKey < today)
    .sort()
    .at(-1);
}

/**
 * 今日のファイルの本文。frontmatter の `date` と、直近の過去ファイルの `[ ]`・`[/]` の TODO ブロックだけ（events は書かない）。
 * 記号は `[ ]` に戻し、見積もりと作業時間ではない子の行（メモ）は残す。作業時間の子の行は複製しない。
 * 過去のファイルがなければ空の本文を渡す（frontmatter だけになる）。改行は過去のファイルに合わせる（空なら `\n`）
 */
export function carryOver(previous: string, today: string): string {
  const source = parseDocument(previous);
  const doc: DayDocument = {
    frontmatter: ["---", `date: ${today}`, "---"].map(newLine),
    segments: todoBlocks(source.segments)
      .filter((block) => block.todo.status !== "done")
      .map(reopen),
    eol: source.eol,
    endsWithEol: true,
  };
  return serializeDocument(doc);
}

/** 記号を `[ ]` に戻し、作業時間の子の行を外す。改行は書き戻しで決める */
function reopen(block: TodoBlock): TodoBlock {
  const todo = { ...block.todo, status: "todo" as const };
  return {
    kind: "todo",
    todo,
    head: newLine(formatTodoLine(todo)),
    children: block.children
      .filter((line) => parseWorkEntry(line.text) === undefined)
      .map((line) => newLine(line.text)),
  };
}

function newLine(text: string): Line {
  return { text, eol: "" };
}
