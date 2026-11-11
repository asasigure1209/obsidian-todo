import { type App, type Plugin, PluginSettingTab, Setting } from "obsidian";
import { FOLDER_EMPTY_MESSAGE, TIME_PROBLEM_MESSAGES } from "@/app/messages";
import type { AppSettings } from "@/app/settings";
import type { Workday } from "@/domain/schedule";
import {
  type Folders,
  type RangeDraft,
  readFolder,
  readWorkday,
  type TimeProblem,
  type WorkdayDraft,
  workdayDraft,
} from "@/domain/settings";

/** 時刻の欄。始まりと終わり、それぞれの入力例 */
const RANGE_FIELDS = [
  ["start", "9:00"],
  ["end", "18:00"],
] as const;

/** 欄の問題を出す・消す */
type ShowProblem = (message: string | undefined) => void;

const FOLDER_ROWS: ReadonlyArray<readonly [keyof Folders, string, string]> = [
  ["todo", "TODO のフォルダ", "その日の TODO ファイル（YYYY-MM-DD.md）を置くフォルダ"],
  ["workLog", "作業ログのフォルダ", "ヘッダーの「作業ログ」から開くファイルを置くフォルダ"],
  ["dailyReport", "日報のフォルダ", "終業の振り返りから開く日報を置くフォルダ"],
];

/**
 * 設定画面（design 7.7）。Obsidian の標準の見た目（Setting）で描く。
 * - 入力するたびに確かめて欄の下に問題を出し、打ち終えたとき（Enter や欄を離れたとき）に正しければ保存して効かせる。
 *   打つたびに効かせると、日本語入力の途中や打ちかけの値（「18:00」を直す途中の「1:00」など）でボードを描き直してしまう
 * - 正しくなければ保存しない。直すまでは前の値を使う
 * - 就業時間と休憩は組み合わせで確かめるので、入力の途中の値（draft）をここで持つ
 */
export class SettingsTab extends PluginSettingTab {
  private draft: WorkdayDraft = { hours: { start: "", end: "" }, breaks: [] };
  private hoursProblem: ShowProblem = () => {};
  private breakProblems: ShowProblem[] = [];

  constructor(
    app: App,
    plugin: Plugin,
    private readonly settings: AppSettings,
  ) {
    super(app, plugin);
  }

  /** 開くたびに、今の設定から描き直す（前に開いたときの、保存しなかった入力は捨てる） */
  override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    this.draft = workdayDraft(this.settings.current().workday);
    this.renderFolders(containerEl);
    this.renderHours(containerEl);
    new Setting(containerEl)
      .setName("休憩")
      .setDesc("集中できる時間から除く。就業時間の中で指定する")
      .setHeading();
    this.renderBreaks(containerEl.createDiv());
    this.renderSound(containerEl);
  }

  private renderFolders(el: HTMLElement): void {
    new Setting(el).setName("フォルダ").setHeading();
    for (const [key, name, desc] of FOLDER_ROWS) {
      const setting = new Setting(el).setName(name).setDesc(desc);
      const showProblem = problemLine(setting);
      setting.addText((text) => {
        text.setValue(this.settings.current().folders[key]);
        text.inputEl.addEventListener("change", () =>
          this.applyFolder(key, text.getValue(), showProblem),
        );
      });
    }
  }

  /** 空のフォルダ名は保存しない */
  private applyFolder(key: keyof Folders, value: string, showProblem: ShowProblem): void {
    const folder = readFolder(value);
    showProblem(folder === undefined ? FOLDER_EMPTY_MESSAGE : undefined);
    if (folder !== undefined) {
      void this.settings.update((s) => ({ ...s, folders: { ...s.folders, [key]: folder } }));
    }
  }

  private renderHours(el: HTMLElement): void {
    new Setting(el).setName("就業時間").setHeading();
    const setting = new Setting(el)
      .setName("始まりと終わり")
      .setDesc("タイムラインに描く範囲。集中できる時間もこの中で数える");
    this.hoursProblem = problemLine(setting);
    this.rangeInputs(setting, this.draft.hours);
  }

  /** 休憩の欄だけを描き直す（追加・削除のとき。ほかの欄の入力の途中の値を消さない） */
  private renderBreaks(el: HTMLElement): void {
    el.empty();
    this.breakProblems = this.draft.breaks.map((range, index) =>
      this.renderBreak(el, range, index),
    );
    new Setting(el).addButton((button) =>
      button
        .setButtonText("休憩を追加")
        .onClick(() => this.editBreaks(el, (breaks) => breaks.push({ start: "", end: "" }))),
    );
  }

  private renderBreak(el: HTMLElement, range: RangeDraft, index: number): ShowProblem {
    const setting = new Setting(el).setName(`休憩 ${index + 1}`);
    this.rangeInputs(setting, range);
    setting.addExtraButton((button) =>
      button
        .setIcon("trash")
        .setTooltip("この休憩を削除")
        .onClick(() => this.editBreaks(el, (breaks) => breaks.splice(index, 1))),
    );
    return problemLine(setting);
  }

  /** 休憩を足す・消すと、欄を描き直してすぐに効かせる */
  private editBreaks(el: HTMLElement, edit: (breaks: RangeDraft[]) => void): void {
    edit(this.draft.breaks);
    this.renderBreaks(el);
    this.applyWorkday();
  }

  private renderSound(el: HTMLElement): void {
    new Setting(el).setName("通知").setHeading();
    new Setting(el)
      .setName("満了の音")
      .setDesc("25分たったときに短い音を鳴らす。オフでも通知は出る")
      .addToggle((toggle) =>
        toggle.setValue(this.settings.current().sound).onChange((sound) => {
          void this.settings.update((s) => ({ ...s, sound }));
        }),
      );
  }

  /** 始まり〜終わりの2つの欄。入力は range（draft の中）に書き、就業時間と休憩をまとめて確かめる */
  private rangeInputs(setting: Setting, range: RangeDraft): void {
    for (const [key, placeholder] of RANGE_FIELDS) {
      if (key === "end") {
        setting.controlEl.createSpan({ text: "〜" });
      }
      setting.addText((text) => {
        text.setPlaceholder(placeholder).setValue(range[key]);
        text.onChange((value) => {
          range[key] = value;
          this.checkWorkday();
        });
        text.inputEl.addEventListener("change", () => this.applyWorkday());
      });
    }
  }

  /** 問題を欄ごとに出す。どこにも問題がなければ、読めた就業時間と休憩を返す */
  private checkWorkday(): Workday | undefined {
    const check = readWorkday(this.draft);
    this.hoursProblem(problemMessage(check.hours));
    for (const [index, show] of this.breakProblems.entries()) {
      show(problemMessage(check.breaks[index]));
    }
    return check.workday;
  }

  /** 問題を欄ごとに出し、どこにも問題がなければ保存する */
  private applyWorkday(): void {
    const workday = this.checkWorkday();
    if (workday) {
      void this.settings.update((s) => ({ ...s, workday }));
    }
  }
}

function problemMessage(problem: TimeProblem | undefined): string | undefined {
  return problem && TIME_PROBLEM_MESSAGES[problem];
}

/** 欄の説明の下に、問題を出す行を置く。問題がなければ隠す */
function problemLine(setting: Setting): ShowProblem {
  const line = setting.descEl.createDiv({ cls: "daily-kanban-todo-setting-problem" });
  line.hide();
  return (message) => {
    line.setText(message ?? "");
    line.toggle(message !== undefined);
  };
}
