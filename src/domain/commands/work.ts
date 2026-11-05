import {
  type CommandResult,
  INVALID,
  isRejection,
  type LineRef,
  type Rejection,
  STALE,
  singleLine,
  updateBlock,
} from "@/domain/commands/command";
import type { DayDocument, Line, TodoBlock } from "@/domain/document/body";
import {
  childIndent,
  formatWorkEntry,
  parseWorkEntry,
  type WorkKind,
  type WorkLine,
  workLines,
} from "@/domain/document/work-entry";

export interface WorkInput {
  minutes: number;
  kind: WorkKind;
  memo?: string;
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
