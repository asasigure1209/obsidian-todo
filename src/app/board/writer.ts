import type { DayEditor } from "@/app/day-editor";
import type { TimerOp } from "@/domain/timer";

/** 書き込みの並び。実体は DayEditor */
export type Editor = Pick<DayEditor, "edit">;

/**
 * 1日のボードからの書き込みを DayEditor の並びに乗せる（AD-3）。
 * 書き込みが断られたら、それより前に受けた操作は、断られた操作の先読みをもとにしているので書き込まずに捨てる
 */
export class BoardWriter {
  private pending = 0;
  /** 書き込みが断られるたびに進める。進む前に受けた操作は捨てる */
  private epoch = 0;

  constructor(
    private readonly editor: Editor,
    private readonly dayKey: string,
    /** 書き込みが終わるたびに呼ぶ */
    private readonly onSettled: () => void,
    private readonly onError: (error: unknown) => void,
  ) {}

  /** 書き込みが終わっていないものがある */
  isWriting(): boolean {
    return this.pending > 0;
  }

  /** 書き込めたら true */
  write(op: TimerOp): Promise<boolean> {
    const epoch = this.epoch;
    this.pending++;
    return this.editor
      .edit(this.dayKey, op, () => epoch === this.epoch)
      .then((outcome) => {
        this.settle(outcome === "refused");
        return outcome === "done";
      })
      .catch((error: unknown) => {
        this.onError(error);
        return false;
      });
  }

  private settle(refused: boolean): void {
    if (refused) {
      this.epoch++;
    }
    this.pending--;
    this.onSettled();
  }
}
