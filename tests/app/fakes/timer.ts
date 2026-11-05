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
  /** true の間、保存は失敗する */
  failing = false;
  /** この回数だけ保存した後は、保存が失敗する */
  failAfterSaves: number | undefined;

  constructor(private timer: Timer = undefined) {}

  async load(): Promise<Timer> {
    return this.timer;
  }

  async save(timer: Timer): Promise<void> {
    if (this.failing || this.saved.length >= (this.failAfterSaves ?? Number.POSITIVE_INFINITY)) {
      throw new Error("保存できない");
    }
    this.timer = timer;
    this.saved.push(timer);
  }

  current(): Timer {
    return this.timer;
  }
}
