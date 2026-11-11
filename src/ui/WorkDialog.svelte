<script lang="ts">
import { untrack } from "svelte";
import type { BoardSession } from "@/app/board/session";
import { CUSTOM_PROBLEM_MESSAGES } from "@/app/messages";
import type { Card } from "@/domain/board";
import type { WorkKind } from "@/domain/document/work-entry";
import { POMODORO_MINUTES, pomodoroEquivalent } from "@/domain/minutes";
import {
  addMinutes,
  canSave,
  customProblem,
  type DraftRow,
  draftTotal,
  EMPTY_CUSTOM,
  enterCustom,
  hasEdits,
  openDraft,
  removeRow,
  rowKind,
  setMinutes,
  toEdits,
  typeCustom,
} from "@/domain/work-draft";

interface Props {
  /** 開いたときのカード。保存するまで、この時点の記録を下書きにする */
  card: Card;
  session: BoardSession;
  close: () => void;
}

const { card, session, close }: Props = $props();

const QUICK_MINUTES = [
  [5, "＋5分"],
  [15, "＋15分"],
  [POMODORO_MINUTES, `＋${POMODORO_MINUTES}分（1ポモドーロ）`],
] as const;
const KIND_LABELS: Record<WorkKind, string> = {
  ポモドーロ: "ポモドーロ",
  中断: "中断したポモドーロ",
  手動: "手動",
};

// 開いたときの記録から下書きを作る。保存するまでファイルの変化は取り込まない
let draft = $state(openDraft(untrack(() => card.entries)));
let saving = $state(false);
// 任意の欄。値が残っている間は保存させない（Enter を押し忘れた分を黙って捨てない）
let custom = $state(EMPTY_CUSTOM);
const total = $derived(draftTotal(draft));
const problem = $derived(customProblem(custom));

/** 種類の下に出す補足。kind は保存したときの種類（分数を変えた行は手動になる） */
function note(row: DraftRow, kind: WorkKind): string {
  const memo = row.record?.memo;
  if (kind === "ポモドーロ") {
    return "自動で記録";
  }
  if (kind === "中断") {
    return memo ? `割り込み：${memo}` : "割り込み";
  }
  return memo ?? "手動で修正";
}

/** 数として読めない値（「1e」など）は value が空になるので、badInput で欄に値があると分かる */
function typeInCustom(event: Event & { currentTarget: HTMLInputElement }): void {
  const input = event.currentTarget;
  custom = typeCustom(input.value !== "" || input.validity.badInput, input.valueAsNumber);
}

/** Enter で足す。足せたときだけ欄を空にし、足せなければ値を残して欄の下に問題を出す */
function addCustom(event: KeyboardEvent & { currentTarget: HTMLInputElement }): void {
  if (event.key !== "Enter") {
    return;
  }
  event.preventDefault();
  ({ draft, custom } = enterCustom(draft, custom));
  if (!custom.filled) {
    event.currentTarget.value = "";
  }
}

/** 保存できたら閉じる。断られたら（通知が出る）下書きを残して開いたままにする。変更がなければ書かずに閉じる */
async function save(): Promise<void> {
  const edits = toEdits(draft);
  if (!hasEdits(edits)) {
    close();
    return;
  }
  saving = true;
  try {
    if (await session.editWork(card.ref, edits)) {
      close();
    }
  } finally {
    saving = false;
  }
}
</script>

