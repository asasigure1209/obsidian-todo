import { settle } from "@tests/app/fakes/day-files";
import { TODAY } from "@tests/app/fakes/timer";
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
  const errors: unknown[] = [];
  /** 知らせを受けた時点で、まだ書き込み中だったか */
  const settled: boolean[] = [];
  const writer: BoardWriter = new BoardWriter(
    editor,
    TODAY,
    () => settled.push(writer.isWriting()),
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

  it("すべての書き込みが終わるまでは書き込み中", async () => {
    const { editor, writer } = setUp();
    const first = writer.write(interrupt);
    const second = writer.write(interrupt);
    expect(writer.isWriting()).toBe(true);
    editor.finish("done");
    await first;
    expect(writer.isWriting()).toBe(true);
    editor.finish("done");
    await second;
    expect(writer.isWriting()).toBe(false);
  });

  it("書き込みが終わるたびに、書き込み中でなくなったのと同時に知らせる", async () => {
    const { editor, writer, settled } = setUp();
    const first = writer.write(interrupt);
    const second = writer.write(interrupt);
    editor.finish("done");
    editor.finish("refused");
    // 知らせが先に届いてから、結果が返る
    const results = Promise.all([first, second]).then(() => [...settled]);
    expect(await results).toEqual([true, false]);
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

  it("書き込みの例外で終わっても、書き込み中でなくなり、終わったことを知らせる", async () => {
    const { editor, writer, settled } = setUp();
    editor.failNext = true;

    await writer.write(interrupt);

    expect(writer.isWriting()).toBe(false);
    expect(settled).toEqual([false]);
  });

  it("書き込みの例外は onError へ渡し、false で終わる", async () => {
    const { editor, writer, errors } = setUp();
    editor.failNext = true;
    expect(await writer.write(interrupt)).toBe(false);
    await settle();
    expect(errors).toHaveLength(1);
  });
});
