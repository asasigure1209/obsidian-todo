/** 利用者への知らせ。実体は adapters/notifier.ts（Obsidian 内の通知）が持つ（AD-1） */
export interface Notifier {
  notify(message: string): void;
}
