<script lang="ts">
import type { BoardSession } from "@/app/board-service";
import type { Card } from "@/domain/board";
import Column from "./Column.svelte";
import type { Drop } from "./sortable";

interface Props {
  dayKey: string;
  /** 表示する状態（ストア）と、ボードからの操作の窓口 */
  session: BoardSession;
  /** M2 のダイアログを開く。Obsidian のダイアログは BoardView が持つ */
  openWork: (card: Card) => void;
}

const { dayKey, session, openWork }: Props = $props();

const COLUMNS = [
  ["todo", "今日やる"],
  ["doing", "着手中"],
  ["done", "完了"],
] as const;

/** ドロップしたカードを key から探し、そのときのボードの ref で動かす */
function handleDrop(drop: Drop): void {
  if ($session.kind !== "board") {
    return;
  }
  const { todo, doing, done } = $session.board;
  const card = [...todo, ...doing, ...done].find((c) => c.key === drop.key);
  if (card) {
    void session.move(card.ref, drop.status, drop.position);
  }
}
</script>

<div class="board">
  <header class="board-header">
    <h2>{dayKey}</h2>
  </header>

  {#if $session.kind === "board"}
    <div class="columns">
      {#each COLUMNS as [status, title] (status)}
        <Column
          {title}
          {status}
          {session}
          cards={$session.board[status]}
          running={$session.running}
          onDrop={handleDrop}
          {openWork}
        />
      {/each}
    </div>
  {:else if $session.kind === "missing"}
    <p class="message">今日のファイルがありません</p>
  {:else if $session.kind === "unreadable"}
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
