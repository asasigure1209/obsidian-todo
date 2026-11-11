import { describe, expect, it } from "vitest";
import { SETTINGS_SAVE_FAILED_MESSAGE } from "@/app/messages";
import { openSettings } from "@/app/settings";
import { DEFAULT_SETTINGS, type Settings } from "@/domain/settings";
import { FakeSettingsStore } from "./fakes/settings";

/** 既定値と違う設定 */
const saved: Settings = {
  ...DEFAULT_SETTINGS,
  folders: { ...DEFAULT_SETTINGS.folders, todo: "仕事/TODO" },
  sound: false,
};

/** 偽物の保存先で開く。知らせと例外を記録する */
async function setup(store = new FakeSettingsStore(saved)) {
  const notices: string[] = [];
  const errors: unknown[] = [];
  const settings = await openSettings({
    store,
    notifier: { notify: (message) => notices.push(message) },
    onError: (error) => errors.push(error),
  });
  return { settings, store, notices, errors };
}

describe("openSettings（設定を開く）", () => {
  it("保存した設定を読んで開く", async () => {
    const { settings } = await setup();

    expect(settings.current()).toEqual(saved);
  });

  it("保存した値が崩れていれば、その項目だけ既定値で開く", async () => {
    const { settings } = await setup(new FakeSettingsStore({ ...saved, sound: "off" }));

    expect(settings.current()).toEqual({ ...saved, sound: true });
  });

  it("保存領域を読めなければ、既定値で開いて例外を渡す", async () => {
    const store = new FakeSettingsStore(saved);
    store.failNextLoad = true;

    const { settings, errors } = await setup(store);

    expect(settings.current()).toEqual(DEFAULT_SETTINGS);
    expect(errors).toHaveLength(1);
  });
});

describe("AppSettings.update（設定を変える）", () => {
  it("変えた設定をすぐに受け取り手へ流し、今の設定にする", async () => {
    const { settings } = await setup();
    const received: Settings[] = [];
    settings.subscribe((value) => received.push(value));

    void settings.update((current) => ({ ...current, sound: true }));

    expect(settings.current()).toEqual({ ...saved, sound: true });
    expect(received).toEqual([saved, { ...saved, sound: true }]);
  });

  it("変えた設定を保存する", async () => {
    const { settings, store } = await setup();

    await settings.update((current) => ({ ...current, sound: true }));
    await settings.update((current) => ({
      ...current,
      workday: { ...current.workday, breaks: [] },
    }));

    expect(store.saved).toEqual([
      { ...saved, sound: true },
      { ...saved, sound: true, workday: { ...saved.workday, breaks: [] } },
    ]);
  });

  it("変わらなければ、受け取り手へ流さず、保存もしない", async () => {
    const { settings, store } = await setup();
    let received = 0;
    settings.subscribe(() => {
      received++;
    });

    await settings.update((s) => ({ ...s, folders: { ...s.folders } }));

    expect(received).toBe(1);
    expect(store.saved).toEqual([]);
  });

  it("watch は、選んだ部分が変わったときだけ呼ぶ。見始めたときは呼ばない", async () => {
    const { settings } = await setup();
    const folders: string[] = [];
    settings.watch(
      (s) => s.folders.todo,
      (s) => folders.push(s.folders.todo),
    );

    await settings.update((s) => ({ ...s, sound: !s.sound }));
    await settings.update((s) => ({ ...s, folders: { ...s.folders, todo: "別/TODO" } }));

    expect(folders).toEqual(["別/TODO"]);
  });

  it("保存できなければ知らせて例外を渡す。変えた設定は使い続ける", async () => {
    const { settings, store, notices, errors } = await setup();
    store.failNextSave = true;

    await settings.update((current) => ({ ...current, sound: true }));

    expect(notices).toEqual([SETTINGS_SAVE_FAILED_MESSAGE]);
    expect(errors).toHaveLength(1);
    expect(settings.current()).toEqual({ ...saved, sound: true });
  });
});
