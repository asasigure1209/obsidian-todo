import { ItemView, type WorkspaceLeaf } from "obsidian";
import { mount, unmount } from "svelte";
import { type BoardDeps, type BoardSession, openBoard } from "@/app/board-service";
import { toDayKey } from "@/domain/day";
import Board from "./Board.svelte";

export const BOARD_VIEW_TYPE = "daily-kanban-todo-board";
export const BOARD_ICON = "square-kanban";

export class BoardView extends ItemView {
  private board: ReturnType<typeof mount> | undefined;
  private session: BoardSession | undefined;
  private dayKey: string | undefined;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly deps: BoardDeps,
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
    this.mountBoard();
  }

  override async onClose(): Promise<void> {
    await this.unmountBoard();
  }

  /** ボードを開き直したとき、表示している日が今日でなければ今日に切り替える */
  async showToday(): Promise<void> {
    if (this.dayKey !== toDayKey(this.deps.clock.now())) {
      await this.unmountBoard();
      this.mountBoard();
    }
  }

  private mountBoard(): void {
    const dayKey = toDayKey(this.deps.clock.now());
    const session = openBoard(this.deps, dayKey);
    this.dayKey = dayKey;
    this.session = session;
    this.board = mount(Board, {
      target: this.contentEl,
      props: {
        dayKey,
        boardState: session,
        onMove: (card, status, position) => {
          void session.move(card, status, position);
        },
      },
    });
  }

  private async unmountBoard(): Promise<void> {
    this.session?.close();
    this.session = undefined;
    if (this.board) {
      await unmount(this.board);
      this.board = undefined;
    }
  }
}
