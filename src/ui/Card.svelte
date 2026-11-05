<script lang="ts">
import type { BoardSession, RunningCard } from "@/app/board-service";
import type { Card } from "@/domain/board";
import type { Status } from "@/domain/document";
import Timer from "./Timer.svelte";

interface Props {
  card: Card;
  status: Status;
  /** 列の中の順番（1から）。今日やるでは優先順として出す */
  position: number;
  /** このカードを計測中なら、その開始時刻と何個目か */
  running: RunningCard | undefined;
  session: BoardSession;
}

const { card, status, position, running, session }: Props = $props();
</script>

<article class="card" class:done={status === "done"}>
  {#if status === "todo"}
    <span class="number">{position}</span>
  {/if}
  <div class="body">
    <p class="name">{card.name}</p>
    <p class="meta">
      {#if status !== "todo"}
        <span>作業 {card.workedMinutes}分</span>
      {/if}
      {#if card.estimate}
        <span>見積 {card.estimate}</span>
      {/if}
    </p>
    {#if status === "doing"}
      {#if running}
        <Timer startedAt={running.startedAt} count={running.count} />
        <div class="actions">
          <button type="button" onclick={() => void session.interrupt()}>中断（割り込み）</button>
          <button type="button" class="mod-cta" onclick={() => void session.complete(card.ref)}>
            完了にする
          </button>
        </div>
      {:else}
        <div class="actions">
          <button type="button" class="mod-cta" onclick={() => void session.next(card.ref)}>
            次のポモドーロを開始
          </button>
          <button type="button" onclick={() => void session.complete(card.ref)}>完了にする</button>
        </div>
      {/if}
    {/if}
  </div>
</article>

<style>
.card {
  display: flex;
  gap: var(--size-4-2);
  padding: var(--size-4-2) var(--size-4-3);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-m);
  background-color: var(--background-primary);
}

.number {
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--size-2-1);
  min-width: 0;
}

.name {
  margin: 0;
  overflow-wrap: anywhere;
}

.done .name {
  color: var(--text-muted);
  text-decoration: line-through;
}

.meta {
  display: flex;
  gap: var(--size-4-2);
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-ui-smaller);
}

.meta:empty {
  display: none;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--size-4-2);
  margin-top: var(--size-4-2);
}
</style>
