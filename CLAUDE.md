# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Obsidian プラグイン「Daily Kanban TODO」。1日単位のカンバン型TODOボードと、25分のポモドーロで作業時間を記録する。利用者は本人1名、PC のみ。

## ドキュメント

- `docs/design.md` — 要件と仕様の正。**実装方法は書かない**（本人の指示）。仕様を変えたら該当節の理由と 10章「検討の経緯」も更新する
- `docs/architecture.md` — 実装の決定（AD-1〜AD-10）、ディレクトリ構成、開発環境、テストの観点
- 仕様の細部（タイマーの遷移表 8.1、複製のルール 7.8、書式 7章）はコードより先にここを読む

## コマンド

```bash
pnpm dev                                     # build/ へ監視ビルド（dev-vault から読まれる）
pnpm build                                   # 本番ビルド
pnpm check                                   # Biome：整形・Lint・層の境界・循環参照
pnpm fix                                     # Biome の自動修正
pnpm typecheck                               # tsc --noEmit と svelte-check
pnpm test                                    # Vitest
pnpm vitest run tests/domain/minutes.test.ts # 1ファイルだけ
pnpm vitest run -t "分未満を切り捨てる"        # テスト名で絞る
pnpm coverage                                # src/domain/ に 90% の下限
pnpm verify                                  # CI と同じ全項目
```

コミット前に lefthook がステージしたファイルへ `biome check --write` をかける。CI（`.github/workflows/ci.yml`）は `biome ci`、型、カバレッジ、ビルドを実行する。

## アーキテクチャの要点

- **Markdown が唯一の正。** データは Vault の `TODO/YYYY-MM-DD.md`（1日1ファイル）。プラグインはメモリ上に正を持たず、ファイルの変更のたびに読み直して表示を作る。書き込みは `vault.process` で最新の本文に「本文 → 本文」の変換を当てる
- **書式外の行を壊さない。** 本文は「frontmatter／TODO ブロック（トップレベルの TODO 行＋それより深く字下げされた後続行すべて）／固定行」として読む。読んでそのまま書き戻すと元と完全に一致すること。並べ替えなどは TODO ブロック単位で動かす
- **ID は Markdown に書かない。** 対象は位置と行の文字列で特定し、一致しなければ何もしない
- **タイマー** の状態（日付・開始時刻・対象の行の文字列）はプラグインの保存領域に置き、Markdown には確定した分数だけを書く。対象はファイル内で唯一の `[/]` 行
- **その日のファイルと予定（frontmatter の `events`）は朝に Claude が書く。** プラグインは Google カレンダーに接続しない

## 層の境界（Biome が強制）

`src/` は `domain/`（純粋な TS）・`app/`・`adapters/`・`ui/`（Svelte と `BoardView.ts`）と、組み立て役の `main.ts`。許される import は `docs/architecture.md` の AD-10 の表のとおりで、`biome.json` の `overrides` に層ごとの `noRestrictedImports` として書かれている。

- 層をまたぐ import は必ず `@/層名/...` で書く。`../` は禁止（相対パスだと境界の検査をすり抜ける）。同じフォルダ内は `./`
- `domain/` は `obsidian` も `svelte` も import しない。現在時刻なども引数か、`domain/` に置いた型（例：`domain/clock.ts` の `Clock`）経由で受け取る
- 「`domain/` からは型だけ import してよい」は Biome で区別できないので、手で守る

## 品質ルールで気をつけること

- **認知複雑度の上限は 5**（テストは対象外）。分岐を重ねず、遷移表などのデータと小さな関数に分けて書く
- Biome は Markdown を対象外にしている（日本語の表が崩れるため）
- TypeScript は 6 系に固定（svelte-check が 7 系に未対応）

## 開発用 Vault

`dev-vault/` を Obsidian で Vault として開いて動作確認する。`dev-vault/.obsidian/plugins/daily-kanban-todo` は `build/` へのシンボリックリンク。`pnpm dev` が `build/.hotreload` を作るので、Hot Reload プラグインを入れればビルドのたびに再読み込みされる。`dev-vault/TODO/` のサンプルは書式外の行・字下げしたメモ・`events` を含む。
