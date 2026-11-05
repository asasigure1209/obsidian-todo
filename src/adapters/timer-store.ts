import type { Plugin } from "obsidian";
import type { RunningTimer, Timer } from "@/domain/timer";
import type { TimerStore } from "@/domain/timer-store";

/** プラグインの保存領域（data.json）の timer に置く。ほかの項目（今後の設定）は消さない */
export class PluginTimerStore implements TimerStore {
  constructor(private readonly plugin: Plugin) {}

  async load(): Promise<Timer> {
    const data = await this.plugin.loadData();
    return parseTimer(data?.timer);
  }

  async save(timer: Timer): Promise<void> {
    const data = (await this.plugin.loadData()) ?? {};
    await this.plugin.saveData({ ...data, timer: timer ?? null });
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
