import type { WorkRecord } from "@/domain/board";
import type { LineRef } from "@/domain/commands/command";
import { editedKind, type WorkEdits } from "@/domain/commands/work";
import { isWorkMinutes, type WorkKind } from "@/domain/document/work-entry";

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
  removed: LineRef[];
  nextKey: number;
}

export function openDraft(records: WorkRecord[]): WorkDraft {
  return {
    rows: records.map((record, key) => ({ key, record, minutes: record.minutes })),
    removed: [],
    nextKey: records.length,
  };
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
    removed: record ? [...draft.removed, record.ref] : draft.removed,
  };
}

/** 保存したときの種類。分数を変えた行と足した行は手動になる */
export function rowKind(row: DraftRow): WorkKind {
  return row.record ? editedKind(row.record, row.minutes) : "手動";
}

/** 空欄の行は数えない */
export function draftTotal(draft: WorkDraft): number {
  return draft.rows.reduce((sum, row) => sum + (isWorkMinutes(row.minutes) ? row.minutes : 0), 0);
}

/**
 * 任意の分数の欄。filled は欄に何か入っているか（数として読めない値も含む）。minutes は空欄か読めなければ NaN。
 * entered は空欄で Enter を押したことで、打ち直すか下書きを変えるまで問題を出す
 */
export interface CustomField {
  filled: boolean;
  minutes: number;
  entered: boolean;
}

/** 欄の下に出す問題。empty は空欄の Enter、invalid は足せない値、pending は足せるがまだ Enter を押していない値 */
export type CustomProblem = "empty" | "invalid" | "pending";

export const EMPTY_CUSTOM: CustomField = { filled: false, minutes: Number.NaN, entered: false };

/** 欄に打ったとき。前に Enter で出した問題は打ち直したので消す */
export function typeCustom(filled: boolean, minutes: number): CustomField {
  return { filled, minutes, entered: false };
}

/** 任意の欄で Enter。足せれば手動の行を足して欄を空にし、足せなければ下書きを変えず欄の値を残す */
export function enterCustom(
  draft: WorkDraft,
  custom: CustomField,
): { draft: WorkDraft; custom: CustomField } {
  const added = addMinutes(draft, custom.minutes);
  if (added === draft) {
    return { draft, custom: { ...custom, entered: true } };
  }
  return { draft: added, custom: EMPTY_CUSTOM };
}

/** 下書きを変える操作（追加・削除・分数の変更）の後。空欄の Enter の問題は古くなったので消す */
export function clearEntered(custom: CustomField): CustomField {
  return { ...custom, entered: false };
}

export function customProblem(custom: CustomField): CustomProblem | undefined {
  if (!custom.filled) {
    return custom.entered ? "empty" : undefined;
  }
  return isWorkMinutes(custom.minutes) ? "pending" : "invalid";
}

/** 0分や空欄の行があるか、任意の欄に値が残っていれば保存できない（入れたつもりの分を黙って捨てない） */
export function canSave(draft: WorkDraft, custom: CustomField): boolean {
  return !custom.filled && draft.rows.every((row) => isWorkMinutes(row.minutes));
}

export function toEdits(draft: WorkDraft): WorkEdits {
  return {
    updated: draft.rows.flatMap((row) =>
      row.record && changed(row, row.record)
        ? [{ entry: row.record.ref, minutes: row.minutes }]
        : [],
    ),
    removed: draft.removed,
    added: draft.rows.flatMap((row) => (row.record ? [] : [row.minutes])),
  };
}

/** 保存して変わるものがあるか。なければ書き込まずに閉じる */
export function hasEdits({ updated, removed, added }: WorkEdits): boolean {
  return updated.length + removed.length + added.length > 0;
}

function changed(row: DraftRow, record: WorkRecord): boolean {
  return row.minutes !== record.minutes;
}
