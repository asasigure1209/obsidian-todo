<script lang="ts">
import type { BoardSession } from "@/app/board/session";
import type { Card as CardModel, RunningCard } from "@/domain/board";
import type { Status } from "@/domain/document/todo-line";
import Card from "./Card.svelte";
import { type Drop, sortable } from "./sortable";

interface Props {
  title: string;
  status: Status;
  cards: CardModel[];
  running: RunningCard | undefined;
  session: BoardSession;
  onDrop: (drop: Drop) => void;
  openWork: (card: CardModel) => void;
}

const { title, status, cards, running, session, onDrop, openWork }: Props = $props();
</script>

<section class="column">
  <div class="column-head">
    <h2 class="column-title">
      {title}
      <span class="count">{cards.length}</span>
    </h2>
    {#if status === "todo"}
      <span class="priority">上ほど優先</span>
    {/if}
  </div>
  <ol class="cards" use:sortable={{ status, onDrop }}>
    {#each cards as card, i (card.key)}
      <li data-key={card.key}>
        <Card
          {card}
          {status}
          {session}
          {openWork}
          position={i + 1}
          running={running?.key === card.key ? running : undefined}
        />
      </li>
    {/each}
  </ol>
  <!-- カードがあってもなくても、列のいちばん下に出す（design 5章 M1） -->
  {#if status === "doing"}
    <p class="hint">カードをここへ動かすとタイマーが始まります</p>
  {/if}
</section>

<style>
/* 列は枠や背景を持たず、ボードの背景の上にカードを並べる（モック M1） */
.column {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.column-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.column-title {
  margin: 0;
  color: var(--text-normal);
  font-size: 16px;
  font-weight: var(--font-bold);
}

.count {
  color: var(--text-muted);
  font-weight: var(--font-normal);
}

.priority {
  color: var(--text-muted);
  font-size: 12px;
}

.hint {
  margin: 0;
  padding: 0 4px;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.6;
}

.cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
  /* 空の列にもドロップできるようにする */
  min-height: 3rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.cards :global(.sortable-ghost) {
  opacity: 0.4;
}
</style>
