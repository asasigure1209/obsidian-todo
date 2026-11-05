import { Plugin } from "obsidian";
import { systemClock } from "@/adapters/clock";
import { beepAlarm, noticeNotifier } from "@/adapters/notifier";
import { PluginTimerStore } from "@/adapters/timer-store";
import { VaultDayFiles } from "@/adapters/vault";
import type { BoardDeps } from "@/app/board-service";
import { openDayEditor } from "@/app/day-editor";
import { BOARD_ICON, BOARD_VIEW_TYPE, BoardView } from "@/ui/BoardView";

const OPEN_BOARD_LABEL = "今日のボードを開く";
/** TODO ファイルのフォルダ。設定で変えられるようにするまでの既定値（design 7.1） */
const TODO_FOLDER = "TODO";
/** 25分の満了を判定する間隔 */
const TICK_MS = 1000;

export default class DailyKanbanTodoPlugin extends Plugin {
  override async onload(): Promise<void> {
    const files = new VaultDayFiles(this.app.vault, TODO_FOLDER);
    // タイマーはボードを閉じていても進め、満了で記録して知らせる。起動直後の判定でスリープ中の満了も確定する（design 8.1）
    const editor = await openDayEditor({
      files,
      store: new PluginTimerStore(this),
      clock: systemClock,
      notifier: noticeNotifier,
      alarm: beepAlarm,
      onError: reportError,
    });
    this.register(() => editor.close());
    this.registerInterval(window.setInterval(() => editor.tick(), TICK_MS));
    const deps: BoardDeps = {
      files,
      clock: systemClock,
      notifier: noticeNotifier,
      editor,
      onError: reportError,
    };
    this.registerView(BOARD_VIEW_TYPE, (leaf) => new BoardView(leaf, deps));
    this.addRibbonIcon(BOARD_ICON, OPEN_BOARD_LABEL, () => this.activateView());
    this.addCommand({
      id: "open-board",
      name: OPEN_BOARD_LABEL,
      callback: () => this.activateView(),
    });
  }

  private async activateView(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(BOARD_VIEW_TYPE)[0];
    if (existing) {
      // revealLeaf で遅延読み込みのビューが読み込まれるので、その後に今日へ切り替える
      await workspace.revealLeaf(existing);
      if (existing.view instanceof BoardView) {
        await existing.view.showToday();
      }
      return;
    }
    const leaf = workspace.getLeaf("tab");
    await leaf.setViewState({ type: BOARD_VIEW_TYPE, active: true });
    await workspace.revealLeaf(leaf);
  }
}

function reportError(error: unknown): void {
  console.error("[daily-kanban-todo]", error);
}
