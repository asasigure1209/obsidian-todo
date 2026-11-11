import type { Settings } from "@/domain/settings";

/** 設定の保存先。実体は adapters/settings-store.ts（プラグインの保存領域） */
export interface SettingsStore {
  /** 保存領域から読んだままの値。形は parseSettings で確かめる（adapters/ は domain の値を使わないため） */
  load(): Promise<unknown>;
  save(settings: Settings): Promise<void>;
}
