import { Plugin } from "obsidian";
import { systemClock } from "@/adapters/clock";
import { expiryAlarm, noticeNotifier } from "@/adapters/notifier";
import { PluginData } from "@/adapters/plugin-data";
import { PluginSettingsStore } from "@/adapters/settings-store";
import { PluginTimerStore } from "@/adapters/timer-store";
import { VaultDayFiles } from "@/adapters/vault";
import type { BoardDeps } from "@/app/board/session";
import { openDayEditor } from "@/app/day-editor";
import { openSettings } from "@/app/settings";
import { BOARD_ICON, BOARD_VIEW_TYPE, BoardView } from "@/ui/BoardView";
import { SettingsTab } from "@/ui/SettingsTab";

const OPEN_BOARD_LABEL = "今日のボードを開く";
/** 25分の満了を判定する間隔 */
const TICK_MS = 1000;

export default class DailyKanbanTodoPlugin extends Plugin {
  override async onload(): Promise<void> {
    // タイマーと設定は data.json を分け合うので、読み書きを1か所に並べる
    const data = new PluginData(this);
    const settings = await openSettings({
      store: new PluginSettingsStore(data),
      notifier: noticeNotifier,
      onError: reportError,
    });
    // フォルダと音の有無は使うたびに今の設定から読むので、設定を変えるとすぐに効く
    const files = new VaultDayFiles(this.app.vault, () => settings.current().folders.todo);
    // タイマーはボードを閉じていても進め、満了で記録して知らせる。起動直後の判定でスリープ中の満了も確定する（design 8.1）
    const editor = await openDayEditor({
      files,
      store: new PluginTimerStore(data),
      clock: systemClock,
      notifier: noticeNotifier,
      alarm: expiryAlarm(() => settings.current().sound),
      onError: reportError,
    });
    this.register(() => editor.close());
    // TODO のフォルダを変えたら、開いているボードと保留中のタイマーに、ファイルの変更として知らせる
    this.register(
      settings.watch(
        (s) => s.folders.todo,
        () => files.folderChanged(),
      ),
    );
    // Vault の準備ができてから判定を始める。起動直後にその日のファイルがまだ「ない」と判定しないため
    this.app.workspace.onLayoutReady(() => {
      editor.tick();
      this.registerInterval(window.setInterval(() => editor.tick(), TICK_MS));
    });
    const deps: BoardDeps = {
      files,
      clock: systemClock,
      notifier: noticeNotifier,
      editor,
      onError: reportError,
    };
    this.registerView(BOARD_VIEW_TYPE, (leaf) => new BoardView(leaf, deps, settings));
    this.addSettingTab(new SettingsTab(this.app, this, settings));
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
