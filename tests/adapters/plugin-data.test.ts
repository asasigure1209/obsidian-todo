import { describe, expect, it } from "vitest";
import { PluginData } from "@/adapters/plugin-data";
import { PluginSettingsStore } from "@/adapters/settings-store";
import { PluginTimerStore } from "@/adapters/timer-store";
import { DEFAULT_SETTINGS } from "@/domain/settings";
import type { RunningTimer } from "@/domain/timer";
import { FakePlugin } from "./fakes/plugin";

const running: RunningTimer = {
  dayKey: "2026-11-05",
  startedAt: new Date(2026, 10, 5, 9, 0).getTime(),
  text: "- [/] 提案資料 [est:: 3]",
  held: false,
};

describe("PluginData（プラグインの保存領域 data.json）", () => {
  it("書いた項目を読む", async () => {
    const data = new PluginData(new FakePlugin().asPlugin());

    await data.write("timer", running);

    expect(await data.read("timer")).toEqual(running);
  });

  it("項目を書いても、ほかの項目は消さない", async () => {
    const plugin = new FakePlugin({ settings: { sound: false }, other: 1 });

    await new PluginData(plugin.asPlugin()).write("timer", running);

    expect(plugin.data).toEqual({ settings: { sound: false }, other: 1, timer: running });
  });

  it("続けて書いた別の項目は、読み書きが重なってもどちらも残る", async () => {
    const plugin = new FakePlugin({});
    const data = new PluginData(plugin.asPlugin());

    await Promise.all([data.write("timer", running), data.write("settings", { sound: false })]);

    expect(plugin.data).toEqual({ timer: running, settings: { sound: false } });
  });

  it("同じ項目を続けて書くと、最後に書いた値が残る", async () => {
    const plugin = new FakePlugin({});
    const data = new PluginData(plugin.asPlugin());

    await Promise.all([data.write("settings", 1), data.write("settings", 2)]);

    expect(plugin.data).toEqual({ settings: 2 });
  });

  it.each([null, undefined, "data", 3, ["timer"]])(
    "保存領域が空やオブジェクトでなければ（%j）、項目のない値として扱う",
    async (stored) => {
      const plugin = new FakePlugin(stored);
      const data = new PluginData(plugin.asPlugin());

      expect(await data.read("timer")).toBeUndefined();
      await data.write("timer", null);
      expect(plugin.data).toEqual({ timer: null });
    },
  );

  it("書き込みに失敗しても、次の書き込みはできる", async () => {
    const plugin = new FakePlugin({});
    plugin.failNextSave = true;
    const data = new PluginData(plugin.asPlugin());

    const failed = data.write("timer", running);
    const next = data.write("settings", { sound: false });

    await expect(failed).rejects.toThrow("保存できない");
    await next;
    expect(plugin.data).toEqual({ settings: { sound: false } });
  });
});

describe("PluginSettingsStore（設定の保存）", () => {
  it("保存領域の settings を、そのまま読む", async () => {
    const plugin = new FakePlugin({ settings: { sound: "off" } });

    expect(await new PluginSettingsStore(new PluginData(plugin.asPlugin())).load()).toEqual({
      sound: "off",
    });
  });

  it("settings に保存し、timer は消さない", async () => {
    const plugin = new FakePlugin({ timer: running });

    await new PluginSettingsStore(new PluginData(plugin.asPlugin())).save(DEFAULT_SETTINGS);

    expect(plugin.data).toEqual({ timer: running, settings: DEFAULT_SETTINGS });
  });

  it("タイマーと設定を同時に保存しても、どちらも残る", async () => {
    const plugin = new FakePlugin({});
    const data = new PluginData(plugin.asPlugin());

    await Promise.all([
      new PluginTimerStore(data).save(running),
      new PluginSettingsStore(data).save(DEFAULT_SETTINGS),
    ]);

    expect(plugin.data).toEqual({ timer: running, settings: DEFAULT_SETTINGS });
  });
});
