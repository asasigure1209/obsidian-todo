import type { PluginData } from "@/adapters/plugin-data";
import type { Settings } from "@/domain/settings";
import type { SettingsStore } from "@/domain/settings-store";

/** プラグインの保存領域（data.json）の settings に置く。形の検査は app/ が parseSettings（domain）で行う */
export class PluginSettingsStore implements SettingsStore {
  constructor(private readonly data: PluginData) {}

  load(): Promise<unknown> {
    return this.data.read("settings");
  }

  save(settings: Settings): Promise<void> {
    return this.data.write("settings", settings);
  }
}
