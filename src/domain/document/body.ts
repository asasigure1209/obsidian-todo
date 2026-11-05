import { parseTodoLine, type TodoLine } from "@/domain/document/todo-line";

/**
 * 1行。改行コード（`\n`・`\r\n`）を分けて持ち、書き戻しで元に戻せるようにする。
 * 空のときは書き戻しで決める（最後の行で改行がない、または追加した行）
 */
export interface Line {
  text: string;
  eol: string;
}

/** TODO 行と、それより深く字下げされた後続の行（作業時間・書式外のメモ） */
export interface TodoBlock {
  kind: "todo";
  /** head を読んだ結果 */
  todo: TodoLine;
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
  /** 改行が空の行に付ける改行。本文で最初に使われている改行 */
  eol: string;
  /** 末尾に改行があるか。空の本文は true（追加した行に改行を付ける） */
  endsWithEol: boolean;
}

const FRONTMATTER_FENCE = "---";
const DEFAULT_EOL = "\n";
const INDENTED = /^[ \t]+\S/;

export function parseDocument(body: string): DayDocument {
  const lines = splitLines(body);
  const frontmatterLength = findFrontmatterLength(lines);
  return {
    frontmatter: lines.slice(0, frontmatterLength),
    segments: toSegments(lines.slice(frontmatterLength)),
    eol: lines.find((line) => line.eol !== "")?.eol ?? DEFAULT_EOL,
    endsWithEol: lines.at(-1)?.eol !== "",
  };
}

export function serializeDocument(doc: DayDocument): string {
  const lines = documentLines(doc);
  return lines.map((line, i) => line.text + eolOf(doc, line, i === lines.length - 1)).join("");
}

/**
 * 書き戻す改行。本文の途中に改行のない行を残さない。末尾に改行がなかった本文は末尾に改行を付けない。
 * ただし最後の行が空行なら、改行を外すと行そのものが消えるので付ける
 */
function eolOf(doc: DayDocument, line: Line, isLast: boolean): string {
  if (isLast && !doc.endsWithEol && line.text !== "") {
    return "";
  }
  return line.eol || eolAfter(line.text, doc.eol);
}

/** 行末の `\r` に `\n` を続けると CRLF と読まれて `\r` が消えるので、そのときは `\r\n` を付ける */
function eolAfter(text: string, eol: string): string {
  return text.endsWith("\r") ? "\r\n" : eol;
}

/** frontmatter から本文の末尾までの全行 */
function documentLines(doc: DayDocument): Line[] {
  return [...doc.frontmatter, ...doc.segments.flatMap(segmentLines)];
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
  const todo = parseTodoLine(line.text);
  return todo ? { kind: "todo", todo, head: line, children: [] } : { kind: "fixed", line };
}

/** TODO ブロックだけを、本文の順番で。n 番目がコマンドの LineRef の index になる（AD-5） */
export function todoBlocks(segments: Segment[]): TodoBlock[] {
  return segments.filter((segment): segment is TodoBlock => segment.kind === "todo");
}

function segmentLines(segment: Segment): Line[] {
  return segment.kind === "todo" ? [segment.head, ...segment.children] : [segment.line];
}
