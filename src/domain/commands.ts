import {
  childIndent,
  type DayDocument,
  documentLines,
  type Estimate,
  formatTodoLine,
  formatWorkEntry,
  type Line,
  parseDocument,
  parseTodoLine,
  parseWorkEntry,
  type Segment,
  type Status,
  serializeDocument,
  type TodoBlock,
  type TodoLine,
  type WorkEntry,
  type WorkKind,
} from "@/domain/document";

/** 操作の対象のカード。n 番目の TODO ブロックと、その TODO 行の文字列（AD-5） */
export interface CardRef {
  index: number;
  text: string;
}

/** 操作の対象の作業時間。カードの中で n 番目の作業時間の行と、その行の文字列 */
export interface EntryRef {
  index: number;
  text: string;
}

export interface WorkInput {
  minutes: number;
  kind: WorkKind;
  memo?: string;
}

/** 1回の操作。対象が見つからない・入力が書式にならないときは undefined（何もしない） */
export type DocumentCommand = (doc: DayDocument) => DayDocument | undefined;

const DEFAULT_EOL = "\n";
const COLUMN_END = Number.POSITIVE_INFINITY;

/** `vault.process` に渡す形。何もしないときは undefined */
export function applyToBody(body: string, command: DocumentCommand): string | undefined {
  const next = command(parseDocument(body));
  return next ? serializeDocument(next) : undefined;
}

/** 今日やるのいちばん下に追加する（M4） */
export function addTodo(
  doc: DayDocument,
  name: string,
  estimate?: Estimate,
): DayDocument | undefined {
  const todo: TodoLine = { status: "todo", name: singleLine(name), ...(estimate && { estimate }) };
  const text = formatTodoLine(todo);
  if (parseTodoLine(text)?.name !== todo.name) {
    return undefined;
  }
  const block: TodoBlock = { kind: "todo", head: { text, eol: "" }, children: [] };
  return settle(doc, insertIntoColumn(doc.segments, block, "todo", COLUMN_END));
}

/** カードを列の中の位置へ動かす。着手中へ動かすと、前の着手中は今日やるの先頭へ戻す（design 8.1） */
export function moveCard(
  doc: DayDocument,
  card: CardRef,
  status: Status,
  position: number,
): DayDocument | undefined {
  const target = findCard(doc, card);
  if (!target) {
    return undefined;
  }
  const rest = doc.segments.filter((segment) => segment !== target);
  const segments = status === "doing" ? demoteDoing(rest) : rest;
  return settle(doc, insertIntoColumn(segments, withStatus(target, status), status, position));
}

/** 「完了にする」ボタン。完了の末尾に入れる（design 8.6） */
export function completeCard(doc: DayDocument, card: CardRef): DayDocument | undefined {
  return moveCard(doc, card, "done", COLUMN_END);
}

/** 作業時間をカードの最後の子の行として足す */
export function addWork(doc: DayDocument, card: CardRef, work: WorkInput): DayDocument | undefined {
  return updateBlock(doc, card, (block) => {
    const line = workLine(childIndent(block), work, "");
    return line && { ...block, children: [...block.children, line] };
  });
}

/** 作業時間を書き換える（M2）。手で直した記録なので種類は手動になる */
export function updateWork(
  doc: DayDocument,
  card: CardRef,
  entry: EntryRef,
  work: Omit<WorkInput, "kind">,
): DayDocument | undefined {
  return updateBlock(doc, card, (block) => {
    const current = findEntry(block, entry);
    const line = current && rewriteEntry(current, work);
    return (
      line && {
        ...block,
        children: block.children.map((child) => (child === current ? line : child)),
      }
    );
  });
}

/** 作業時間を削除する（M2）。書式外の子の行は残す */
export function removeWork(
  doc: DayDocument,
  card: CardRef,
  entry: EntryRef,
): DayDocument | undefined {
  return updateBlock(doc, card, (block) => {
    const current = findEntry(block, entry);
    return current && { ...block, children: block.children.filter((child) => child !== current) };
  });
}

function todoBlocks(segments: Segment[]): TodoBlock[] {
  return segments.filter((segment): segment is TodoBlock => segment.kind === "todo");
}

function findCard(doc: DayDocument, card: CardRef): TodoBlock | undefined {
  const block = todoBlocks(doc.segments)[card.index];
  return block?.head.text === card.text ? block : undefined;
}

function findEntry(block: TodoBlock, entry: EntryRef): Line | undefined {
  const line = block.children.filter((child) => parseWorkEntry(child.text))[entry.index];
  return line?.text === entry.text ? line : undefined;
}

