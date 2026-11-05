import { settle } from "@tests/app/fakes/day-files";
import { describe, expect, it } from "vitest";
import { BoardWriter, type Editor } from "@/app/board/writer";
import type { EditOutcome } from "@/app/day-editor";
import type { TimerOp } from "@/domain/timer";

/** 受けた書き込みを並べておき、finish(outcome) で先頭から1つずつ終わらせる。guard は終わらせる時点で確かめる */
class FakeEditor implements Editor {
  readonly queued: { op: TimerOp; guard: () => boolean; finish: (o: EditOutcome) => void }[] = [];
  failNext = false;

  edit(_dayKey: string, op: TimerOp, guard: () => boolean = () => true): Promise<EditOutcome> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error("壊れた"));
    }
    return new Promise((resolve) => this.queued.push({ op, guard, finish: resolve }));
  }

  /** 先頭の書き込みを終わらせる。guard が false なら取りやめる */
  finish(outcome: EditOutcome): void {
    const head = this.queued.shift();
    head?.finish(head.guard() ? outcome : "skipped");
  }
}

const interrupt: TimerOp = { kind: "interrupt" };

function setUp() {
  const editor = new FakeEditor();
  const settled: number[] = [];
  const errors: unknown[] = [];
  const writer = new BoardWriter(
    editor,
    "2026-11-05",
    () => settled.push(settled.length),
    (e) => errors.push(e),
  );
  return { editor, writer, settled, errors };
}

describe("BoardWriter", () => {
  it("書き込めたら true、断られたら false で終わる", async () => {
    const { editor, writer } = setUp();
    const done = writer.write(interrupt);
    const refused = writer.write(interrupt);
    editor.finish("done");
    editor.finish("refused");
    expect([await done, await refused]).toEqual([true, false]);
  });

  it("書き込みが終わるまでは書き込み中で、終わるたびに知らせる", async () => {
    const { editor, writer, settled } = setUp();
    const first = writer.write(interrupt);
    const second = writer.write(interrupt);
    expect(writer.isWriting()).toBe(true);
    editor.finish("done");
    await first;
    expect([writer.isWriting(), settled.length]).toEqual([true, 1]);
    editor.finish("done");
    await second;
    expect([writer.isWriting(), settled.length]).toEqual([false, 2]);
  });

  it("断られたら、それより前に受けて並んでいる操作は書き込まずに捨てる", async () => {
    const { editor, writer } = setUp();
    const refused = writer.write(interrupt);
    const queued = writer.write(interrupt);
    editor.finish("refused");
    await refused;
    editor.finish("done");
    expect(await queued).toBe(false);
  });

  it("断られた後に受けた操作は書き込む", async () => {
    const { editor, writer } = setUp();
    const refused = writer.write(interrupt);
    editor.finish("refused");
    await refused;
    const later = writer.write(interrupt);
    editor.finish("done");
    expect(await later).toBe(true);
  });

  it("書き込みの例外は onError へ渡し、false で終わる", async () => {
    const { editor, writer, errors } = setUp();
    editor.failNext = true;
    expect(await writer.write(interrupt)).toBe(false);
    await settle();
    expect(errors).toHaveLength(1);
  });
});
