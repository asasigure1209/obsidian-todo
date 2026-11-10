<script lang="ts">
import type { BoardSession } from "@/app/board/session";
import type { Card } from "@/domain/board";
import type { Workday } from "@/domain/schedule";
import Column from "./Column.svelte";
import type { Drop } from "./sortable";
import Timeline from "./Timeline.svelte";

interface Props {
  dayKey: string;
  /** 表示する状態（ストア）と、ボードからの操作の窓口 */
  session: BoardSession;
  /** M2 のダイアログを開く。Obsidian のダイアログは BoardView が持つ */
  openWork: (card: Card) => void;
  /** M4 のダイアログを開く */
  openAdd: () => void;
  /** 就業時間と休憩（design 8.2） */
  workday: Workday;
  /** 現在時刻の取得元。BoardView が持つ時計 */
  now: () => Date;
}

const { dayKey, session, openWork, openAdd, workday, now }: Props = $props();

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

  <div class="board-body">
    <aside class="sidebar">
      {#if $session.kind === "board"}
        <Timeline {dayKey} events={$session.events} {workday} {now} />
      {/if}
      <!-- 過去の日には追加できないので出さない（design 8.3） -->
      {#if $session.kind === "board" && $session.canAdd}
        <button type="button" class="add-todo" onclick={openAdd}>＋ TODOを追加</button>
      {/if}
    </aside>

    <div class="main">
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
  </div>
</div>

<style>
.board {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: var(--text-normal);
}

.board-header {
  padding: var(--size-4-4);
  border-bottom: 1px solid var(--background-modifier-border);
}

.board-header h2 {
  margin: 0;
}

/* 左にサイドバー、右に3列（モック M1） */
.board-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.sidebar {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 28px;
  width: 300px;
  padding: var(--size-4-6);
  border-right: 1px solid var(--background-modifier-border);
}

/* サイドバーのいちばん下に置く */
.add-todo {
  width: 100%;
  height: 44px;
  margin-top: auto;
  border: 1px solid var(--text-normal);
  border-radius: var(--radius-m);
  background-color: transparent;
  box-shadow: none;
  color: var(--text-normal);
  font-size: var(--font-ui-medium);
  font-weight: var(--font-medium);
}

.main {
  flex: 1;
  min-width: 0;
  padding: var(--size-4-6);
  overflow-y: auto;
}

.columns {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--size-4-5);
  align-items: start;
}

.message {
  color: var(--text-muted);
}
</style>
