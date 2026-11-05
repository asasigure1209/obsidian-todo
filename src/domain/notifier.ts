/** 利用者への知らせ。実体は adapters/notifier.ts（Obsidian 内の通知）が持つ（AD-1） */
export interface Notifier {
  notify(message: string): void;
}

/** 25分の満了を知らせる短い音（design 8.1）。実体は adapters/notifier.ts */
export interface Alarm {
  ring(): void;
}
