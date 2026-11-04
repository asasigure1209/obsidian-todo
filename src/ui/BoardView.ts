import { ItemView } from "obsidian";
import { mount, unmount } from "svelte";
import type { Clock } from "@/domain/clock";
import { toDayKey } from "@/domain/day";
import Board from "./Board.svelte";

export const BOARD_VIEW_TYPE = "daily-kanban-todo-board";

export class BoardView extends ItemView {
  private board: ReturnType<typeof mount> | undefined;

  constructor(
    leaf: ConstructorParameters<typeof ItemView>[0],
    private readonly clock: Clock,
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
    return "square-kanban";
  }

  override async onOpen(): Promise<void> {
    this.board = mount(Board, {
      target: this.contentEl,
      props: { dayKey: toDayKey(this.clock.now()) },
    });
  }

  override async onClose(): Promise<void> {
    if (this.board) {
      await unmount(this.board);
    }
  }
}
