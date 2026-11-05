import type { Clock } from "@/domain/clock";
import type { Alarm } from "@/domain/notifier";
import type { RunningTimer, Timer } from "@/domain/timer";
import type { TimerStore } from "@/domain/timer-store";

/** テストの「今日」と、時計が始まる時刻（2026-11-05 9:00） */
export const TODAY = "2026-11-05";
export const NINE = new Date(2026, 10, 5, 9, 0).getTime();

/** 今日の 9:00 から計測しているタイマー */
export const runningTimer = (
  text: string,
  overrides: Partial<RunningTimer> = {},
): RunningTimer => ({
  dayKey: TODAY,
  startedAt: NINE,
  text,
  held: false,
  ...overrides,
});

/** 進め方を操作できる時計。今日の 9:00 から始まる */
export class FakeClock implements Clock {
  private current = NINE;

  now(): Date {
    return new Date(this.current);
  }

  advance(minutes: number, seconds = 0): void {
    this.current += minutes * 60_000 + seconds * 1000;
  }
}

/** メモリ上の保存先。保存した順に saved に残す */
export class FakeTimerStore implements TimerStore {
  saved: Timer[] = [];
  /** この回数だけ保存した後は、保存が失敗する（0 ならすぐに失敗する） */
  failAfterSaves: number | undefined;

  constructor(private timer: Timer = undefined) {}

  async load(): Promise<Timer> {
    return this.timer;
  }

  async save(timer: Timer): Promise<void> {
    if (this.saved.length >= (this.failAfterSaves ?? Number.POSITIVE_INFINITY)) {
      throw new Error("保存できない");
    }
    this.timer = timer;
    this.saved.push(timer);
  }

  current(): Timer {
    return this.timer;
  }
}

/** 満了の知らせを記録する */
export class FakeAlarm implements Alarm {
  rings: string[] = [];
  prepares = 0;

  ring(message: string): void {
    this.rings.push(message);
  }

  prepare(): void {
    this.prepares++;
  }
}
