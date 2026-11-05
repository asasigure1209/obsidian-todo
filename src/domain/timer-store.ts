import type { Timer } from "@/domain/timer";

/** 計測中のタイマーの保存先（AD-6）。実体は adapters/timer-store.ts（プラグインの保存領域） */
export interface TimerStore {
  load(): Promise<Timer>;
  save(timer: Timer): Promise<void>;
}
