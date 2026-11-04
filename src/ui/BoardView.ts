import { ItemView, type WorkspaceLeaf } from "obsidian";
import { mount, unmount } from "svelte";
import { watchBoard } from "@/app/board-service";
import type { Clock } from "@/domain/clock";
import { toDayKey } from "@/domain/day";
import type { DayFiles } from "@/domain/day-files";
import Board from "./Board.svelte";

export const BOARD_VIEW_TYPE = "daily-kanban-todo-board";
export const BOARD_ICON = "square-kanban";

export class BoardView extends ItemView {
  private board: ReturnType<typeof mount> | undefined;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly clock: Clock,
    private readonly files: DayFiles,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return BOARD_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "今日のボード";
  }

  override getIcon(): string {
    return BOARD_ICON;
  }

  /** 開いた時点の日付で固定する。開いたまま日付が変わっても切り替えない（architecture 6章） */
  override async onOpen(): Promise<void> {
    const dayKey = toDayKey(this.clock.now());
    this.board = mount(Board, {
      target: this.contentEl,
      props: { dayKey, boardState: watchBoard(this.files, dayKey) },
    });
  }

  override async onClose(): Promise<void> {
    if (this.board) {
      await unmount(this.board);
    }
  }
}
