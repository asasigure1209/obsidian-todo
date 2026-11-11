/** その日のファイルの取得元。実体は adapters/vault.ts が持つ（AD-1） */
export interface DayFiles {
  /** 本文。ファイルがなければ undefined */
  read(dayKey: string): Promise<string | undefined>;
  /** 最新の本文を変換して書き戻す（AD-3）。ファイルがなければ何もせず false */
  process(dayKey: string, transform: (body: string) => string): Promise<boolean>;
  /** TODO のフォルダの直下にあるファイルの名前（拡張子つき）。フォルダがなければ空 */
  list(): Promise<string[]>;
  /**
   * その日のファイルを本文つきで作る（「今日のファイルを作る」。design 7.8）。
   * もうあれば上書きせずに false。作れなければ例外
   */
  create(dayKey: string, body: string): Promise<boolean>;
  /** その日のファイルの作成・変更・削除・名前の変更を知らせる。戻り値で購読をやめる */
  onChange(dayKey: string, listener: () => void): () => void;
}