<div class="work-dialog">
  <header class="title">
    <h2>作業時間を修正</h2>
    <p class="card-name">{card.name}</p>
  </header>

  <div class="records">
    <div class="row heading">
      <span>作業した時間</span><span>内容</span><span></span>
    </div>
    {#each draft.rows as row (row.key)}
      {@const kind = rowKind(row)}
      <div class="row" data-kind={kind}>
        <div class="minutes">
          <input
            type="number"
            min="1"
            aria-label="作業した分数"
            value={Number.isNaN(row.minutes) ? "" : row.minutes}
            oninput={(event) => {
              draft = setMinutes(draft, row.key, event.currentTarget.valueAsNumber);
            }}
          >
          <span class="unit">分</span>
        </div>
        <div class="kind">
          <span class="kind-label">{KIND_LABELS[kind]}</span>
          <span class="note">{note(row, kind)}</span>
        </div>
        <button
          type="button"
          class="clickable-icon remove"
          aria-label="この記録を削除"
          onclick={() => {
            draft = removeRow(draft, row.key);
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"></path>
          </svg>
        </button>
      </div>
    {/each}
  </div>

  <div class="add">
    <div class="add-title">作業時間を追加</div>
    <div class="add-buttons">
      {#each QUICK_MINUTES as [minutes, label] (minutes)}
        <button
          type="button"
          class="quick"
          onclick={() => {
            draft = addMinutes(draft, minutes);
          }}
        >
          {label}
        </button>
      {/each}
      <div class="custom">
        <label for="work-dialog-custom">任意</label>
        <input
          id="work-dialog-custom"
          type="number"
          min="1"
          placeholder="分"
          aria-describedby="work-dialog-custom-problem"
          aria-invalid={problem === "invalid"}
          oninput={typeInCustom}
          onkeydown={addCustom}
        >
      </div>
    </div>
    <p id="work-dialog-custom-problem" class="custom-problem" aria-live="polite" hidden={!problem}>
      {problem ? CUSTOM_PROBLEM_MESSAGES[problem] : ""}
    </p>
  </div>

  <div class="total">
    <span class="total-label">合計（人の作業時間）</span>
    <span class="total-value"
      >{total}分 <span class="pomodoros">≒ {pomodoroEquivalent(total)}ポモドーロ</span></span
    >
  </div>

  <div class="footer">
    <p class="footnote">時刻ではなく分数で記録します。直した記録には「手動」の印がつきます。</p>
    <div class="footer-buttons">
      <button type="button" onclick={close}>キャンセル</button>
      <button
        type="button"
        class="mod-cta"
        disabled={!canSave(draft, custom) || saving}
        onclick={() => void save()}
      >
        保存
      </button>
    </div>
  </div>
</div>

<style>
/* Obsidian のダイアログの幅をモックに合わせる（BoardView の SvelteModal が付ける印） */
:global(.daily-kanban-todo-work-modal) {
  width: min(720px, 90vw);
}

.work-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--size-4-6);
}

.title {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-3);
  /* 右上の閉じるボタンと重ならないようにする */
  padding-right: var(--size-4-8);
}

.title h2 {
  margin: 0;
  font-size: var(--font-ui-large);
  font-weight: var(--font-bold);
}

.card-name {
  margin: 0;
  color: var(--text-muted);
}

.records {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-3);
}

.row {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr) 44px;
  gap: var(--size-4-3);
  align-items: center;
  padding: var(--size-4-2) var(--size-2-2);
  border-radius: var(--radius-m);
}

.row.heading {
  padding-block: 0;
  color: var(--text-muted);
  font-size: var(--font-ui-smaller);
}

.row[data-kind="中断"] {
  background-color: rgba(var(--color-orange-rgb), 0.12);
}

.row[data-kind="手動"] {
  background-color: rgba(var(--color-blue-rgb), 0.12);
}

.minutes {
  display: flex;
  align-items: center;
  gap: var(--size-4-2);
}

.minutes input {
  width: 96px;
  height: 44px;
  font-family: var(--font-monospace);
  font-size: var(--font-ui-large);
  text-align: right;
}

.unit,
.note,
.custom label {
  color: var(--text-muted);
}

.kind {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-1);
  min-width: 0;
}

.kind-label {
  font-weight: var(--font-medium);
}

.note {
  font-size: var(--font-ui-smaller);
  overflow-wrap: anywhere;
}

.remove {
  width: 44px;
  height: 44px;
}

.add {
  display: flex;
  flex-direction: column;
  gap: var(--size-4-3);
  padding: var(--size-4-4);
  border: 1px dashed var(--background-modifier-border-hover);
  border-radius: var(--radius-m);
}

.add-title {
  font-weight: var(--font-bold);
}

.add-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--size-4-2);
}

.quick {
  height: 44px;
  padding: 0 var(--size-4-4);
  border-radius: 999px;
}

.custom {
  display: flex;
  align-items: center;
  gap: var(--size-4-2);
  margin-left: auto;
}

.custom input {
  width: 80px;
  height: 44px;
  text-align: right;
}

/* 任意の欄の問題。設定画面の問題（styles.css）と同じ色で、欄の下に右寄せで出す */
.custom-problem {
  margin: calc(-1 * var(--size-4-1)) 0 0;
  color: var(--text-error);
  font-size: var(--font-ui-smaller);
  text-align: right;
}

.total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--size-4-4) var(--size-4-5);
  border-radius: var(--radius-m);
  background-color: var(--background-secondary);
}

.total-label,
.pomodoros {
  color: var(--text-muted);
  font-size: var(--font-ui-small);
}

.total-value {
  font-family: var(--font-monospace);
  font-size: var(--font-ui-large);
}

.footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--size-4-3);
}

.footnote {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-ui-smaller);
  line-height: 1.7;
}

.footer-buttons {
  display: flex;
  flex-shrink: 0;
  gap: var(--size-4-3);
}

.footer-buttons button {
  height: 44px;
  padding: 0 var(--size-4-5);
}
</style>
