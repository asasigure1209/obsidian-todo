import {
  type CommandResult,
  findCard,
  INVALID,
  type LineRef,
  STALE,
  singleLine,
} from "@/domain/commands/command";
import { type DayDocument, type Segment, type TodoBlock, todoBlocks } from "@/domain/document/body";
import {
  type Estimate,
  formatTodoLine,
  parseTodoLine,
  type Status,
  type TodoLine,
} from "@/domain/document/todo-line";

const COLUMN_END = Number.POSITIVE_INFINITY;

/** 今日やるのいちばん下に追加する（M4） */
export function addTodo(doc: DayDocument, name: string, estimate?: Estimate): CommandResult {
  const todo = newTodo(name, estimate);
  if (!todo) {
    return INVALID;
  }
  const text = formatTodoLine(todo);
  const block: TodoBlock = { kind: "todo", todo, head: { text, eol: "" }, children: [] };
  return { ...doc, segments: insertIntoColumn(doc.segments, block, "todo", COLUMN_END) };
}

/** M4 の「追加」を押せるか。addTodo と同じ決まりで、追加できる名前のときだけ */
export function canAddTodo(name: string, estimate?: Estimate): boolean {
  return newTodo(name, estimate) !== undefined;
}

/** 追加する TODO 行。書いて読み直すと同じ名前になるときだけ（空の名前や、見積もりと読める名前は追加しない） */
function newTodo(name: string, estimate?: Estimate): TodoLine | undefined {
  const todo: TodoLine = { status: "todo", name: singleLine(name), ...(estimate && { estimate }) };
  return parseTodoLine(formatTodoLine(todo))?.name === todo.name ? todo : undefined;
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
