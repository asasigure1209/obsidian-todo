<script lang="ts">
import type { BoardState } from "@/app/board/session";
import { dayWord as dayWordOf } from "@/app/messages";
import { formatDayLabel } from "@/domain/day";
import {
  formatActual,
  formatDifference,
  formatFocusTime,
  formatOverrun,
  toReview,
} from "@/domain/review";
import DayNotice from "./DayNotice.svelte";

interface Props {
  dayKey: string;
  /** ボードと同じ状態。ファイルが変わったら読み直した結果が来る（何も書き込まない） */
  view: BoardState;
  /** 今日の振り返りか。過去の日は文言を「この日」「翌日」にする */
  isToday: boolean;
  /** 作業ログと日報のパス（「作業ログ/2026-11-03.md」）。開くときも同じパスを渡す */
  workLogPath: string;
  dailyReportPath: string;
  /** ボードに戻る */
  back: () => void;
  /** そのパスのファイルを開く。ファイルがなければ Obsidian が作る（作業ログはヘッダーのリンクと同じ） */
  openWorkLog: (path: string) => void;
  openDailyReport: (path: string) => void;
}

const {
  dayKey,
  view,
  isToday,
  workLogPath,
  dailyReportPath,
  back,
  openWorkLog,
  openDailyReport,
}: Props = $props();

const review = $derived(view.kind === "board" ? toReview(view.board) : undefined);
/** ボードの知らせと同じく、今日以外は「この日」と言う */
const dayWord = $derived(dayWordOf(isToday));
const nextDayWord = $derived(isToday ? "明日" : "翌日");

/** 開いたら「ボードに戻る」にフォーカスを置く */
let backButton: HTMLButtonElement | undefined = $state();
$effect(() => {
  backButton?.focus();
});
</script>

