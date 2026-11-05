import type { Clock } from "@/domain/clock";
import type { Timer } from "@/domain/timer";
import type { TimerStore } from "@/domain/timer-store";

/** 進め方を操作できる時計。2026-11-05 9:00 から始まる */
export class FakeClock implements Clock {
  private current = new Date(2026, 10, 5, 9, 0).getTime();

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

  constructor(private timer: Timer = undefined) {}

  async load(): Promise<Timer> {
    return this.timer;
  }

  async save(timer: Timer): Promise<void> {
    this.timer = timer;
    this.saved.push(timer);
  }

  current(): Timer {
    return this.timer;
  }
}
