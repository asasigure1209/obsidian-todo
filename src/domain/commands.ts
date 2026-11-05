import {
  childIndent,
  type DayDocument,
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
  todoBlocks,
  type WorkEntry,
  type WorkKind,
} from "@/domain/document";

/** 操作の対象の行。n 番目の TODO ブロック（またはカードの中で n 番目の作業時間の行）と、その行の文字列（AD-5） */
export interface LineRef {
  index: number;
  text: string;
}

export interface WorkInput {
  minutes: number;
  kind: WorkKind;
  memo?: string;
}

/**
 * 何もしなかった理由。
 * - stale：対象の位置と行の文字列が最新の本文と一致しない（読み直して再表示する）
 * - invalid：入力が書式にならない（空の名前、0分など）
 * - unstable：書き戻して読み直すと区切りが変わる（先頭に来た `---` が frontmatter になる、など）
 */
export interface Rejection {
  rejected: "stale" | "invalid" | "unstable";
}

export type CommandResult = DayDocument | Rejection;

/** 1回の操作 */
export type DocumentCommand = (doc: DayDocument) => CommandResult;

export const STALE: Rejection = { rejected: "stale" };
const INVALID: Rejection = { rejected: "invalid" };
const UNSTABLE: Rejection = { rejected: "unstable" };
const COLUMN_END = Number.POSITIVE_INFINITY;

/** コマンドの結果（DayDocument）にも、applyToBody の結果（本文の文字列）にも使える */
export function isRejection<T extends object | string>(result: T | Rejection): result is Rejection {
  return typeof result === "object" && "rejected" in result;
}

/** `vault.process` に渡す形。読み直すと区切りが変わる結果は書き込まない（AD-5 と同じく、ずれたら何もしない） */
export function applyToBody(body: string, command: DocumentCommand): string | Rejection {
  const next = command(parseDocument(body));
  if (isRejection(next)) {
    return next;
  }
  const written = serializeDocument(next);
  return layoutOf(parseDocument(written)) === layoutOf(next) ? written : UNSTABLE;
}

/** 今日やるのいちばん下に追加する（M4） */
export function addTodo(doc: DayDocument, name: string, estimate?: Estimate): CommandResult {
  const todo: TodoLine = { status: "todo", name: singleLine(name), ...(estimate && { estimate }) };
  const text = formatTodoLine(todo);
  if (parseTodoLine(text)?.name !== todo.name) {
    return INVALID;
  }
  const block: TodoBlock = { kind: "todo", todo, head: { text, eol: "" }, children: [] };
  return { ...doc, segments: insertIntoColumn(doc.segments, block, "todo", COLUMN_END) };
}

/** カードを列の中の位置へ動かす。着手中へ動かすときは位置を使わない（startCard） */
export function moveCard(
  doc: DayDocument,
  card: LineRef,
  status: Status,
  position: number,
): CommandResult {
  const target = findCard(doc, card);
  if (!target) {
    return STALE;
  }
  if (status === "doing") {
    return startCard(doc, target);
  }
  const rest = doc.segments.filter((segment) => segment !== target);
  return { ...doc, segments: insertIntoColumn(rest, withStatus(target, status), status, position) };
}

/** 「完了にする」ボタン。完了の末尾に入れる（design 8.6） */
export function completeCard(doc: DayDocument, card: LineRef): CommandResult {
  return moveCard(doc, card, "done", COLUMN_END);
}

/** 作業時間をカードの最後の子の行として足す */
export function addWork(doc: DayDocument, card: LineRef, work: WorkInput): CommandResult {
  return updateBlock(doc, card, (block) => {
    const line = workLine(childIndent(block), work);
    return line ? { ...block, children: [...block.children, line] } : INVALID;
  });
}

/** 作業時間を書き換える（M2）。手で直した記録なので種類は手動になる。メモを省くと元のメモを残し、空文字で消す */
export function updateWork(
  doc: DayDocument,
  card: LineRef,
  entry: LineRef,
  work: Omit<WorkInput, "kind">,
): CommandResult {
  return updateBlock(doc, card, (block) => {
    const current = findEntry(block, entry);
    if (!current) {
      return STALE;
    }
    const line = rewriteEntry(current, work);
    return line ? replaceChild(block, current, line) : INVALID;
  });
}

