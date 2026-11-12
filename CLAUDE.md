# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Obsidian プラグイン。1日単位のカンバン型TODOボード＋ポモドーロ（25分）で作業時間を記録。個人用、PC のみ。

## ドキュメント

- `docs/design.md` — 仕様の正。実装方法は書かない。仕様変更時は理由と 10章「検討の経緯」も更新
- `docs/architecture.md` — 実装の決定（AD-1〜AD-12）
- `docs/test-strategy.md` — TDD・テストサイズ・観点

## コマンド

```bash
pnpm dev                       # 監視ビルド → build/
pnpm check / pnpm fix          # Biome
pnpm typecheck                 # svelte-check
pnpm test                      # Vitest
pnpm vitest run <file> -t "<name>"
pnpm coverage                  # src/domain/ 90% 下限
pnpm mutation                  # Stryker（src/domain/、80% 下限、CI 外）
pnpm verify                    # CI と同じ全項目
```

## アーキテクチャ

- Markdown（`TODO/YYYY-MM-DD.md`）が唯一の正。変更イベントごとに読み直して描画、書き込みは `vault.process`
- 本文は frontmatter／TODO ブロック（TODO 行＋深く字下げされた後続行）／固定行。読んで戻すと完全一致。移動はブロック単位
- ID は持たない。位置＋行文字列で特定し、不一致なら何もしない
- タイマー状態（日付・開始時刻・行文字列）はプラグインの保存領域。Markdown には確定した分数のみ
- その日のファイルと `events` は Claude が書く。プラグインは Google に接続しない

## 層の境界（Biome `noRestrictedImports` で強制）

- 層は `domain/` `app/` `adapters/` `ui/`、組み立ては `main.ts`。許可表は AD-10
- 層をまたぐ import は `@/層名/...`。`../` 禁止
- `domain/` は `obsidian`・`svelte` 禁止。`obsidian` は `ui/` では `BoardView.ts` と `SettingsTab.ts` のみ
- override は options を置き換えるため、各層に共通の `../` 禁止を必ず含める（`tests/config/biome-boundaries.test.ts` が検査）
- 「型のみ import 可」は Biome で区別できないので手で守る

## TDD

サイクルは Claude が自律で回す。

- 着手前に `it.todo` で TODO リストを書く
- Red は対象のみ実行し、想定どおりの理由で落ちることを確認
- テストは `tests/<層>/`（`src/` と同じディレクトリ構成）。ほかのディレクトリのテストの部品は `@tests/...` で import。名前は design.md の用語で日本語。モックライブラリは使わず手書きの偽物
- 読み書き・コマンド・複製は fast-check で性質も確認。機能完了後に `pnpm mutation`
- コミットは `pnpm verify` が通った時点
- 仕様が design.md で決まらなければ本人に聞く

## 注意

- 認知複雑度の上限は 5（テスト除く）
- Biome は Markdown 対象外
- TypeScript は 6 系固定（svelte-check が 7 未対応）
- 依存の更新は Dependabot（AD-12）。`bundled` と major の PR は `dev-vault/` で確かめてから手でマージ
- 動作確認は `dev-vault/`（`plugins/daily-kanban-todo` → `build/` のシンボリックリンク）
