import { normalizePath, type TAbstractFile, type Vault } from "obsidian";
import type { DayFiles } from "@/domain/day-files";

/** `{フォルダ}/YYYY-MM-DD.md` を読む DayFiles（design 7.1） */
export class VaultDayFiles implements DayFiles {
  constructor(
    private readonly vault: Vault,
    private readonly folder: string,
  ) {}

  /** 変更の直後に読むので、キャッシュではなくディスクから読む */
  async read(dayKey: string): Promise<string | undefined> {
    const file = this.vault.getFileByPath(this.pathOf(dayKey));
    return file ? this.vault.read(file) : undefined;
  }

  async process(dayKey: string, transform: (body: string) => string): Promise<boolean> {
    const file = this.vault.getFileByPath(this.pathOf(dayKey));
    if (!file) {
      return false;
    }
    await this.vault.process(file, transform);
    return true;
  }

  /** 名前の変更は、その日のファイルへ変わったときも、その日のファイルから変わったときも知らせる */
  onChange(dayKey: string, listener: () => void): () => void {
    const path = this.pathOf(dayKey);
    const handler = (file: TAbstractFile, oldPath?: string) => {
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
      for (const ref of refs) {
        this.vault.offref(ref);
      }
    };
  }

  private pathOf(dayKey: string): string {
    return normalizePath(`${this.folder}/${dayKey}.md`);
  }
}
