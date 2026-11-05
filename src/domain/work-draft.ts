import type { WorkRecord } from "@/domain/board";
import type { WorkEdits } from "@/domain/commands";
import type { WorkKind } from "@/domain/document";

/** ダイアログの1行。record は開いたときにあった記録で、ない行は足した行。minutes は空欄なら NaN */
export interface DraftRow {
  key: number;
  record?: WorkRecord;
  minutes: number;
}

/**
 * M2 の下書き。「保存」を押すまでファイルには書かない。
 * removed は消した記録で、開いた後にタイマーが足した記録を消さないよう、消したものだけを覚える
 */
export interface WorkDraft {
  rows: DraftRow[];
  removed: WorkRecord[];
  nextKey: number;
}

export function openDraft(records: WorkRecord[]): WorkDraft {
  return {
    rows: records.map((record, key) => ({ key, record, minutes: record.minutes })),
    removed: [],
    nextKey: records.length,
  };
}

/** 作業時間の行にできる分数か（1以上の整数） */
export function isWorkMinutes(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes >= 1;
}

/** 「＋5分」などの追加。手動の行を末尾に足す */
export function addMinutes(draft: WorkDraft, minutes: number): WorkDraft {
  if (!isWorkMinutes(minutes)) {
    return draft;
  }
  return {
    ...draft,
    rows: [...draft.rows, { key: draft.nextKey, minutes }],
    nextKey: draft.nextKey + 1,
  };
}

export function setMinutes(draft: WorkDraft, key: number, minutes: number): WorkDraft {
  return { ...draft, rows: draft.rows.map((row) => (row.key === key ? { ...row, minutes } : row)) };
}

export function removeRow(draft: WorkDraft, key: number): WorkDraft {
  const record = draft.rows.find((row) => row.key === key)?.record;
  return {
    ...draft,
    rows: draft.rows.filter((row) => row.key !== key),
    removed: record ? [...draft.removed, record] : draft.removed,
  };
}

/** 保存したときの種類。分数を変えた行と足した行は手動になる */
export function rowKind(row: DraftRow): WorkKind {
  return row.record && !changed(row, row.record) ? row.record.kind : "手動";
}

/** 空欄の行は数えない */
export function draftTotal(draft: WorkDraft): number {
  return draft.rows.reduce((sum, row) => sum + (isWorkMinutes(row.minutes) ? row.minutes : 0), 0);
}

export function canSave(draft: WorkDraft): boolean {
  return draft.rows.every((row) => isWorkMinutes(row.minutes));
}

export function toEdits(draft: WorkDraft): WorkEdits {
  return {
    updated: draft.rows.flatMap((row) =>
      row.record && changed(row, row.record)
        ? [{ entry: row.record.ref, minutes: row.minutes }]
        : [],
    ),
    removed: draft.removed.map((record) => record.ref),
    added: draft.rows.flatMap((row) => (row.record ? [] : [row.minutes])),
  };
}

function changed(row: DraftRow, record: WorkRecord): boolean {
  return row.minutes !== record.minutes;
}
