import { watch } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import esbuild from "esbuild";
import esbuildSvelte from "esbuild-svelte";

const production = process.argv[2] === "production";
const outdir = "build";

await mkdir(outdir, { recursive: true });
await copyFile("manifest.json", `${outdir}/manifest.json`);
// Obsidian はプラグインのフォルダの styles.css を読み込む（設定画面の問題の表示に使う）
await copyFile("styles.css", `${outdir}/styles.css`);
if (!production) {
  // Hot Reload プラグインは、このファイルがあるプラグインを監視して再読み込みする
  await writeFile(`${outdir}/.hotreload`, "");
}

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  outfile: `${outdir}/main.js`,
  bundle: true,
  format: "cjs",
  target: "es2022",
  external: [
    "obsidian",
    "electron",
    "@codemirror/*",
    "@lezer/*",
    ...builtinModules,
    ...builtinModules.map((name) => `node:${name}`),
  ],
  conditions: ["svelte", "browser"],
  mainFields: ["svelte", "browser", "module", "main"],
  plugins: [esbuildSvelte({ compilerOptions: { css: "injected" } })],
  sourcemap: production ? false : "inline",
  minify: production,
  logLevel: "info",
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
  // styles.css は esbuild の入力ではないので、変わるたびに自分で写す
  watch("styles.css", () => {
    copyFile("styles.css", `${outdir}/styles.css`).catch((error) => console.error(error));
  });
}
