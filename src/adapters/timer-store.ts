import type { Plugin } from "obsidian";
import { parseTimer, type Timer } from "@/domain/timer";
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
