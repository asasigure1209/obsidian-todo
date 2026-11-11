import type { Plugin } from "obsidian";

type Data = Record<string, unknown>;

/**
 * プラグインの保存領域（data.json）。タイマー（timer）と設定（settings）が1つのファイルを分け合う。
 * 書き込みは「読む → 1つの項目だけ差し替える → 書く」を1本に並べて行う。
 * 並べないと、タイマーと設定の保存が同じ古い中身を読み、後から書いたほうが先の項目を消すため
 */
export class PluginData {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly plugin: Plugin) {}

  /** 書き込みの後に並べて読む（書きかけの値を読まない） */
  read(key: string): Promise<unknown> {
    return this.enqueue(async () => (await this.load())[key]);
  }

  /** ほかの項目は消さない */
  write(key: string, value: unknown): Promise<void> {
    return this.enqueue(async () => {
      const data = await this.load();
      await this.plugin.saveData({ ...data, [key]: value });
    });
  }

  /** 空や手で壊した中身（オブジェクトでない値）は、項目のない値として扱う */
  private async load(): Promise<Data> {
    const data: unknown = await this.plugin.loadData();
    return typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Data) : {};
  }

  /** 失敗しても並びは止めない。失敗は呼び出し元に返す */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.catch(() => undefined);
    return result;
  }
}
