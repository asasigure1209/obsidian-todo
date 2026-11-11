<script lang="ts">
import type { BoardSession } from "@/app/board/session";
import type { Card, RunningCard } from "@/domain/board";
import { cardNote, cardPhase } from "@/domain/card-note";
import type { EditKind } from "@/domain/day";
import type { Status } from "@/domain/document/todo-line";
import Timer from "./Timer.svelte";

interface Props {
  card: Card;
  status: Status;
  /** 列の中の順番（1から）。今日やるでは優先順として出す */
  position: number;
  /** このカードを計測中なら、そのカードの key と開始時刻。停止中とほかの列では undefined */
  running: RunningCard | undefined;
  session: BoardSession;
  /** 「時間を修正」（M2） */
  openWork: (card: Card) => void;
  /** その日にできる操作か（design 8.3）。過去の日は中断と作業時間の修正だけ */
  can: (kind: EditKind) => boolean;
}

const { card, status, position, running, session, openWork, can }: Props = $props();

const note = $derived(cardNote(card, cardPhase(status, running !== undefined)));
</script>

{#snippet workLink()}
  <button type="button" class="work-link" onclick={() => openWork(card)}>時間を修正</button>
{/snippet}

{#snippet meta()}
  <div class="meta">
    <span class="figures">{note}</span>
    {@render workLink()}
  </div>
{/snippet}

{#if status === "todo"}
  <article class="card todo">
    <!-- 左の帯に優先の番号と、ドラッグのつまみ（モック M1） -->
    <div class="band">
      <span class="number">{position}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="9" cy="6" r="1.6" />
        <circle cx="15" cy="6" r="1.6" />
        <circle cx="9" cy="12" r="1.6" />
        <circle cx="15" cy="12" r="1.6" />
        <circle cx="9" cy="18" r="1.6" />
        <circle cx="15" cy="18" r="1.6" />
      </svg>
    </div>
    <div class="body">
      <p class="name">{card.name}</p>
      {@render meta()}
    </div>
  </article>
{:else if status === "doing"}
  <article class="card doing">
    <p class="name">{card.name}</p>
    <Timer startedAt={running?.startedAt} {note}> {@render workLink()} </Timer>
    {#if running}
      <div class="actions row">
        <button type="button" class="secondary" onclick={() => void session.interrupt()}>
          中断（割り込み）
        </button>
        {#if can("complete")}
          <button type="button" class="primary" onclick={() => void session.complete(card.ref)}>
            完了にする
          </button>
        {/if}
      </div>
    {:else if can("move")}
      <!-- 停止中の操作は、過去の日には出さない（design 8.3） -->
      <div class="actions column">
        <button type="button" class="start" onclick={() => void session.next(card.ref)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M7 5l12 7-12 7z" />
          </svg>
          次のポモドーロを開始
        </button>
        {#if can("complete")}
          <button type="button" class="secondary" onclick={() => void session.complete(card.ref)}>
            完了にする
          </button>
        {/if}
      </div>
    {/if}
  </article>
{:else}
  <article class="card done">
    <p class="name">{card.name}</p>
    {@render meta()}
  </article>
{/if}

<style>
.card {
  display: flex;
  box-sizing: border-box;
  border: 1px solid var(--background-modifier-border);
  border-radius: 10px;
  background-color: var(--background-primary);
}

.todo {
  gap: 10px;
  padding: 14px 14px 14px 10px;
}

.band {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding-top: 2px;
  color: var(--text-faint);
}

.number {
  color: var(--text-muted);
  font-family: var(--font-monospace);
  font-size: 13px;
}

.body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.name {
  margin: 0;
  font-size: 15px;
  font-weight: var(--font-medium);
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--size-4-2);
  color: var(--text-muted);
  font-size: 12px;
}

/* 着手中はアクセント色の太い枠で、名前は太字（モック M1） */
.doing {
  flex-direction: column;
  gap: 18px;
  padding: 20px;
  border: 2px solid var(--interactive-accent);
  border-radius: 12px;
}

.doing .name {
  font-size: 16px;
  font-weight: var(--font-bold);
}

.done {
  flex-direction: column;
  gap: 8px;
  padding: 14px;
}

.done .name {
  color: var(--text-muted);
  font-weight: var(--font-normal);
  text-decoration: line-through;
}

.done .figures {
  color: var(--text-normal);
}

.work-link {
  height: auto;
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: none;
  box-shadow: none;
  color: var(--text-accent);
  font-size: 12px;
  cursor: pointer;
}

.work-link:hover {
  text-decoration: underline;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.actions.column {
  flex-direction: column;
}

.actions button {
  height: 44px;
  border-radius: 8px;
  box-shadow: none;
  font-size: 14px;
  cursor: pointer;
}

.row button {
  flex: 1;
}

/*
 * Obsidian 標準の button:hover などに負けないよう、.actions を前に付けて詳細度を上げ、
 * hover・active・focus-visible の色も明示する（文字が背景に溶けないように）
 */
.actions .secondary {
  border: 1px solid var(--background-modifier-border-hover);
  background-color: var(--background-primary);
  color: var(--text-normal);
}

.actions .secondary:hover,
.actions .secondary:active {
  background-color: var(--background-secondary);
  color: var(--text-normal);
}

/* 主ボタンは黒地に白字。ダークでは明暗が反転する（design 5章 テーマ） */
.actions .primary {
  border: none;
  background-color: var(--text-normal);
  color: var(--background-primary);
}

.actions .primary:hover,
.actions .primary:active {
  background-color: var(--text-muted);
  color: var(--background-primary);
}

.actions button:focus-visible {
  box-shadow: 0 0 0 3px var(--background-modifier-border-focus);
}

.actions .start {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  height: 48px;
  border: none;
  background-color: var(--interactive-accent);
  color: var(--text-on-accent);
  font-size: 15px;
  font-weight: var(--font-medium);
}

.actions .start:hover,
.actions .start:active {
  background-color: var(--interactive-accent-hover);
  color: var(--text-on-accent);
}
</style>
