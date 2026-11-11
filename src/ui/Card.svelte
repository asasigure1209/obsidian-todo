<script lang="ts">
import type { BoardSession } from "@/app/board/session";
import type { Card, RunningCard } from "@/domain/board";
import { type CardPhase, cardNote } from "@/domain/card-note";
import type { Status } from "@/domain/document/todo-line";
import Timer from "./Timer.svelte";

interface Props {
  card: Card;
  status: Status;
  /** 列の中の順番（1から）。今日やるでは優先順として出す */
  position: number;
  /** このカードを計測中なら、その開始時刻と何個目か */
  running: RunningCard | undefined;
  session: BoardSession;
  /** 「時間を修正」（M2） */
  openWork: (card: Card) => void;
}

const { card, status, position, running, session, openWork }: Props = $props();

/** 着手中は計測中か停止中かで見え方が変わる */
const phase: CardPhase = $derived(status === "doing" ? (running ? "running" : "stopped") : status);
const note = $derived(cardNote(card, phase));
</script>

{#snippet workLink()}
  <button type="button" class="work-link" onclick={() => openWork(card)}>時間を修正</button>
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
      <div class="meta">
        <span>{note}</span>
        {@render workLink()}
      </div>
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
        <button type="button" class="primary" onclick={() => void session.complete(card.ref)}>
          完了にする
        </button>
      </div>
    {:else}
      <div class="actions column">
        <button type="button" class="start" onclick={() => void session.next(card.ref)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M7 5l12 7-12 7z" />
          </svg>
          次のポモドーロを開始
        </button>
        <button type="button" class="secondary" onclick={() => void session.complete(card.ref)}>
          完了にする
        </button>
      </div>
    {/if}
  </article>
{:else}
  <article class="card done">
    <p class="name">{card.name}</p>
    <div class="meta">
      <span class="figures">{note}</span>
      {@render workLink()}
    </div>
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

.secondary {
  border: 1px solid var(--background-modifier-border-hover);
  background-color: var(--background-primary);
  color: var(--text-normal);
}

/* 主ボタンは黒地に白字。ダークでは明暗が反転する（design 5章 テーマ） */
.primary {
  border: none;
  background-color: var(--text-normal);
  color: var(--background-primary);
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
</style>
