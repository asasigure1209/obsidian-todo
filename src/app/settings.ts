import { SETTINGS_SAVE_FAILED_MESSAGE } from "@/app/messages";
import { type Readable, Store } from "@/app/store";
import type { Notifier } from "@/domain/notifier";
import { parseSettings, type Settings } from "@/domain/settings";
import type { SettingsStore } from "@/domain/settings-store";

export interface SettingsDeps {
  store: SettingsStore;
  notifier: Notifier;
  /** 読み込みや保存の失敗など、例外の行き先 */
  onError: (error: unknown) => void;
}

/** 保存した設定を読んで開く。読めなければ既定値で開く（設定が読めないだけで、ボードとタイマーを止めない） */
export async function openSettings(deps: SettingsDeps): Promise<AppSettings> {
  const stored = await deps.store.load().catch((error: unknown) => {
    deps.onError(error);
    return undefined;
  });
  return new AppSettings(deps, parseSettings(stored));
}

/**
 * プラグインの設定の窓口。プラグインに1つ。
 * 変えた設定はすぐに受け取り手（開いているボード）へ流し、その後に保存する。
 * ファイルのフォルダや音の有無のように、使う時点で読むものは current() から読む
 */
export class AppSettings implements Readable<Settings> {
  private readonly store: Store<Settings>;

  constructor(
    private readonly deps: SettingsDeps,
    value: Settings,
  ) {
    this.store = new Store(value, deps.onError);
  }

  current(): Settings {
    return this.store.current();
  }

  subscribe(run: (value: Settings) => void): () => void {
    return this.store.subscribe(run);
  }

  /** select で選んだ部分が変わったときだけ run を呼ぶ。見始めたときは呼ばない。戻り値で見るのをやめる */
  watch(select: (settings: Settings) => unknown, run: (settings: Settings) => void): () => void {
    let last = sameKey(select(this.current()));
    return this.store.subscribe((settings) => {
      const key = sameKey(select(settings));
      if (key !== last) {
        last = key;
        run(settings);
      }
    });
  }

  /**
   * 設定画面が確かめた値だけを渡す。保存の順番は保存先が守る（adapters/plugin-data.ts）。
   * 保存できなくても、変えた設定はこのまま使う（入力し直すと、もう一度保存する）。
   * 変わらなければ、流しも保存もしない（「TODO/」と「TODO」のように、読むと同じ入力）
   */
  async update(change: (current: Settings) => Settings): Promise<void> {
    const next = change(this.current());
    if (sameKey(next) === sameKey(this.current())) {
      return;
    }
    this.store.emit(next);
    try {
      await this.deps.store.save(next);
    } catch (error) {
      this.deps.onError(error);
      this.deps.notifier.notify(SETTINGS_SAVE_FAILED_MESSAGE);
    }
  }
}

/** 値の比べ方。設定は JSON にできる値だけなので、JSON の文字列で比べる */
function sameKey(value: unknown): string {
  return JSON.stringify(value);
}
