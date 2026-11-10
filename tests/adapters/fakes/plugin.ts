import type { Plugin } from "obsidian";

/**
 * 保存領域（data.json）の読み書きだけを持つ Plugin の偽物。
 * Obsidian と同じく、読み書きは非同期で終わる（間に別の読み書きが入りうる）
 */
export class FakePlugin {
  saves = 0;
  failNextSave = false;

  constructor(public data: unknown = null) {}

  async loadData(): Promise<unknown> {
    await pause();
    return structuredClone(this.data);
  }

  async saveData(data: unknown): Promise<void> {
    await pause();
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new Error("保存できない");
    }
    this.saves++;
    this.data = structuredClone(data);
  }

  asPlugin(): Plugin {
    return this as unknown as Plugin;
  }
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 0));
