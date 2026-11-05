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
  type WorkKind,
  type WorkLine,
  workLines,
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

/** M2 の「保存」。開いたときの記録への書き換えと削除、足した分数（手動） */
export interface WorkEdits {
  updated: { entry: LineRef; minutes: number }[];
  removed: LineRef[];
  added: number[];
}

/**
 * M2 の変更を1回の変更にまとめて当てる。どれか1つでも一致しない・書式にならないなら全体を何もしない。
 * どの位置も変える前の子の行で探すので、当てる順番に左右されない。足した分数は最後の子の行として足す
 */
export function editWork(doc: DayDocument, card: LineRef, edits: WorkEdits): CommandResult {
  return updateBlock(doc, card, (block) => editBlock(block, edits));
}

/** 書き換えた後の種類。分数を変えたら、手で直した記録なので手動になる。分数が同じなら元の種類のまま */
export function editedKind(entry: { minutes: number; kind: WorkKind }, minutes: number): WorkKind {
  return minutes === entry.minutes ? entry.kind : "手動";
}

/** 位置と行の文字列が一致する TODO ブロック。一致しなければ undefined（AD-5） */
export function findCard(doc: DayDocument, card: LineRef): TodoBlock | undefined {
  const block = todoBlocks(doc.segments)[card.index];
  return block?.head.text === card.text ? block : undefined;
}

function findEntry(block: TodoBlock, entry: LineRef): WorkLine | undefined {
  const found = workLines(block)[entry.index];
  return found?.line.text === entry.text ? found : undefined;
}

function editBlock(block: TodoBlock, edits: WorkEdits): TodoBlock | Rejection {
  const rewrites = edits.updated.map(({ entry, minutes }) => rewriteAt(block, entry, minutes));
  const removed = edits.removed.map((entry) => findEntry(block, entry)?.line ?? STALE);
  const added = edits.added.map(
    (minutes) => workLine(childIndent(block), { minutes, kind: "手動" }) ?? INVALID,
  );
  const rejection = [...rewrites, ...removed, ...added].find(isRejection);
  if (rejection) {
    return rejection;
  }
  const replaced = new Map(rewrites as [Line, Line][]);
  const kept = block.children.filter((child) => !removed.includes(child));
  return {
    ...block,
    children: [...kept.map((child) => replaced.get(child) ?? child), ...(added as Line[])],
  };
}

/** 書き換える前と後の行。字下げ・メモ・改行はそのまま */
function rewriteAt(block: TodoBlock, entry: LineRef, minutes: number): [Line, Line] | Rejection {
  const found = findEntry(block, entry);
  if (!found) {
    return STALE;
  }
  const { indent, memo } = found.entry;
  const next = workLine(indent, { minutes, kind: editedKind(found.entry, minutes), memo });
  return next ? [found.line, { ...next, eol: found.line.eol }] : INVALID;
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
function workLine(
  indent: string,
  work: Omit<WorkInput, "memo"> & { memo?: string | undefined },
): Line | undefined {
  const memo = singleLine(work.memo ?? "");
  const text = formatWorkEntry({
    indent,
    minutes: work.minutes,
    kind: work.kind,
    ...(memo && { memo }),
  });
  return parseWorkEntry(text) ? { text, eol: "" } : undefined;
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
