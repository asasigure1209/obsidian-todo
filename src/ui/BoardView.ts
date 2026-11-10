import { type App, ItemView, Modal, type WorkspaceLeaf } from "obsidian";
import { type Component, mount, unmount } from "svelte";
import { type BoardDeps, type BoardSession, openBoard } from "@/app/board/session";
import type { Card } from "@/domain/board";
import { toDayKey } from "@/domain/day";
import { DEFAULT_WORKDAY } from "@/domain/schedule";
import AddTodoDialog from "./AddTodoDialog.svelte";
import Board from "./Board.svelte";
import WorkDialog from "./WorkDialog.svelte";

export const BOARD_VIEW_TYPE = "daily-kanban-todo-board";
export const BOARD_ICON = "square-kanban";

export class BoardView extends ItemView {
  private board: ReturnType<typeof mount> | undefined;
  private session: BoardSession | undefined;
  private dayKey: string | undefined;
  /** 開いている M2・M4 のダイアログ。ボードを閉じたり作り直したりするときに一緒に閉じる（閉じた session に書き込ませない） */
  private modal: Modal | undefined;

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
        session,
        openWork: (card: Card) =>
          this.openModal(
            new SvelteModal(this.app, WorkDialog, "daily-kanban-todo-work-modal", {
              session,
              card,
            }),
          ),
        // 設定画面ができたら、ここを設定の値に替える（design 8.2）
        workday: DEFAULT_WORKDAY,
        now: () => this.deps.clock.now(),
        openAdd: () =>
          this.openModal(
            new SvelteModal(this.app, AddTodoDialog, "daily-kanban-todo-add-modal", { session }),
          ),
      },
    });
  }

  private openModal(modal: Modal): void {
    this.modal?.close();
    this.modal = modal;
    modal.open();
  }

  private async unmountBoard(): Promise<void> {
    this.modal?.close();
    this.modal = undefined;
    this.session?.close();
    this.session = undefined;
    if (this.board) {
      await unmount(this.board);
      this.board = undefined;
    }
  }
}

/**
 * M2・M4 のダイアログ。Obsidian のダイアログの中に Svelte のダイアログを置き、閉じる関数を渡す。
 * 見出しはモックどおりにダイアログの中で出し、閉じるボタン（×）は Obsidian のものを使う
 */
class SvelteModal<P extends Record<string, unknown>> extends Modal {
  private dialog: ReturnType<typeof mount> | undefined;

  constructor(
    app: App,
    private readonly component: Component<P & { close: () => void }>,
    /** ダイアログの幅をモックに合わせる印。各ダイアログの CSS が使う */
    private readonly className: string,
    private readonly props: P,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.modalEl.addClass(this.className);
    this.dialog = mount(this.component, {
      target: this.contentEl,
      props: { ...this.props, close: () => this.close() },
    });
  }

  override onClose(): void {
    if (this.dialog) {
      void unmount(this.dialog);
      this.dialog = undefined;
    }
  }
}
