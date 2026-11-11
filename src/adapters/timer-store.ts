import type { PluginData } from "@/adapters/plugin-data";
import type { RunningTimer, Timer } from "@/domain/timer";
import type { TimerStore } from "@/domain/timer-store";

/** プラグインの保存領域（data.json）の timer に置く。ほかの項目（settings）は消さない（adapters/plugin-data.ts） */
export class PluginTimerStore implements TimerStore {
  constructor(private readonly data: PluginData) {}

  async load(): Promise<Timer> {
    return parseTimer(await this.data.read("timer"));
  }

  save(timer: Timer): Promise<void> {
    return this.data.write("timer", timer ?? null);
  }
}

/** 保存領域から読んだ値をタイマーにする。形が合わなければ停止中（プラグインの更新や手での編集で崩れていても動くように） */
function parseTimer(value: unknown): Timer {
  const object = typeof value === "object" && value !== null ? value : {};
  const { dayKey, startedAt, text, held } = object as Partial<RunningTimer>;
  const valid =
    typeof dayKey === "string" &&
    typeof startedAt === "number" &&
    typeof text === "string" &&
    typeof held === "boolean";
  return valid ? { dayKey, startedAt, text, held } : undefined;
}
