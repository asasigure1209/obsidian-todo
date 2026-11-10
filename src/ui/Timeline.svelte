<script lang="ts">
import { HOUR_MINUTES } from "@/domain/minutes";
import {
  focus,
  formatClock,
  hourMarks,
  minuteOfDay,
  nowOffset,
  type ScheduledEvent,
  timelineBlocks,
  type Workday,
} from "@/domain/schedule";

interface Props {
  events: ScheduledEvent[];
  /** 就業時間と休憩（design 8.2）。設定の値で、変えるとボードごと作り直す（BoardView） */
  workday: Workday;
  /** 表示のための現在時刻。Board が毎秒読んで渡す */
  now: Date;
  /** 今日のボードか。現在時刻の線と集中できる時間は今日だけに出す */
  isToday: boolean;
}

const { events, workday, now, isToday }: Props = $props();

/** モックの目盛りの間隔（1時間あたりの高さ） */
const HOUR_PX = 44;
const PX_PER_MINUTE = HOUR_PX / HOUR_MINUTES;
/** 短い予定でも予定名が読めるよう、ブロックは1行分より低くしない */
const MIN_BLOCK_PX = 18;

const hours = $derived(workday.hours);
const minute = $derived(minuteOfDay(now));
const nowTop = $derived(isToday ? nowOffset(minute, hours) : undefined);
const summary = $derived(focus(events, workday, minute));
</script>

<section class="schedule">
  <h2 class="heading">{isToday ? "今日の予定" : "予定"}（Googleカレンダー）</h2>
  <div class="timeline" style:height="{(hours.end - hours.start) * PX_PER_MINUTE}px">
    {#each hourMarks(hours) as mark (mark.hour)}
      <div class="mark" style:top="{mark.top * PX_PER_MINUTE}px">
        <span class="mark-label">{mark.hour}:00</span>
        <div class="mark-line"></div>
      </div>
    {/each}
    <!-- 同じ時刻と名前の予定が2件あってもよいので、キーは付けない -->
    {#each timelineBlocks(events, hours) as block}
      <div
        class="event"
        style:top="{block.top * PX_PER_MINUTE}px"
        style:height="{Math.max(block.height * PX_PER_MINUTE, MIN_BLOCK_PX)}px"
      >
        <span class="event-title">{block.event.title}</span>
        <span class="event-time">{formatClock(block.event.start)}</span>
      </div>
    {/each}
    {#if nowTop !== undefined}
      <div class="now" style:top="{nowTop * PX_PER_MINUTE}px">
        <span class="visually-hidden">現在時刻 {formatClock(minute)}</span>
        <span class="now-dot"></span>
        <div class="now-line"></div>
      </div>
    {/if}
  </div>
  {#if isToday}
    <p class="focus">
      {#if summary.kind === "ended"}
        今日の就業時間は終わりました
      {:else}
        この後、予定の合間で集中できるのは約 {summary.hours}時間（{summary.pomodoros}ポモドーロ）
      {/if}
    </p>
  {/if}
</section>

<style>
.schedule {
  display: flex;
  flex-direction: column;
  gap: var(--size-4-3);
}

.heading {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-ui-small);
  font-weight: var(--font-bold);
}

.timeline {
  position: relative;
  margin-top: 6px;
}

.mark {
  position: absolute;
  right: 0;
  left: 0;
  display: flex;
  align-items: center;
  gap: var(--size-4-2);
  transform: translateY(-50%);
}

.mark-label {
  width: 36px;
  color: var(--text-muted);
  font-family: var(--font-monospace);
  font-size: 11px;
  text-align: right;
}

.mark-line {
  flex: 1;
  height: 1px;
  background-color: var(--background-modifier-border);
}

.event {
  position: absolute;
  right: 0;
  left: 50px;
  display: flex;
  align-items: flex-start;
  gap: var(--size-4-2);
  box-sizing: border-box;
  padding: 2px var(--size-4-2);
  overflow: hidden;
  border-left: 3px solid var(--interactive-accent);
  border-radius: 4px;
  background-color: hsla(var(--interactive-accent-hsl), 0.15);
}

.event-title {
  color: var(--text-normal);
  font-size: var(--font-ui-smaller);
  font-weight: var(--font-medium);
  line-height: 1.5;
}

.event-time {
  color: var(--text-muted);
  font-family: var(--font-monospace);
  font-size: 11px;
  line-height: 1.6;
}

.now {
  position: absolute;
  right: 0;
  left: 40px;
  display: flex;
  align-items: center;
  transform: translateY(-50%);
}

.now-dot {
  width: 10px;
  height: 10px;
  margin-left: -5px;
  border-radius: 50%;
  background-color: var(--color-red);
}

.now-line {
  flex: 1;
  height: 2px;
  background-color: var(--color-red);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.focus {
  margin: 0;
  padding: 10px var(--size-4-3);
  border-radius: var(--radius-m);
  background-color: var(--background-secondary);
  color: var(--text-muted);
  font-size: var(--font-ui-smaller);
  line-height: 1.6;
}
</style>
