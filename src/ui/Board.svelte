<script lang="ts">
import type { BoardState, Readable } from "@/app/board-service";
import type { LineRef } from "@/domain/commands";
import type { Status } from "@/domain/document";
import Column from "./Column.svelte";
import type { Drop } from "./sortable";

interface Props {
  dayKey: string;
  boardState: Readable<BoardState>;
  onMove: (card: LineRef, status: Status, position: number) => void;
}

const { dayKey, boardState, onMove }: Props = $props();

/** ドロップしたカードを key から探し、そのときのボードの ref で動かす */
function handleDrop(drop: Drop): void {
  if ($boardState.kind !== "board") {
    return;
  }
  const { todo, doing, done } = $boardState.board;
  const card = [...todo, ...doing, ...done].find((c) => c.key === drop.key);
  if (card) {
    onMove(card.ref, drop.status, drop.position);
  }
}
</script>

<div class="board">
  <header class="board-header">
    <h2>{dayKey}</h2>
  </header>

  {#if $boardState.kind === "board"}
    <div class="columns">
      <Column title="今日やる" status="todo" cards={$boardState.board.todo} onDrop={handleDrop} />
      <Column title="着手中" status="doing" cards={$boardState.board.doing} onDrop={handleDrop} />
      <Column title="完了" status="done" cards={$boardState.board.done} onDrop={handleDrop} />
    </div>
  {:else if $boardState.kind === "missing"}
    <p class="message">今日のファイルがありません</p>
  {:else if $boardState.kind === "unreadable"}
    <p class="message">今日のファイルを読めませんでした。ファイルを保存し直すと読み直します</p>
  {/if}
</div>

<style>
.board {
  display: flex;
  flex-direction: column;
  gap: var(--size-4-4);
  height: 100%;
  padding: var(--size-4-4);
  color: var(--text-normal);
}

.board-header h2 {
  margin: 0;
}

.columns {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--size-4-4);
  align-items: start;
}

.message {
  color: var(--text-muted);
}
</style>
