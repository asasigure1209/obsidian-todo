import { Plugin } from "obsidian";
import { systemClock } from "@/adapters/clock";
import { BOARD_VIEW_TYPE, BoardView } from "@/ui/BoardView";

export default class DailyKanbanTodoPlugin extends Plugin {
  override async onload(): Promise<void> {
    this.registerView(BOARD_VIEW_TYPE, (leaf) => new BoardView(leaf, systemClock));
    this.addRibbonIcon("square-kanban", "今日のボードを開く", () => this.activateView());
    this.addCommand({
      id: "open-board",
      name: "今日のボードを開く",
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
