import type { DayFiles } from "@/domain/day-files";

/**
 * メモリ上の DayFiles。write / remove で変更を知らせる。
 * - hold() の後は読み込みが止まり、release(n) で n 番目の読み込みを好きな順番で終わらせられる
 * - holdWrites() の後は書き込みが止まり、releaseWrite() で始まった順に1つずつ終わらせられる
 */
export class FakeDayFiles implements DayFiles {
  private readonly bodies = new Map<string, string>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private holding = false;
  private readonly held: Array<() => void> = [];
  private holdingWrites = false;
  private readonly heldWrites: Array<() => void> = [];
  failNextRead = false;
  failNextWrite = false;
  /** 始まった書き込みの数 */
  startedWrites = 0;

  read(dayKey: string): Promise<string | undefined> {
    if (this.failNextRead) {
      this.failNextRead = false;
      return Promise.reject(new Error("読めない"));
    }
    const body = this.bodies.get(dayKey);
    if (!this.holding) {
      return Promise.resolve(body);
    }
    return new Promise((resolve) => this.held.push(() => resolve(body)));
  }

  /** vault.process と同じく、変換は書き込む時点の最新の本文に当てる。本文が変わらなければ変更を知らせない */
  async process(dayKey: string, transform: (body: string) => string): Promise<boolean> {
    this.startedWrites++;
    if (this.holdingWrites) {
      await new Promise<void>((resolve) => this.heldWrites.push(resolve));
    }
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error("書けない");
    }
    const body = this.bodies.get(dayKey);
    if (body === undefined) {
      return false;
    }
    const next = transform(body);
    if (next !== body) {
      this.write(dayKey, next);
    }
    return true;
  }

  onChange(dayKey: string, listener: () => void): () => void {
    const set = this.listeners.get(dayKey) ?? new Set();
    set.add(listener);
    this.listeners.set(dayKey, set);
    return () => set.delete(listener);
  }

  body(dayKey: string): string | undefined {
    return this.bodies.get(dayKey);
  }

  write(dayKey: string, body: string): void {
    this.bodies.set(dayKey, body);
    this.notify(dayKey);
  }

  remove(dayKey: string): void {
    this.bodies.delete(dayKey);
    this.notify(dayKey);
  }

  listenerCount(dayKey: string): number {
    return this.listeners.get(dayKey)?.size ?? 0;
  }

  hold(): void {
    this.holding = true;
  }

  release(n: number): void {
    this.held[n]?.();
  }

  holdWrites(): void {
    this.holdingWrites = true;
  }

  releaseWrite(): void {
    this.heldWrites.shift()?.();
  }

  private notify(dayKey: string): void {
    for (const listener of this.listeners.get(dayKey) ?? []) {
      listener();
    }
  }
}
