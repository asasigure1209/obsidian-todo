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
pnpm typecheck                               # svelte-check（.ts も含めて型を検査）
pnpm test                                    # Vitest
pnpm vitest run tests/domain/minutes.test.ts # 1ファイルだけ
pnpm vitest run -t "分未満を切り捨てる"        # テスト名で絞る
pnpm coverage                                # src/domain/ に 90% の下限
pnpm mutation                                # Stryker（src/domain/、下限 80%、CI では回さない）
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

`src/` は `domain/`（純粋な TS）・`app/`・`adapters/`・`ui/`（Svelte と `BoardView.ts`）と、組み立て役の `main.ts`。許される import は `docs/architecture.md` の AD-10 の表のとおりで、`biome.json` の `overrides` に層ごとの `noRestrictedImports` として書かれている。Biome は override でルールの options を置き換えるため、各層の override は共通の `../` 禁止を毎回含む必要がある。`tests/config/biome-boundaries.test.ts` がこれと「`src/` の各層に override があること」を検査する。

- 層をまたぐ import は必ず `@/層名/...` で書く。`../` は禁止（相対パスだと境界の検査をすり抜ける）。同じフォルダ内は `./`
- `domain/` は `obsidian` も `svelte` も import しない。現在時刻なども引数か、`domain/` に置いた型（例：`domain/clock.ts` の `Clock`）経由で受け取る
- 「`domain/` からは型だけ import してよい」は Biome で区別できないので、手で守る

## テスト駆動開発（TDD）

`docs/test-strategy.md` に従い、TDD のサイクルは Claude が自律で回す（本人はコミットや PR でテストを読む）。

- 機能に取りかかる前に、確かめる振る舞いを `it.todo("…")` でテストファイルに並べる（これが TODO リスト）
- Red：1つ選んで失敗するテストにし、対象だけ実行して**想定どおりの理由で**落ちることを確かめる。失敗するテストなしにプロダクトコードを書かない
- Green：仮実装 → 三角測量 → 明白な実装で、歩幅を調整して通す
- Refactor：通ったまま整え、認知複雑度 5 以内に収める。コミットは `pnpm verify` が通った時点
- テストは `tests/<層>/` に置き、名前は design.md の言葉で日本語にする。モックライブラリは使わず、`domain/` の型を実装した手書きの偽物を使う
- 読み書き・コマンド・複製では fast-check で性質（読んで戻すと元と一致、固定行が失われない など）も確かめる。機能を書き終えたら `pnpm mutation` で生き残った変異を確認する
- 仕様の解釈に迷ったら design.md を確かめ、決まっていなければ本人に聞く

## 品質ルールで気をつけること

- **認知複雑度の上限は 5**（テストは対象外）。分岐を重ねず、遷移表などのデータと小さな関数に分けて書く
- Biome は Markdown を対象外にしている（日本語の表が崩れるため）
- TypeScript は 6 系に固定（svelte-check が 7 系に未対応）

## 開発用 Vault

`dev-vault/` を Obsidian で Vault として開いて動作確認する。`dev-vault/.obsidian/plugins/daily-kanban-todo` は `build/` へのシンボリックリンク。`pnpm dev` が `build/.hotreload` を作るので、Hot Reload プラグインを入れればビルドのたびに再読み込みされる。`dev-vault/TODO/` のサンプルは書式外の行・字下げしたメモ・`events` を含む。
