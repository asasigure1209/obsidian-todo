<script lang="ts">
import type { BoardState, Readable } from "@/app/board-service";
import Column from "./Column.svelte";

interface Props {
  dayKey: string;
  boardState: Readable<BoardState>;
}

const { dayKey, boardState }: Props = $props();
</script>

<div class="board">
  <header class="board-header">
    <h2>{dayKey}</h2>
  </header>

  {#if $boardState.kind === "board"}
    <div class="columns">
      <Column title="今日やる" status="todo" cards={$boardState.board.todo} />
      <Column title="着手中" status="doing" cards={$boardState.board.doing} />
      <Column title="完了" status="done" cards={$boardState.board.done} />
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
