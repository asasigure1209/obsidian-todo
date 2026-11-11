<script lang="ts">
import { untrack } from "svelte";
import type { BoardSession } from "@/app/board/session";
import type { Readable } from "@/app/store";
import { type Card, dayProgress } from "@/domain/board";
import { canEdit, dayFilePath, toDayKey } from "@/domain/day";
import type { Settings } from "@/domain/settings";
import Column from "./Column.svelte";
import Header from "./Header.svelte";
import Review from "./Review.svelte";
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
  /** 設定。就業時間と休憩（design 8.2）を読み、変わったらその場で描き直す */
  settings: Readable<Settings>;
  /** 現在時刻の取得元。BoardView が持つ時計 */
  now: () => Date;
  /** 日付をまたいで今日が変わったとき（タブの見出しを読み直す） */
  onTodayChange: () => void;
  /** 表示する日を切り替える（ヘッダーの「前の日」「次の日」） */
  showDay: (dayKey: string) => void;
  /** その日の作業ログを開く */
  openWorkLog: () => void;
  /** その日の日報を開く（M3） */
  openDailyReport: () => void;
}

const {
  dayKey,
  session,
  openWork,
  openAdd,
  settings,
  now: readNow,
  onTodayChange,
  showDay,
  openWorkLog,
  openDailyReport,
}: Props = $props();

/** 終業の振り返り（M3）を出しているか。タブの中身を切り替えるだけで、日を切り替えるとボードに戻る（作り直すため） */
let reviewing = $state(false);

const workday = $derived($settings.workday);

/**
 * 表示のための現在時刻。ボードの中でここだけが毎秒読み、ヘッダーとタイムラインに渡す。
 * 開いたまま日付をまたいでも、「次の日」・文言・タイムラインが同じ時点で切り替わる
 */
let now = $state(untrack(() => readNow()));

$effect(() => {
  const id = window.setInterval(() => {
    now = readNow();
  }, 1000);
  return () => window.clearInterval(id);
});

const today = $derived(toDayKey(now));
const isToday = $derived(dayKey === today);
/** 過去の日には追加できない（design 8.3）。書き込むときは session が改めて確かめる */
const canAdd = $derived(canEdit("add", dayKey, today));

$effect(() => {
  // today が変わるたびに呼ぶ
  void today;
  untrack(onTodayChange);
});

/** 集中ポモドーロ数。分母は就業時間の全体で数えるので、1日の中で変わらない */
const progress = $derived(
  $session.kind === "board" ? dayProgress($session.board, $session.events, workday) : undefined,
);
/** 知らせの文言の「今日」「この日」 */
const dayWord = $derived(isToday ? "今日" : "この日");

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

{#if reviewing}
  <Review
    {dayKey}
    state={$session}
    {dayWord}
    workLogPath={dayFilePath($settings.folders.workLog, dayKey)}
    dailyReportPath={dayFilePath($settings.folders.dailyReport, dayKey)}
    back={() => (reviewing = false)}
    {openWorkLog}
    {openDailyReport}
  />
{/if}

<!-- 振り返りの間はボードを隠すだけ（作り直さない）。振り返りは、その日のファイルを読めた日に出す（過去の日も） -->
<div class="board" class:hidden={reviewing}>
  <Header
    {dayKey}
    {progress}
    {isToday}
    {showDay}
    {openWorkLog}
    openReview={$session.kind === "board" ? () => (reviewing = true) : undefined}
  />

  <div class="board-body">
    <aside class="sidebar">
      {#if $session.kind === "board"}
        <Timeline events={$session.events} {workday} {now} {isToday} />
      {/if}
      <!-- 過去の日には追加できないので出さない（design 8.3） -->
      {#if $session.kind === "board" && canAdd}
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
        <p class="message">{dayWord}のファイルがありません</p>
      {:else if $session.kind === "unreadable"}
        <p class="message">
          {dayWord}のファイルを読めませんでした。ファイルを保存し直すと読み直します
        </p>
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

/* 終業の振り返り（M3）を出している間 */
.board.hidden {
  display: none;
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
