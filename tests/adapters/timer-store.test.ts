import type { Plugin } from "obsidian";
import { describe, expect, it } from "vitest";
import { PluginTimerStore } from "@/adapters/timer-store";
import type { RunningTimer } from "@/domain/timer";

const running = (): RunningTimer => ({
  dayKey: "2026-11-05",
  startedAt: new Date(2026, 10, 5, 9, 0).getTime(),
  text: "- [/] 提案資料 [est:: 3]",
  held: false,
});

/** 保存領域（data.json）の中身だけを持つ偽物 */
function storeWith(data: unknown): PluginTimerStore {
  const plugin = { loadData: async () => data, saveData: async () => {} };
  return new PluginTimerStore(plugin as unknown as Plugin);
}

describe("PluginTimerStore.load（保存領域から読んだ値）", () => {
  it("形の合う値をタイマーとして読む", async () => {
    expect(await storeWith({ timer: running() }).load()).toEqual(running());
  });

  it.each([
    undefined,
    null,
    "timer",
    {},
    { ...running(), startedAt: "9:00" },
    { ...running(), dayKey: 20261105 },
    { ...running(), text: undefined },
    { ...running(), held: "no" },
  ])("形の合わない値（%j）は停止中として読む", async (timer) => {
    expect(await storeWith({ timer }).load()).toBeUndefined();
  });

  it("保存領域が空なら停止中として読む", async () => {
    expect(await storeWith(null).load()).toBeUndefined();
  });

  it("余分な項目は読まない", async () => {
    expect(await storeWith({ timer: { ...running(), extra: 1 } }).load()).toEqual(running());
  });
});
