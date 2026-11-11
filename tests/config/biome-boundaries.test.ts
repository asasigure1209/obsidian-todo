import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Biome の overrides はルールの options を置き換える（足し合わせない）。
// 層ごとの override が共通の `../` 禁止を書き忘れると、その層だけ境界の検査が黙って外れるので、ここで守る。

interface RestrictedImports {
  options: { patterns: { group: string[] }[]; paths?: Record<string, string> };
}
interface Override {
  includes: string[];
  linter?: { rules?: { style?: { noRestrictedImports?: RestrictedImports } } };
}

const config = JSON.parse(readFileSync("biome.json", "utf8"));
const basePattern: { group: string[] } =
  config.linter.rules.style.noRestrictedImports.options.patterns[0];
const layerOverrides = (config.overrides as Override[]).filter((o) =>
  o.includes.some((glob) => glob.startsWith("src/")),
);

describe("biome.json の層の境界", () => {
  it.each(layerOverrides.map((o) => [o.includes.join(", "), o] as const))(
    "%s の override が共通の `../` 禁止を含む",
    (_name, override) => {
      const groups = override.linter?.rules?.style?.noRestrictedImports?.options.patterns.map(
        (p) => p.group,
      );
      expect(groups).toContainEqual(basePattern.group);
    },
  );

  it("src/ の各層に override がある", () => {
    const layers = readdirSync("src", { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `src/${entry.name}/**`);
    const covered = layerOverrides.flatMap((o) => o.includes);
    expect(covered).toEqual(expect.arrayContaining(layers));
  });

  it("ui/ で obsidian を使えるのは、Obsidian との境目の BoardView.ts と SettingsTab.ts だけ", () => {
    const uiFiles = readdirSync("src/ui").map((name) => `src/ui/${name}`);
    // 後の override ほど優先される（options を置き換える）ので、そのファイルに当たる最後の override で決まる
    const allowed = uiFiles.filter((file) => {
      const matching = layerOverrides.filter((o) =>
        o.includes.some((glob) => glob === file || glob === "src/ui/**"),
      );
      return !matching.at(-1)?.linter?.rules?.style?.noRestrictedImports?.options.paths?.obsidian;
    });
    expect(allowed.sort()).toEqual(["src/ui/BoardView.ts", "src/ui/SettingsTab.ts"]);
  });
});
