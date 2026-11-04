import { Plugin } from "obsidian";
import { systemClock } from "@/adapters/clock";
import { VaultDayFiles } from "@/adapters/vault";
import { BOARD_ICON, BOARD_VIEW_TYPE, BoardView } from "@/ui/BoardView";

const OPEN_BOARD_LABEL = "今日のボードを開く";
/** TODO ファイルのフォルダ。設定で変えられるようにするまでの既定値（design 7.1） */
const TODO_FOLDER = "TODO";

export default class DailyKanbanTodoPlugin extends Plugin {
  override async onload(): Promise<void> {
    const files = new VaultDayFiles(this.app.vault, TODO_FOLDER);
    this.registerView(BOARD_VIEW_TYPE, (leaf) => new BoardView(leaf, systemClock, files));
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
      await workspace.revealLeaf(existing);
      return;
    }
    const leaf = workspace.getLeaf("tab");
    await leaf.setViewState({ type: BOARD_VIEW_TYPE, active: true });
    await workspace.revealLeaf(leaf);
  }
}
