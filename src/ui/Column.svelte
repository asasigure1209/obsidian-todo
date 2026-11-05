<script lang="ts">
import type { Card as CardModel } from "@/domain/board";
import type { Status } from "@/domain/document";
import Card from "./Card.svelte";
import { type Drop, sortable } from "./sortable";

interface Props {
  title: string;
  status: Status;
  cards: CardModel[];
  onDrop: (drop: Drop) => void;
}

const { title, status, cards, onDrop }: Props = $props();
</script>

<section class="column">
  <h3 class="column-title">
    {title}
    <span class="count">{cards.length}</span>
  </h3>
  <ol class="cards" use:sortable={{ status, onDrop }}>
    {#each cards as card, i (card.key)}
      <li data-key={card.key}>
        <Card {card} {status} position={i + 1} />
      </li>
    {/each}
  </ol>
</section>

<style>
.column {
  display: flex;
  flex-direction: column;
  gap: var(--size-4-2);
  padding: var(--size-4-3);
  border-radius: var(--radius-l);
  background-color: var(--background-secondary);
}

.column-title {
  display: flex;
  align-items: center;
  gap: var(--size-4-2);
  margin: 0;
  font-size: var(--font-ui-medium);
}

.count {
  color: var(--text-muted);
  font-size: var(--font-ui-small);
  font-weight: normal;
}

.cards {
  display: flex;
  flex-direction: column;
  gap: var(--size-4-2);
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
