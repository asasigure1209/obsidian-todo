<script lang="ts">
import { POMODORO_MINUTES } from "@/domain/minutes";

interface Props {
  startedAt: number;
  /** 何個目のポモドーロか（1から） */
  count: number;
}

const { startedAt, count }: Props = $props();

const TOTAL_MS = POMODORO_MINUTES * 60_000;
const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** 表示のためだけの現在時刻。確定は DayEditor の毎秒の判定が行う */
let now = $state(Date.now());

$effect(() => {
  const id = window.setInterval(() => {
    now = Date.now();
  }, 1000);
  return () => window.clearInterval(id);
});

const remaining = $derived(Math.min(TOTAL_MS, Math.max(0, TOTAL_MS - (now - startedAt))));
const label = $derived(
  `${String(Math.floor(remaining / 60_000)).padStart(2, "0")}:${String(
    Math.floor((remaining % 60_000) / 1000),
  ).padStart(2, "0")}`,
);
</script>

<div class="timer">
  <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
    <circle class="track" cx="32" cy="32" r={RADIUS} />
    <circle
      class="progress"
      cx="32"
      cy="32"
      r={RADIUS}
      stroke-dasharray={CIRCUMFERENCE}
      stroke-dashoffset={CIRCUMFERENCE * (1 - remaining / TOTAL_MS)}
    />
  </svg>
  <div class="text">
    <span class="remaining"><span class="visually-hidden">残り</span>{label}</span>
    <span class="count">{count}個目のポモドーロ</span>
  </div>
</div>

<style>
.timer {
  display: flex;
  align-items: center;
  gap: var(--size-4-3);
}

svg {
  flex: none;
  transform: rotate(-90deg);
}

circle {
  fill: none;
  stroke-width: 6;
}

.track {
  stroke: var(--background-modifier-border);
}

.progress {
  stroke: var(--interactive-accent);
  stroke-linecap: round;
  transition: stroke-dashoffset 0.9s linear;
}

.text {
  display: flex;
  flex-direction: column;
}

.remaining {
  font-size: var(--font-ui-large);
  font-variant-numeric: tabular-nums;
  font-weight: var(--font-semibold);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.count {
  color: var(--text-muted);
  font-size: var(--font-ui-smaller);
}
</style>
