/** Svelte のストアの約束と同じ形。subscribe はすぐに今の値を渡し、戻り値で購読をやめる */
export interface Readable<T> {
  subscribe(run: (value: T) => void): () => void;
}

/** 今の値を持ち、流すたびに受け取り手へ渡す。1つの受け取り手の例外で、ほかの受け取り手を止めない */
export class Store<T> implements Readable<T> {
  private readonly runs = new Set<(value: T) => void>();

  constructor(
    private value: T,
    private readonly onError: (error: unknown) => void,
  ) {}

  subscribe(run: (value: T) => void): () => void {
    this.runs.add(run);
    run(this.value);
    return () => this.runs.delete(run);
  }

  emit(value: T): void {
    this.value = value;
    for (const run of this.runs) {
      try {
        run(value);
      } catch (error) {
        this.onError(error);
      }
    }
  }
}