<!-- モック M3。ボードのタブの中身を切り替えて出す -->
<div class="review">
  <header class="header">
    <button
      type="button"
      class="clickable-icon back"
      aria-label="ボードに戻る"
      bind:this={backButton}
      onclick={back}
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
        <path d="M15 6l-6 6 6 6"></path>
      </svg>
    </button>
    <h1 class="title">終業の振り返り — {formatDayLabel(dayKey)}</h1>
  </header>

  {#if review}
    <div class="content">
      <div class="left">
        <div class="stats">
          <section class="panel stat">
            <span class="stat-label">完了</span>
            <span class="stat-value">{review.completed} / {review.total}</span>
          </section>
          <section class="panel stat">
            <span class="stat-label">人の集中時間</span>
            <span class="stat-value">{formatFocusTime(review.focusMinutes)}</span>
            <span class="stat-note">
              ポモドーロ {review.pomodoros} ＋ 中断 {review.interruptions}回
            </span>
          </section>
        </div>

        <section class="panel estimates">
          <h2 class="heading">見積もりと実績</h2>
          <table class="table">
            <thead>
              <tr>
                <th>TODO</th>
                <th class="narrow">見積</th>
                <th class="narrow">実績</th>
                <th class="wide">差</th>
              </tr>
            </thead>
            <tbody>
              {#each review.rows as row (row.key)}
                <tr>
                  <td>{row.name}</td>
                  <td class="figure">{row.estimate ?? "—"}</td>
                  <td class="figure">{formatActual(row.minutes)}</td>
                  <!-- 差の色は種類（over・early・even）で決める。見積もりがなければ空欄 -->
                  <td class={row.difference?.kind}>
                    {row.difference ? formatDifference(row.difference) : ""}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
          <div class="table-notes">
            <span>単位：ポモドーロ（25分）</span>
            {#if review.unfinished > 0}
              <span>
                未完了の{review.unfinished}件は、{dayWord}のリストに残したまま{nextDayWord}のリストへ複製されます
              </span>
            {/if}
          </div>
        </section>
      </div>

      <div class="right">
        <section class="report">
          <h2 class="heading">日報を書く</h2>
          <p class="report-lead">
            {dayWord}の実績と、作業ログから拾った出来事を材料として並べます。Good/Bad/Tryはあなたが書きます。
          </p>
          <ul class="materials">
            <li>
              作業ログ：<a
                class="work-log"
                href={`#${workLogPath}`}
                onclick={(event) => {
                  event.preventDefault();
                  openWorkLog(workLogPath);
                }}
                >{workLogPath}</a
              >
            </li>
            {#if review.interruptions > 0}
              <li>
                中断 {review.interruptions}回
                {#if review.interruptionMemos.length > 0}
                  <ul>
                    {#each review.interruptionMemos as memo, index (index)}
                      <li>{memo}</li>
                    {/each}
                  </ul>
                {/if}
              </li>
            {/if}
            {#each review.overruns as overrun, index (index)}
              <li>{formatOverrun(overrun)}</li>
            {/each}
          </ul>
          <button
            type="button"
            class="open-report"
            onclick={() => openDailyReport(dailyReportPath)}
          >
            {dailyReportPath}
            を開く
          </button>
        </section>
      </div>
    </div>
  {:else if view.kind === "missing" || view.kind === "unreadable"}
    <div class="notice"><DayNotice kind={view.kind} {isToday} /></div>
  {/if}
</div>

<style>
.review {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: var(--text-normal);
}

/* 高さと余白はボードのヘッダーに揃える（モック M3） */
.header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 16px;
  box-sizing: border-box;
  height: 72px;
  padding: 0 28px;
  border-bottom: 1px solid var(--background-modifier-border);
  background-color: var(--background-primary);
}

.back {
  width: 44px;
  height: 44px;
}

.title {
  margin: 0;
  font-size: 22px;
  font-weight: var(--font-bold);
  line-height: 1.3;
}

/* 左に数と表、右に「日報を書く」（3:2） */
.content {
  display: grid;
  flex: 1;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 24px;
  align-items: start;
  min-height: 0;
  padding: 28px;
  overflow-y: auto;
}

.left,
.right {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.panel {
  border: 1px solid var(--background-modifier-border);
  border-radius: 12px;
  background-color: var(--background-primary);
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 20px;
}

.stat-label {
  color: var(--text-muted);
  font-size: 13px;
}

.stat-value {
  font-family: var(--font-monospace);
  font-size: 30px;
}

.stat-note {
  color: var(--text-muted);
  font-size: 12px;
}

.estimates,
.report {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 24px;
}

.heading {
  margin: 0;
  font-size: 16px;
  font-weight: var(--font-bold);
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  line-height: 1.6;
}

.table th,
.table td {
  text-align: left;
  vertical-align: middle;
}

.table th {
  padding: 8px 0;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: var(--font-medium);
}

.table td {
  padding: 10px 0;
  border-top: 1px solid var(--background-modifier-border);
}

.narrow {
  width: 80px;
}

.wide {
  width: 110px;
}

.figure {
  font-family: var(--font-monospace);
}

.even {
  color: var(--text-normal);
}

/* 見積もり超過の色 */
.over {
  color: var(--color-orange);
}

/* 早く完了の色 */
.early {
  color: var(--color-green);
}

.table-notes {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-muted);
  font-size: 12px;
}

/* 濃い色の枠。ライトでは主ボタンと同じく明暗を反転させる（モック M3） */
.report {
  --report-muted: color-mix(in srgb, var(--background-primary) 85%, var(--text-normal));
  border: 1px solid var(--text-normal);
  border-radius: 12px;
  background-color: var(--text-normal);
  color: var(--background-primary);
}

/* ダークでは反転させず、背景より一段明るい地にする（モック M3 のダーク） */
:global(.theme-dark) .report {
  --report-muted: var(--text-muted);
  border-color: var(--background-modifier-border-hover);
  background-color: var(--background-secondary-alt);
  color: var(--text-normal);
}

.report-lead {
  margin: 0;
  color: var(--report-muted);
  font-size: 14px;
  line-height: 1.8;
}

.materials {
  margin: 0;
  padding-left: 20px;
  color: var(--report-muted);
  font-size: 13px;
  line-height: 1.8;
}

.materials ul {
  margin: 0;
  padding-left: 20px;
}

.work-log {
  color: inherit;
  text-decoration: underline;
}

.open-report {
  height: 44px;
  border: none;
  border-radius: 8px;
  background-color: var(--background-primary);
  box-shadow: none;
  color: var(--text-normal);
  font-size: 15px;
  font-weight: var(--font-medium);
}

:global(.theme-dark) .open-report {
  background-color: var(--text-normal);
  color: var(--background-primary);
}

.notice {
  padding: 28px;
}
</style>