/** 作業時間を削除する（M2）。書式外の子の行は残す */
export function removeWork(doc: DayDocument, card: LineRef, entry: LineRef): CommandResult {
  return updateBlock(doc, card, (block) => {
    const current = findEntry(block, entry);
    return current
      ? { ...block, children: block.children.filter((child) => child !== current) }
      : STALE;
  });
}

/** 位置と行の文字列が一致する TODO ブロック。一致しなければ undefined（AD-5） */
export function findCard(doc: DayDocument, card: LineRef): TodoBlock | undefined {
  const block = todoBlocks(doc.segments)[card.index];
  return block?.head.text === card.text ? block : undefined;
}

function findEntry(block: TodoBlock, entry: LineRef): Line | undefined {
  const line = block.children.filter((child) => parseWorkEntry(child.text))[entry.index];
  return line?.text === entry.text ? line : undefined;
}

function updateBlock(
  doc: DayDocument,
  card: LineRef,
  update: (block: TodoBlock) => TodoBlock | Rejection,
): CommandResult {
  const target = findCard(doc, card);
  const next = target ? update(target) : STALE;
  return isRejection(next)
    ? next
    : { ...doc, segments: doc.segments.map((segment) => (segment === target ? next : segment)) };
}

function replaceChild(block: TodoBlock, current: Line, line: Line): TodoBlock {
  return { ...block, children: block.children.map((child) => (child === current ? line : child)) };
}

function withStatus(block: TodoBlock, status: Status): TodoBlock {
  const todo = { ...block.todo, status };
  return { ...block, todo, head: { ...block.head, text: formatTodoLine(todo) } };
}

/** 着手中へ動かす。カードは元の位置のまま記号だけ変え、前の着手中は今日やるの先頭へ戻す（design 8.1・8.6） */
function startCard(doc: DayDocument, target: TodoBlock): DayDocument {
  const started = withStatus(target, "doing");
  const segments = doc.segments.map((segment) => (segment === target ? started : segment));
  const previous = todoBlocks(segments).filter(
    (block) => block !== started && block.todo.status === "doing",
  );
  return { ...doc, segments: returnToTodo(segments, previous) };
}

/** 今日やるの先頭へ戻す。後ろのカードから先頭に入れて、元の順番を保つ */
function returnToTodo(segments: Segment[], blocks: TodoBlock[]): Segment[] {
  return blocks.reduceRight(
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
  const column = todoBlocks(segments).filter((other) => other.todo.status === status);
  const before = column[Math.max(0, position)];
  const at = before ? segments.indexOf(before) : endOfColumn(segments, column);
  return [...segments.slice(0, at), block, ...segments.slice(at)];
}

/** 列の最後のブロックの直後。列が空なら最後の TODO ブロックの直後、TODO がなければ本文の末尾 */
function endOfColumn(segments: Segment[], column: TodoBlock[]): number {
  const last = column.at(-1) ?? todoBlocks(segments).at(-1);
  return last ? segments.indexOf(last) + 1 : segments.length;
}

/** 改行は書き戻しで決める（serializeDocument） */
function workLine(indent: string, work: WorkInput): Line | undefined {
  const memo = singleLine(work.memo ?? "");
  const text = formatWorkEntry({
    indent,
    minutes: work.minutes,
    kind: work.kind,
    ...(memo && { memo }),
  });
  return parseWorkEntry(text) ? { text, eol: "" } : undefined;
}

/** 字下げと改行はそのままに、分数とメモを書き換える */
function rewriteEntry(line: Line, work: Omit<WorkInput, "kind">): Line | undefined {
  const { indent, memo } = parseWorkEntry(line.text) as WorkEntry;
  const kept = memo === undefined ? {} : { memo };
  const next = workLine(indent, { ...kept, ...work, kind: "手動" });
  return next && { ...next, eol: line.eol };
}

function singleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * frontmatter と区切りごとの行の文字列。キーの順番に左右されないよう配列だけで表す。
 * TODO 行の文字列は必ず TODO ブロックとして読まれるので、区切りの種類は持たなくてよい
 */
function layoutOf(doc: DayDocument): string {
  return JSON.stringify([
    doc.frontmatter.map((line) => line.text),
    doc.segments.map((segment) =>
      segment.kind === "todo"
        ? [segment.head, ...segment.children].map((line) => line.text)
        : [segment.line.text],
    ),
  ]);
}
