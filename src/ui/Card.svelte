<script lang="ts">
import type { Card } from "@/domain/board";
import type { Status } from "@/domain/document";

interface Props {
  card: Card;
  status: Status;
  /** 今日やるの優先順（1から） */
  number?: number | undefined;
}

const { card, status, number }: Props = $props();
</script>

<article class="card" class:done={status === "done"}>
  {#if number !== undefined}
    <span class="number">{number}</span>
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
</style>
