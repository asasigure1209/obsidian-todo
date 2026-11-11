<script lang="ts">
import type { Snippet } from "svelte";
import { MINUTE_MS, POMODORO_MS } from "@/domain/minutes";

interface Props {
  /** 計測の開始時刻。停止中は undefined */
  startedAt: number | undefined;
  /** 残り時間の下の1行（「2個目のポモドーロ ／ 見積 3」など）。空なら出さない */
  note: string;
  /** その行の右に置くもの（「時間を修正」） */
  children?: Snippet;
}

const { startedAt, note, children }: Props = $props();

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** 表示のためだけの現在時刻。確定は DayEditor の毎秒の判定が行う */
let now = $state(Date.now());

$effect(() => {
  if (startedAt === undefined) {
    return;
  }
  // 停止中から計測中に戻ったとき、止まっていた間の古い時刻で1秒描かない
  now = Date.now();
  const id = window.setInterval(() => {
    now = Date.now();
  }, 1000);
  return () => window.clearInterval(id);
});

const stopped = $derived(startedAt === undefined);
const remaining = $derived(
  startedAt === undefined
    ? POMODORO_MS
    : Math.min(POMODORO_MS, Math.max(0, POMODORO_MS - (now - startedAt))),
);
const minutes = $derived(Math.floor(remaining / MINUTE_MS));
const seconds = $derived(Math.floor((remaining % MINUTE_MS) / 1000));
const label = $derived(`${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`);
/** 停止中はリングを灰色で満たす（モック M1） */
const offset = $derived(stopped ? 0 : CIRCUMFERENCE * (1 - remaining / POMODORO_MS));
</script>

<div class="timer" class:stopped>
  <svg
    viewBox="0 0 96 96"
    width="96"
    height="96"
    role="img"
    aria-label={stopped ? "タイマー停止中" : `残り${minutes}分${seconds}秒`}
  >
    <circle class="track" cx="48" cy="48" r={RADIUS} />
    <circle
      class="progress"
      cx="48"
      cy="48"
      r={RADIUS}
      stroke-dasharray={CIRCUMFERENCE}
      stroke-dashoffset={offset}
    />
  </svg>
  <div class="text">
    <span class="remaining" aria-hidden="true">{stopped ? "停止中" : label}</span>
    <div class="note">
      {#if note}
        <span>{note}</span>
      {/if}
      {@render children?.()}
    </div>
  </div>
</div>

<style>
.timer {
  display: flex;
  align-items: center;
  gap: 18px;
}

svg {
  flex: none;
  transform: rotate(-90deg);
}

circle {
  fill: none;
  stroke-width: 8;
}

.track {
  stroke: var(--background-modifier-border);
}

.progress {
  stroke: var(--interactive-accent);
  stroke-linecap: round;
  transition: stroke-dashoffset 0.9s linear;
}

.stopped .progress {
  stroke: var(--text-faint);
}

.text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.remaining {
  color: var(--text-normal);
  font-family: var(--font-monospace);
  font-size: 34px;
  line-height: 1;
}

.stopped .remaining {
  color: var(--text-muted);
}

/* 狭いときは「時間を修正」を次の行へ送る */
.note {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: var(--size-4-2);
  color: var(--text-muted);
  font-size: 13px;
}
</style>
