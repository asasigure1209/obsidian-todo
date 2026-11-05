import { Notice } from "obsidian";
import type { Notifier } from "@/domain/notifier";

/** Obsidian 内の通知 */
export const noticeNotifier: Notifier = {
  notify: (message) => {
    new Notice(message);
  },
};
