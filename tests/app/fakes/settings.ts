import type { Settings } from "@/domain/settings";
import type { SettingsStore } from "@/domain/settings-store";

/** メモリ上の設定の保存先。保存した順に saved に残す */
export class FakeSettingsStore implements SettingsStore {
  saved: Settings[] = [];
  failNextLoad = false;
  failNextSave = false;

  constructor(private readonly stored: unknown = undefined) {}

  async load(): Promise<unknown> {
    if (this.failNextLoad) {
      this.failNextLoad = false;
      throw new Error("読めない");
    }
    return this.stored;
  }

  async save(settings: Settings): Promise<void> {
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new Error("保存できない");
    }
    this.saved.push(settings);
  }
}
