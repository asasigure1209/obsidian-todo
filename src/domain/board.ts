import type { LineRef } from "@/domain/commands";
import { type DayDocument, type TodoBlock, todoBlocks } from "@/domain/document/body";
import type { Estimate, Status } from "@/domain/document/todo-line";
import { type WorkKind, workLines } from "@/domain/document/work-entry";

/** 作業時間の1件。ref はそのまま作業時間のコマンドに渡せる（カードの中で n 番目の作業時間の行） */
export interface WorkRecord {
  ref: LineRef;
  minutes: number;
  kind: WorkKind;
  memo?: string;
}

/** ボードに出す1件。ref はそのままコマンドに渡せる（AD-5） */
export interface Card {
  ref: LineRef;
  /** 表示の上で同じカードを見分ける名前。位置が動いても、ほかの行が増えても変わらない */
  key: string;
  name: string;
  estimate?: Estimate;
  /** 実績。作業時間の子の行の分数の合計（design 7.6） */
  workedMinutes: number;
  /** 種類がポモドーロの作業時間の行の数。着手中には「この数＋1」個目と出す */
  pomodoros: number;
  /** 作業時間の記録。本文の順番（M2） */
  entries: WorkRecord[];
}

/** 3列のボード。列の中の順番は Markdown の行の順番（design 7.2） */
export type Board = Record<Status, Card[]>;

/** 表示用のモデルを作る。直接編集で着手中が2件になっても、カードを消さずに両方出す */
export function toBoard(doc: DayDocument): Board {
  const board: Board = { todo: [], doing: [], done: [] };
  const seen = new Map<string, number>();
  todoBlocks(doc.segments).forEach((block, index) => {
    const text = block.head.text;
    const occurrence = seen.get(text) ?? 0;
    seen.set(text, occurrence + 1);
    board[block.todo.status].push(toCard(block, index, `${text}#${occurrence}`));
  });
  return board;
}

function toCard(block: TodoBlock, index: number, key: string): Card {
  const { name, estimate } = block.todo;
  const entries = workEntries(block);
  return {
    ref: { index, text: block.head.text },
    key,
    name,
    ...(estimate && { estimate }),
    workedMinutes: entries.reduce((sum, entry) => sum + entry.minutes, 0),
    pomodoros: entries.filter((entry) => entry.kind === "ポモドーロ").length,
    entries,
  };
}

function workEntries(block: TodoBlock): WorkRecord[] {
  return workLines(block).map(({ line, entry: { indent: _indent, ...fields } }, index) => ({
    ref: { index, text: line.text },
    ...fields,
  }));
}
