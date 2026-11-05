import { FakeDayFiles, settle } from "@tests/app/fakes/day-files";
import { describe, expect, it } from "vitest";
import { LatestReader, type ReadResult } from "@/app/board/reader";

const day = "2026-11-05";

function setUp(files: FakeDayFiles, stale = () => false) {
  const reads: ReadResult[] = [];
  const errors: unknown[] = [];
  const reader = new LatestReader(
    files,
    day,
    stale,
    (read) => reads.push(read),
    (e) => errors.push(e),
  );
  return { reader, reads, errors };
}

describe("LatestReader", () => {
  it("読めたら本文を渡し、ファイルがなければ本文なしを渡す", async () => {
    const files = new FakeDayFiles();
    const { reader, reads } = setUp(files);
    reader.reload();
    await settle();
    files.write(day, "- [ ] 議事録\n");
    reader.reload();
    await settle();
    expect(reads).toEqual([{ body: undefined }, { body: "- [ ] 議事録\n" }]);
  });

  it("読めなかったら、読めなかったことを渡す", async () => {
    const files = new FakeDayFiles();
    files.failNextRead = true;
    const { reader, reads } = setUp(files);
    reader.reload();
    await settle();
    expect(reads).toEqual([undefined]);
  });

  it("追い越されたら、最後に始めた読み込みの結果だけを渡す", async () => {
    const files = new FakeDayFiles();
    files.write(day, "- [ ] 議事録\n");
    files.hold();
    const { reader, reads } = setUp(files);
    reader.reload();
    reader.reload();
    files.release(1);
    files.release(0);
    await settle();
    expect(reads).toEqual([{ body: "- [ ] 議事録\n" }]);
  });

  it("古くなっている間に終わった読み込みは捨てる", async () => {
    let stale = true;
    const { reader, reads } = setUp(new FakeDayFiles(), () => stale);
    reader.reload();
    await settle();
    stale = false;
    reader.reload();
    await settle();
    expect(reads).toHaveLength(1);
  });

  it("受け取る側の例外は onError へ渡し、次の読み込みも渡す", async () => {
    const files = new FakeDayFiles();
    const errors: unknown[] = [];
    let calls = 0;
    const reader = new LatestReader(
      files,
      day,
      () => false,
      () => {
        calls++;
        throw new Error("解釈できない");
      },
      (e) => errors.push(e),
    );
    reader.reload();
    await settle();
    reader.reload();
    await settle();
    expect([calls, errors.length]).toEqual([2, 2]);
  });
});
