<script lang="ts">
import type { DayProgress } from "@/domain/board";
import { formatDayLabel, nextDay, previousDay } from "@/domain/day";

interface Props {
  dayKey: string;
  /** ボードを読めたときだけ出す。読み込み中やファイルがない日は出さない */
  progress: DayProgress | undefined;
  /** 表示する日を切り替える。BoardView がボードを作り直す */
  showDay: (dayKey: string) => void;
  /** その日の作業ログを開く */
  openWorkLog: () => void;
  /** 今日のボードか。今日より先へは進めないので「次の日」を押せなくする（design 8.3）。日付をまたぐと Board が切り替える */
  isToday: boolean;
}

const { dayKey, progress, showDay, openWorkLog, isToday }: Props = $props();
</script>

{#snippet dayNav(label: string, arrow: string, target: string, disabled: boolean)}
  <button
    type="button"
    class="clickable-icon day-nav"
    aria-label={label}
    {disabled}
    onclick={() => showDay(target)}
  >
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <path d={arrow}></path>
    </svg>
  </button>
{/snippet}

<!-- モック M1 のヘッダー。「終業の振り返り」は M3 ができるまで出さない -->
<header class="header">
  <div class="day">
    {@render dayNav("前の日", "M15 6l-6 6 6 6", previousDay(dayKey), false)}
    <h1 class="date">{formatDayLabel(dayKey)}</h1>
    {@render dayNav("次の日", "M9 6l6 6-6 6", nextDay(dayKey), isToday)}
  </div>

  {#if progress}
    <div class="focus">
      <span>集中</span>
      <span class="count">{progress.done} / {progress.capacity}</span>
      <span>ポモドーロ</span>
      <div
        class="track"
        role="progressbar"
        aria-label="集中ポモドーロの進捗"
        aria-valuemin={0}
        aria-valuemax={progress.capacity}
        aria-valuenow={Math.min(progress.done, progress.capacity)}
      >
        <div class="fill" style:width="{progress.ratio * 100}%"></div>
      </div>
    </div>
  {/if}

  <div class="spacer"></div>

  <a
    class="work-log"
    href={`#${dayKey}`}
    onclick={(event) => {
      event.preventDefault();
      openWorkLog();
    }}
  >
    作業ログ {dayKey}
  </a>
</header>

<style>
.header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 20px;
  box-sizing: border-box;
  height: 72px;
  padding: 0 28px;
  border-bottom: 1px solid var(--background-modifier-border);
  background-color: var(--background-primary);
}

.day {
  display: flex;
  align-items: center;
  gap: var(--size-2-2);
}

/* 見た目は Obsidian のアイコンボタン（clickable-icon）。大きさだけモックに合わせる */
.day-nav {
  width: 44px;
  height: 44px;
}

/* 今日より先へは進めない（design 8.3） */
.day-nav:disabled {
  opacity: 0.4;
  cursor: default;
}

.date {
  margin: 0;
  color: var(--text-normal);
  font-size: 22px;
  font-weight: var(--font-bold);
  line-height: 1.3;
}

.focus {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-muted);
  font-size: 14px;
}

.count {
  color: var(--text-normal);
  font-family: var(--font-monospace);
  font-size: 16px;
}

.track {
  width: 160px;
  height: 6px;
  overflow: hidden;
  border-radius: 3px;
  background-color: var(--background-modifier-border);
}

.fill {
  height: 100%;
  background-color: var(--interactive-accent);
}

.spacer {
  flex: 1;
}

.work-log {
  padding: 10px 14px;
  border-radius: var(--radius-m);
  color: var(--text-accent);
  font-size: 14px;
  text-decoration: none;
}

.work-log:hover {
  text-decoration: underline;
}
</style>
