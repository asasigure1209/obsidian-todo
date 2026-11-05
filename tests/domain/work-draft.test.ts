import { describe, expect, it } from "vitest";
import type { WorkRecord } from "@/domain/board";
import {
  addMinutes,
  canSave,
  draftTotal,
  hasEdits,
  openDraft,
  removeRow,
  rowKind,
  setMinutes,
  toEdits,
  type WorkDraft,
} from "@/domain/work-draft";

const record = (index: number, minutes: number, kind: WorkRecord["kind"], memo?: string) => {
  const text = `    - ${minutes}分 ${kind}${memo ? ` ${memo}` : ""}`;
  return { ref: { index, text }, minutes, kind, ...(memo && { memo }) };
};

const pomodoro = record(0, 25, "ポモドーロ");
const interrupted = record(1, 12, "中断", "問い合わせ");
const draft = openDraft([pomodoro, interrupted]);

const keyOf = (d: WorkDraft, i: number) => d.rows[i]?.key as number;

describe("作業時間の下書き（M2）", () => {
  it("開いたときの記録が、そのままの順番で行になる", () => {
    expect(draft.rows.map((row) => [row.record, row.minutes])).toEqual([
      [pomodoro, 25],
      [interrupted, 12],
    ]);
    expect(new Set(draft.rows.map((row) => row.key)).size).toBe(2);
  });

  it("分数を足すと、手動の行が末尾に増える", () => {
    const added = addMinutes(addMinutes(draft, 5), 15);

    expect(added.rows.map((row) => [row.minutes, rowKind(row)])).toEqual([
      [25, "ポモドーロ"],
      [12, "中断"],
      [5, "手動"],
      [15, "手動"],
    ]);
    expect(new Set(added.rows.map((row) => row.key)).size).toBe(4);
  });

  it("1分から足せる", () => {
    expect(addMinutes(draft, 1).rows.at(-1)?.minutes).toBe(1);
  });

  it("ない行を消そうとしても何も変わらない", () => {
    expect(removeRow(draft, 99)).toEqual(draft);
  });

  it.each([0, -5, 2.5, Number.NaN])("%d分は足さない", (minutes) => {
    expect(addMinutes(draft, minutes)).toBe(draft);
  });

  it("分数を変えた行は手動として出し、元の分数に戻すと元の種類に戻る", () => {
    const changed = setMinutes(draft, keyOf(draft, 1), 10);
    const back = setMinutes(changed, keyOf(draft, 1), 12);

    expect(changed.rows.map(rowKind)).toEqual(["ポモドーロ", "手動"]);
    expect(back.rows.map(rowKind)).toEqual(["ポモドーロ", "中断"]);
  });

  it("合計は削除していない行の分数の和。空欄の行は数えない", () => {
    const edited = removeRow(
      setMinutes(addMinutes(draft, 5), keyOf(draft, 1), Number.NaN),
      keyOf(draft, 0),
    );

    expect(draftTotal(draft)).toBe(37);
    expect(draftTotal(edited)).toBe(5);
  });

  it.each([Number.NaN, 0, 1.5])("%d分の行があれば保存できない", (minutes) => {
    expect(canSave(draft)).toBe(true);
    expect(canSave(setMinutes(draft, keyOf(draft, 0), minutes))).toBe(false);
  });

  it("保存する変更は、分数を変えた行・消した記録・足した分数", () => {
    const edited = addMinutes(
      removeRow(setMinutes(draft, keyOf(draft, 1), 10), keyOf(draft, 0)),
      5,
    );

    expect(toEdits(edited)).toEqual({
      updated: [{ entry: interrupted.ref, minutes: 10 }],
      removed: [pomodoro.ref],
      added: [5],
    });
  });

  it("足した行を消すと、変更には残らない", () => {
    const added = addMinutes(draft, 5);

    expect(toEdits(removeRow(added, keyOf(added, 2)))).toEqual({
      updated: [],
      removed: [],
      added: [],
    });
  });

  it("何も変えなければ、保存する変更は空。元の分数に戻した行も変更にしない", () => {
    const back = setMinutes(setMinutes(draft, keyOf(draft, 0), 20), keyOf(draft, 0), 25);

    expect(toEdits(back)).toEqual({ updated: [], removed: [], added: [] });
  });

  it("分数を変えた・消した・足した行があるときだけ、変更がある", () => {
    const has = (d: WorkDraft) => hasEdits(toEdits(d));

    expect(has(draft)).toBe(false);
    expect(has(setMinutes(draft, keyOf(draft, 0), 25))).toBe(false);
    expect(has(setMinutes(draft, keyOf(draft, 0), 20))).toBe(true);
    expect(has(removeRow(draft, keyOf(draft, 1)))).toBe(true);
    expect(has(addMinutes(draft, 5))).toBe(true);
  });
});
