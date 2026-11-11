import { type App, ItemView, Modal, type WorkspaceLeaf } from "obsidian";
import { type Component, mount, unmount } from "svelte";
import { type BoardDeps, type BoardSession, openBoard } from "@/app/board/session";
import { DAILY_REPORT_FAILED_MESSAGE, WORK_LOG_FAILED_MESSAGE } from "@/app/messages";
import type { AppSettings } from "@/app/settings";
import type { Card } from "@/domain/board";
import { boardTitle, canOpen, dayFilePath, toDayKey } from "@/domain/day";
import type { Folders } from "@/domain/settings";
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
    /** フォルダ（design 7.1）と就業時間・休憩（design 8.2）。ボードと作業ログのリンクが読む */
    private readonly settings: AppSettings,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return BOARD_VIEW_TYPE;
  }

  /** 今日は「今日のボード」、過去の日は「11月9日のボード」 */
  getDisplayText(): string {
    const today = this.today();
    return boardTitle(this.dayKey ?? today, today);
  }

  override getIcon(): string {
    return BOARD_ICON;
  }

  /** 開いた時点の日付で固定する。開いたまま日付が変わっても切り替えない（architecture 6章） */
  override async onOpen(): Promise<void> {
    this.showDay(this.today());
  }

  override async onClose(): Promise<void> {
    this.unmountBoard();
  }

  /** ボードを開き直したとき、表示している日が今日でなければ今日に切り替える */
  async showToday(): Promise<void> {
    this.showDay(this.today());
  }

  /**
   * その日のボードに切り替える。表示している日と同じ日や、未来の日（design 8.3）なら何もしない。
   * 閉じてから作るまでを同期で行うので、素早く押してもボードを2つ作らない
   */
  showDay(dayKey: string): void {
    if (dayKey === this.dayKey || !canOpen(dayKey, this.today())) {
      return;
    }
    this.unmountBoard();
    this.mountBoard(dayKey);
  }

  private today(): string {
    return toDayKey(this.deps.clock.now());
  }

  /** 作れたときだけ表示している日を持つ。作れなかったら、次の切り替えで作り直せる */
  private mountBoard(dayKey: string): void {
    const session = openBoard(this.deps, dayKey);
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
        // 就業時間と休憩はボードが設定から読む。変えてもボードを作り直さない（開いているダイアログも閉じない）。
        // TODO のフォルダの変更は VaultDayFiles がファイルの変更として知らせ、session が読み直す
        settings: this.settings,
        now: () => this.deps.clock.now(),
        // 日付をまたいで「今日」が変わったら、タブの見出し（今日のボード／M月D日のボード）を読み直させる
        onTodayChange: () => this.refreshTitle(),
        openAdd: () =>
          this.openModal(
            new SvelteModal(this.app, AddTodoDialog, "daily-kanban-todo-add-modal", { session }),
          ),
        showDay: (next: string) => this.showDay(next),
        openWorkLog: () => this.openDayNote("workLog", dayKey, WORK_LOG_FAILED_MESSAGE),
        // 日報には書き込まない。開くだけ（design 7.7）
        openDailyReport: () => this.openDayNote("dailyReport", dayKey, DAILY_REPORT_FAILED_MESSAGE),
      },
    });
    this.dayKey = dayKey;
    this.refreshTitle();
  }

  /**
   * その日の作業ログ・日報を開く。フォルダは開くときに今の設定から読む（AD-11）。
   * ファイルがなければ、ほかのリンクと同じく Obsidian が作る。開けなければ知らせる
   */
  private openDayNote(folder: keyof Folders, dayKey: string, failure: string): void {
    this.app.workspace
      .openLinkText(dayFilePath(this.settings.current().folders[folder], dayKey), "", false)
      .catch((error: unknown) => {
        this.deps.onError(error);
        this.deps.notifier.notify(failure);
      });
  }

  /** タブの見出しを読み直させる。updateHeader は公開の型にないので、ない版では何もしない */
  private refreshTitle(): void {
    (this.leaf as WorkspaceLeaf & { updateHeader?: () => void }).updateHeader?.();
  }

  private openModal(modal: Modal): void {
    this.modal?.close();
    this.modal = modal;
    modal.open();
  }

  /** トランジションを使わないので、unmount はその場で終わる（待たなくてよい） */
  private unmountBoard(): void {
    this.dayKey = undefined;
    this.modal?.close();
    this.modal = undefined;
    this.session?.close();
    this.session = undefined;
    if (this.board) {
      void unmount(this.board);
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
