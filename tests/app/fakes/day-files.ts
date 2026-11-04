import type { DayFiles } from "@/domain/day-files";

/**
 * メモリ上の DayFiles。write / remove で変更を知らせる。
 * hold() の後は読み込みが止まり、release(n) で n 番目の読み込みを好きな順番で終わらせられる
 */
export class FakeDayFiles implements DayFiles {
  private readonly bodies = new Map<string, string>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private holding = false;
  private readonly held: Array<() => void> = [];
  failNextRead = false;

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

  onChange(dayKey: string, listener: () => void): () => void {
    const set = this.listeners.get(dayKey) ?? new Set();
    set.add(listener);
    this.listeners.set(dayKey, set);
    return () => set.delete(listener);
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

  private notify(dayKey: string): void {
    for (const listener of this.listeners.get(dayKey) ?? []) {
      listener();
    }
  }
}
