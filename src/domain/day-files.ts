/** その日のファイルの取得元。実体は adapters/vault.ts が持つ（AD-1） */
export interface DayFiles {
  /** 本文。ファイルがなければ undefined */
  read(dayKey: string): Promise<string | undefined>;
  /** その日のファイルの作成・変更・削除・名前の変更を知らせる。戻り値で購読をやめる */
  onChange(dayKey: string, listener: () => void): () => void;
}
