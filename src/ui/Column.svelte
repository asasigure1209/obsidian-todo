<script lang="ts">
import type { Card as CardModel } from "@/domain/board";
import type { Status } from "@/domain/document";
import Card from "./Card.svelte";

interface Props {
  title: string;
  status: Status;
  cards: CardModel[];
}

const { title, status, cards }: Props = $props();
</script>

<section class="column">
  <h3 class="column-title">
    {title}
    <span class="count">{cards.length}</span>
  </h3>
  <ol class="cards">
    {#each cards as card, i (card.key)}
      <li>
        <Card {card} {status} number={status === "todo" ? i + 1 : undefined} />
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
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