function updateBlock(
  doc: DayDocument,
  card: CardRef,
  update: (block: TodoBlock) => TodoBlock | undefined,
): DayDocument | undefined {
  const target = findCard(doc, card);
  const next = target && update(target);
  return (
    next &&
    settle(
      doc,
      doc.segments.map((segment) => (segment === target ? next : segment)),
    )
  );
}

function statusOf(block: TodoBlock): Status {
  return (parseTodoLine(block.head.text) as TodoLine).status;
}

function withStatus(block: TodoBlock, status: Status): TodoBlock {
  const todo = parseTodoLine(block.head.text) as TodoLine;
  return { ...block, head: { ...block.head, text: formatTodoLine({ ...todo, status }) } };
}

function demoteDoing(segments: Segment[]): Segment[] {
  const doing = todoBlocks(segments).filter((block) => statusOf(block) === "doing");
  return doing.reduce(
    (acc, block) =>
      insertIntoColumn(
        acc.filter((segment) => segment !== block),
        withStatus(block, "todo"),
        "todo",
        0,
      ),
    segments,
  );
}

/** 列の中の position 番目に入れる。列の件数以上なら列の末尾（AD-4 の列の端） */
function insertIntoColumn(
  segments: Segment[],
  block: TodoBlock,
  status: Status,
  position: number,
): Segment[] {
  const column = todoBlocks(segments).filter((other) => statusOf(other) === status);
  const before = column[Math.max(0, position)];
  const at = before ? segments.indexOf(before) : endOfColumn(segments, column);
  return [...segments.slice(0, at), block, ...segments.slice(at)];
}

/** 列の最後のブロックの直後。列が空なら最後の TODO ブロックの直後、TODO がなければ本文の末尾 */
function endOfColumn(segments: Segment[], column: TodoBlock[]): number {
  const last = column.at(-1) ?? todoBlocks(segments).at(-1);
  return last ? segments.indexOf(last) + 1 : segments.length;
}

function workLine(indent: string, work: WorkInput, eol: string): Line | undefined {
  const memo = singleLine(work.memo ?? "");
  const text = formatWorkEntry({
    indent,
    minutes: work.minutes,
    kind: work.kind,
    ...(memo && { memo }),
  });
  return parseWorkEntry(text) ? { text, eol } : undefined;
}

/** 字下げと改行はそのままに、分数とメモを書き換える */
function rewriteEntry(line: Line, work: Omit<WorkInput, "kind">): Line | undefined {
  const { indent } = parseWorkEntry(line.text) as WorkEntry;
  return workLine(indent, { ...work, kind: "手動" }, line.eol);
}

function singleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** 本文の途中に改行のない行を残さない。末尾に改行がなかった本文は、末尾に改行を付けない（AD-3） */
function settle(original: DayDocument, segments: Segment[]): DayDocument | undefined {
  const lines = documentLines(original);
  const eol = lines.find((line) => line.eol !== "")?.eol ?? DEFAULT_EOL;
  const next = { frontmatter: original.frontmatter, segments };
  const last = documentLines(next).at(-1);
  // 空行から改行を外すと行そのものが消えるので、末尾に改行を付けないのは文字のある行だけ
  const stripLast = lines.at(-1)?.eol === "" && last?.text !== "";
  const settled = mapLines(next, (line) => settleLine(line, line === last && stripLast ? "" : eol));
  return rereadsSame(settled) ? settled : undefined;
}

/**
 * 書き戻して読み直しても同じ区切りになるか。`---` が先頭に来て frontmatter になるなど、
 * 区切りが変わる結果は書き込まない（AD-5 と同じく、ずれたら何もしない）
 */
function rereadsSame(doc: DayDocument): boolean {
  return JSON.stringify(parseDocument(serializeDocument(doc))) === JSON.stringify(doc);
}

function settleLine(line: Line, eol: string): Line {
  const wanted = eol === "" ? "" : line.eol || eolAfter(line.text, eol);
  return wanted === line.eol ? line : { ...line, eol: wanted };
}

/** 行末の `\r` に `\n` を続けると CRLF と読まれて `\r` が消えるので、そのときは `\r\n` を付ける */
function eolAfter(text: string, eol: string): string {
  return text.endsWith("\r") ? "\r\n" : eol;
}

function mapLines(doc: DayDocument, map: (line: Line) => Line): DayDocument {
  return {
    frontmatter: doc.frontmatter.map(map),
    segments: doc.segments.map((segment) =>
      segment.kind === "todo"
        ? { ...segment, head: map(segment.head), children: segment.children.map(map) }
        : { ...segment, line: map(segment.line) },
    ),
  };
}
