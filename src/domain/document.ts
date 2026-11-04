/** 1行。改行コード（`\n`・`\r\n`、最後の行で改行がなければ空）を分けて持ち、書き戻しで元に戻せるようにする */
export interface Line {
  text: string;
  eol: string;
}

/** TODO 行と、それより深く字下げされた後続の行（作業時間・書式外のメモ） */
export interface TodoBlock {
  kind: "todo";
  head: Line;
  children: Line[];
}

/** どの TODO ブロックにも属さない行。中身は解釈しない */
export interface FixedLine {
  kind: "fixed";
  line: Line;
}

export type Segment = TodoBlock | FixedLine;

/** 1日のファイル。frontmatter は解釈せず生の行のまま持つ（AD-4） */
export interface DayDocument {
  frontmatter: Line[];
  segments: Segment[];
}

const FRONTMATTER_FENCE = "---";
const INDENTED = /^[ \t]+\S/;

export type Status = "todo" | "doing" | "done";

export type Estimate = "小" | "1" | "2" | "3" | "4";

export interface TodoLine {
  status: Status;
  name: string;
  estimate?: Estimate;
}

const STATUS_BY_MARK: Record<string, Status> = { " ": "todo", "/": "doing", x: "done" };
const MARK_BY_STATUS: Record<Status, string> = { todo: " ", doing: "/", done: "x" };
const TODO_LINE = /^- \[([ /x])\] (.*?)(?: \[est:: (小|[1-4])\])?$/;

export function parseTodoLine(text: string): TodoLine | undefined {
  const match = TODO_LINE.exec(text);
  if (!match) {
    return undefined;
  }
  const [, mark = "", name = "", estimate] = match;
  if (name.trim() === "") {
    return undefined;
  }
  const status = STATUS_BY_MARK[mark] as Status;
  return estimate ? { status, name, estimate: estimate as Estimate } : { status, name };
}

export function formatTodoLine(todo: TodoLine): string {
  const estimate = todo.estimate ? ` [est:: ${todo.estimate}]` : "";
  return `- [${MARK_BY_STATUS[todo.status]}] ${todo.name}${estimate}`;
}

export function parseDocument(body: string): DayDocument {
  const lines = splitLines(body);
  const frontmatterLength = findFrontmatterLength(lines);
  return {
    frontmatter: lines.slice(0, frontmatterLength),
    segments: toSegments(lines.slice(frontmatterLength)),
  };
}

export function serializeDocument(doc: DayDocument): string {
  const lines = [...doc.frontmatter, ...doc.segments.flatMap(segmentLines)];
  return lines.map((line) => line.text + line.eol).join("");
}

function splitLines(body: string): Line[] {
  return (body.match(/[^\n]*\n|[^\n]+$/g) ?? []).map(toLine);
}

function toLine(piece: string): Line {
  const eol = /\r?\n$/.exec(piece)?.[0] ?? "";
  return { text: piece.slice(0, piece.length - eol.length), eol };
}

/** 先頭の `---` から次の `---` までの行数。閉じていなければ frontmatter はない */
function findFrontmatterLength(lines: Line[]): number {
  if (lines[0]?.text !== FRONTMATTER_FENCE) {
    return 0;
  }
  const closing = lines.findIndex((line, i) => i > 0 && line.text === FRONTMATTER_FENCE);
  return closing + 1;
}

function toSegments(lines: Line[]): Segment[] {
  const segments: Segment[] = [];
  for (const line of lines) {
    const current = segments.at(-1);
    if (current?.kind === "todo" && INDENTED.test(line.text)) {
      current.children.push(line);
    } else {
      segments.push(toSegment(line));
    }
  }
  return segments;
}

function toSegment(line: Line): Segment {
  return parseTodoLine(line.text)
    ? { kind: "todo", head: line, children: [] }
    : { kind: "fixed", line };
}

function segmentLines(segment: Segment): Line[] {
  return segment.kind === "todo" ? [segment.head, ...segment.children] : [segment.line];
}

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
const EVENTS_KEY = /^events:\s*$/;
const LIST_ITEM = /^\s*- (.*)$/;
const QUOTED = /^(["'])(.*)\1$/;

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

/** 作業時間の行を書き足すときの字下げ。既存の子の行に合わせ、なければスペース4つ */
export function childIndent(block: TodoBlock): string {
  const indent = block.children[0]?.text.match(/^[ \t]+/)?.[0];
  return indent ?? DEFAULT_CHILD_INDENT;
}

/** frontmatter の `events` の各項目。予定としての解釈は schedule.ts が行う */
export function eventLines(doc: DayDocument): string[] {
  // events がなければ start は -1 になり、先頭の `---` で読み終わる
  const start = doc.frontmatter.findIndex((line) => EVENTS_KEY.test(line.text));
  const items: string[] = [];
  for (const line of doc.frontmatter.slice(start + 1)) {
    const item = LIST_ITEM.exec(line.text)?.[1];
    if (item === undefined) {
      break;
    }
    items.push(unquote(item));
  }
  return items;
}

function unquote(value: string): string {
  return QUOTED.exec(value)?.[2] ?? value;
}
