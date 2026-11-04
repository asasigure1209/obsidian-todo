import type { LineRef } from "@/domain/commands";
import {
  type DayDocument,
  type Estimate,
  parseWorkEntry,
  type Status,
  type TodoBlock,
} from "@/domain/document";

/** ボードに出す1件。ref はそのままコマンドに渡せる（AD-5） */
export interface Card {
  ref: LineRef;
  name: string;
  estimate?: Estimate;
  /** 実績。作業時間の子の行の分数の合計（design 7.6） */
  workedMinutes: number;
}

/** 3列のボード。列の中の順番は Markdown の行の順番（design 7.2） */
export type Board = Record<Status, Card[]>;

/** 表示用のモデルを作る。直接編集で着手中が2件になっても、カードを消さずに両方出す */
export function toBoard(doc: DayDocument): Board {
  const board: Board = { todo: [], doing: [], done: [] };
  const blocks = doc.segments.filter((segment): segment is TodoBlock => segment.kind === "todo");
  blocks.forEach((block, index) => {
    board[block.todo.status].push(toCard(block, index));
  });
  return board;
}

function toCard(block: TodoBlock, index: number): Card {
  const { name, estimate } = block.todo;
  return {
    ref: { index, text: block.head.text },
    name,
    ...(estimate && { estimate }),
    workedMinutes: workedMinutes(block),
  };
}

function workedMinutes(block: TodoBlock): number {
  return block.children.reduce((sum, child) => sum + (parseWorkEntry(child.text)?.minutes ?? 0), 0);
}
