import type { DayFiles } from "@/domain/day-files";

/** 読めた本文（ファイルがなければ undefined）。読めなかったときは全体が undefined */
export type ReadResult = { body: string | undefined } | undefined;

/**
 * 1日のファイルを読み直す（AD-2）。読み込みは追い越されることがあるので、最後に始めた読み込みの結果だけを渡す。
 * 古くなっている間（書き込み中・閉じた後）に終わった読み込みは捨てる
 */
export class LatestReader {
  private latest = 0;

  constructor(
    private readonly files: DayFiles,
    private readonly dayKey: string,
    private readonly isStale: () => boolean,
    private readonly onRead: (read: ReadResult) => void,
    /** 受け取る側で起きた例外の行き先 */
    private readonly onError: (error: unknown) => void,
  ) {}

  reload(): void {
    this.load().catch(this.onError);
  }

  private async load(): Promise<void> {
    const current = ++this.latest;
    const read = await tryRead(this.files, this.dayKey);
    if (!(current !== this.latest || this.isStale())) {
      this.onRead(read);
    }
  }
}

async function tryRead(files: DayFiles, dayKey: string): Promise<ReadResult> {
  try {
    return { body: await files.read(dayKey) };
  } catch {
    return undefined;
  }
}
