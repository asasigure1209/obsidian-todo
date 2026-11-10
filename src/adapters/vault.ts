import { normalizePath, type TAbstractFile, type Vault } from "obsidian";
import type { DayFiles } from "@/domain/day-files";

/**
 * `{フォルダ}/YYYY-MM-DD.md` を読む DayFiles（design 7.1）。
 * フォルダは設定で変えられるので、読み書きと変更イベントのたびに今の設定から求める。
 * 購読を張り直さなくても、変えた後のフォルダのファイルの変更を知らせる（DayEditor の見張りを切らさない）
 */
export class VaultDayFiles implements DayFiles {
  /** 購読中の受け取り手。フォルダが変わったら、すべてに知らせる */
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly vault: Vault,
    /** 今の TODO のフォルダ */
    private readonly folder: () => string,
  ) {}

  /** 変更の直後に読むので、キャッシュではなくディスクから読む */
  async read(dayKey: string): Promise<string | undefined> {
    const file = this.vault.getFileByPath(this.pathOf(dayKey));
    return file ? this.vault.read(file) : undefined;
  }

  /**
   * 変換しても本文が変わらない（操作を取りやめた）ときは書き込まない。同期ツールや開いているエディタに、変わっていない書き込みを見せないため。
   * 変換は純粋なので、読んだ後に本文が変わっていても vault.process が最新の本文に当て直す
   */
  async process(dayKey: string, transform: (body: string) => string): Promise<boolean> {
    const file = this.vault.getFileByPath(this.pathOf(dayKey));
    if (!file) {
      return false;
    }
    const body = await this.vault.read(file);
    if (transform(body) !== body) {
      await this.vault.process(file, transform);
    }
    return true;
  }

  /**
   * TODO のフォルダが変わった。どの日のファイルも別のファイルになるので、購読中の受け取り手すべてに変更として知らせる
   * （ボードは新しいフォルダのファイルを読み直し、保留中のタイマーは新しいファイルで判定し直す）
   */
  folderChanged(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }

  /** 名前の変更は、その日のファイルへ変わったときも、その日のファイルから変わったときも知らせる */
  onChange(dayKey: string, listener: () => void): () => void {
    this.listeners.add(listener);
    const handler = (file: TAbstractFile, oldPath?: string) => {
      const path = this.pathOf(dayKey);
      if (file.path === path || oldPath === path) {
        listener();
      }
    };
    const refs = [
      this.vault.on("create", handler),
      this.vault.on("modify", handler),
      this.vault.on("delete", handler),
      this.vault.on("rename", handler),
    ];
    return () => {
      this.listeners.delete(listener);
      for (const ref of refs) {
        this.vault.offref(ref);
      }
    };
  }

  private pathOf(dayKey: string): string {
    return normalizePath(`${this.folder()}/${dayKey}.md`);
  }
}
