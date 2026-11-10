<script lang="ts">
import type { BoardSession } from "@/app/board/session";
import { canAddTodo } from "@/domain/commands/card";
import type { Estimate } from "@/domain/document/todo-line";
import { POMODORO_MINUTES } from "@/domain/minutes";

interface Props {
  session: BoardSession;
  close: () => void;
}

const { session, close }: Props = $props();

/** 見積もりの値・ボタンの表示・下に添える分数（design 5章 M4）。`4` は「4以上」なので「4+」と出す */
const ESTIMATES = [
  ["小", "小", `〜${POMODORO_MINUTES}分`],
  ["1", "1", `${POMODORO_MINUTES}分`],
  ["2", "2", `${2 * POMODORO_MINUTES}分`],
  ["3", "3", `${3 * POMODORO_MINUTES}分`],
  ["4", "4+", `${4 * POMODORO_MINUTES}分〜`],
] as const satisfies ReadonlyArray<readonly [Estimate, string, string]>;

let name = $state("");
// 見積もりは省略できるので、何も選ばずに開く
let estimate = $state<Estimate | undefined>();
let adding = $state(false);
let input: HTMLInputElement | undefined = $state();
/** 「追加」を押せる（名前が書式に合い、書き込み中でない） */
const submittable = $derived(canAddTodo(name, estimate) && !adding);

$effect(() => {
  input?.focus();
});

/** 追加できたら閉じる。断られたら（通知が出る）入力を残して開いたままにする */
async function add(): Promise<void> {
  if (!submittable) {
    return;
  }
  adding = true;
  try {
    if (await session.addTodo(name, estimate)) {
      close();
    }
  } finally {
    adding = false;
  }
}

/** 選んでいる見積もりをもう一度押すと外す（見積もりは省略できる。design 7.5） */
function toggle(pressed: Estimate): void {
  estimate = estimate === pressed ? undefined : pressed;
}

/** Enter で「追加」と同じことをする。日本語入力の変換を確定する Enter では追加しない */
function addOnEnter(event: KeyboardEvent): void {
  if (event.key !== "Enter" || event.isComposing) {
    return;
  }
  event.preventDefault();
  void add();
}
</script>

<div class="add-dialog">
  <h1 class="title">TODOを追加</h1>

  <div class="name">
    <label for="add-todo-name">やること</label>
    <input
      id="add-todo-name"
      type="text"
      bind:this={input}
      bind:value={name}
      onkeydown={addOnEnter}
    >
  </div>

  <fieldset class="estimate">
    <legend>見積もり</legend>
    <div class="estimate-buttons">
      {#each ESTIMATES as [value, label, minutes] (value)}
        <button type="button" aria-pressed={estimate === value} onclick={() => toggle(value)}>
          <span class="estimate-value">{label}</span>
          <span class="estimate-minutes">{minutes}</span>
        </button>
      {/each}
    </div>
    <p class="note">単位はポモドーロ（25分）。25分かからないものは「小」を選びます。</p>
  </fieldset>

  <div class="footer">
    <p class="note">「今日やる」のいちばん下に追加されます</p>
    <div class="footer-buttons">
      <button type="button" onclick={close}>キャンセル</button>
      <button type="button" class="mod-cta" disabled={!submittable} onclick={() => void add()}>
        追加
      </button>
    </div>
  </div>
</div>

<style>
/* Obsidian のダイアログの幅をモックに合わせる（BoardView の SvelteModal が付ける印） */
:global(.daily-kanban-todo-add-modal) {
  width: min(640px, 90vw);
}

.add-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--size-4-6);
}

.title {
  margin: 0;
  /* 右上の閉じるボタンと重ならないようにする */
  padding-right: var(--size-4-8);
  font-size: var(--font-ui-large);
  font-weight: var(--font-bold);
}

.name {
  display: flex;
  flex-direction: column;
  gap: var(--size-4-2);
}

.name label,
.estimate legend {
  font-size: var(--font-ui-small);
  font-weight: var(--font-bold);
}

.name input {
  width: 100%;
  height: 48px;
  padding: 0 14px;
  border: 2px solid var(--interactive-accent);
  border-radius: var(--radius-m);
  font-size: var(--font-ui-medium);
}

.estimate {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  border: none;
}

.estimate legend {
  margin-bottom: 10px;
  padding: 0;
}

.estimate-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--size-4-2);
}

.estimate-buttons button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 64px;
  height: 56px;
  padding: 0 14px;
  border: 1px solid var(--background-modifier-border-hover);
  border-radius: 10px;
  background-color: var(--background-primary);
  box-shadow: none;
  color: var(--text-normal);
}

/* 選んでいる見積もりは主ボタンと同じく明暗を反転させる（design 5章「テーマ」） */
.estimate-buttons button[aria-pressed="true"] {
  border: 2px solid var(--text-normal);
  background-color: var(--text-normal);
  color: var(--background-primary);
}

.estimate-value {
  font-family: var(--font-monospace);
  font-size: var(--font-ui-medium);
}

.estimate-minutes {
  font-size: var(--font-ui-smaller);
}

.note {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-ui-smaller);
}

.footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--size-4-3);
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
