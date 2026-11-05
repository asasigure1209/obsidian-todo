/** 利用者への知らせ。実体は adapters/notifier.ts（Obsidian 内の通知）が持つ（AD-1） */
export interface Notifier {
  notify(message: string): void;
}

/**
 * 25分の満了の知らせ（design 8.1）。見逃さないよう、消えない通知・OS の通知・短い音で知らせる。
 * 実体は adapters/notifier.ts
 */
export interface Alarm {
  ring(message: string): void;
  /** 計測を始めたとき（本人が操作しているとき）に呼ぶ。OS の通知の許可を、満了より前に尋ねておく */
  prepare(): void;
}
