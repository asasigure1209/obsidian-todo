import { describe, expect, it } from "vitest";
import { type BoardState, watchBoard } from "@/app/board-service";
import { FakeDayFiles } from "./fakes/day-files";

const today = "2026-11-04";

/** 受け取った状態を、比べやすい形で並べる */
const summary = (state: BoardState) =>
  state.kind === "board" ? state.board.todo.map((c) => c.name) : state.kind;

/** 購読して、受け取った状態を記録する */
function record(files: FakeDayFiles, dayKey = today) {
  const states: ReturnType<typeof summary>[] = [];
  const unsubscribe = watchBoard(files, dayKey).subscribe((state) => states.push(summary(state)));
  return { states, unsubscribe };
}

/** 待っている読み込みを終わらせる */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("watchBoard", () => {
  it("購読するとすぐに読み込み中を受け取る", () => {
    const { states } = record(new FakeDayFiles());

    expect(states).toEqual(["loading"]);
  });

  it("その日のファイルがあればボードを受け取る", async () => {
    const files = new FakeDayFiles();
    files.write(today, "- [ ] a\n- [x] b\n");

    const { states } = record(files);
    await settle();

    expect(states).toEqual(["loading", ["a"]]);
  });

  it("その日のファイルがなければ、ファイルなしを受け取る", async () => {
    const { states } = record(new FakeDayFiles());
    await settle();

    expect(states).toEqual(["loading", "missing"]);
  });

  it("ファイルが変わるたびに読み直して、新しいボードを受け取る", async () => {
    const files = new FakeDayFiles();
    files.write(today, "- [ ] a\n");
    const { states } = record(files);
    await settle();

    files.write(today, "- [ ] a\n- [ ] b\n");
    await settle();

    expect(states).toEqual(["loading", ["a"], ["a", "b"]]);
  });

  it("ファイルがあとから作られたらボードを受け取る。消されたらファイルなしに戻る", async () => {
    const files = new FakeDayFiles();
    const { states } = record(files);
    await settle();

    files.write(today, "- [ ] a\n");
    await settle();
    files.remove(today);
    await settle();

    expect(states).toEqual(["loading", "missing", ["a"], "missing"]);
  });

  it("ほかの日のファイルの変更では読み直さない", async () => {
    const files = new FakeDayFiles();
    files.write(today, "- [ ] a\n");
    const { states } = record(files);
    await settle();

    files.write("2026-11-03", "- [ ] 前の日\n");
    await settle();

    expect(states).toEqual(["loading", ["a"]]);
  });

  it("読み込みが追い越されても、最後の変更の内容だけを受け取る", async () => {
    const files = new FakeDayFiles();
    files.hold();
    const { states } = record(files);
    files.write(today, "- [ ] 古い\n");
    files.write(today, "- [ ] 新しい\n");

    files.release(2);
    await settle();
    files.release(1);
    files.release(0);
    await settle();

    expect(states).toEqual(["loading", ["新しい"]]);
  });

  it("読み込みに失敗しても、前の状態のまま次の変更を待つ", async () => {
    const files = new FakeDayFiles();
    files.write(today, "- [ ] a\n");
    const { states } = record(files);
    await settle();

    files.failNextRead = true;
    files.write(today, "- [ ] b\n");
    await settle();
    files.write(today, "- [ ] c\n");
    await settle();

    expect(states).toEqual(["loading", ["a"], ["c"]]);
  });

  it("購読をやめると、変更を受けず、変更の購読も外す", async () => {
    const files = new FakeDayFiles();
    files.write(today, "- [ ] a\n");
    const { states, unsubscribe } = record(files);
    await settle();

    unsubscribe();
    files.write(today, "- [ ] b\n");
    await settle();

    expect(states).toEqual(["loading", ["a"]]);
    expect(files.listenerCount(today)).toBe(0);
  });

  it("購読をやめた後に終わった読み込みは受け取らない", async () => {
    const files = new FakeDayFiles();
    files.write(today, "- [ ] a\n");
    files.hold();
    const { states, unsubscribe } = record(files);

    unsubscribe();
    files.release(0);
    await settle();

    expect(states).toEqual(["loading"]);
  });
});
