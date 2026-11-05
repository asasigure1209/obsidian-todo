import { describe, expect, it } from "vitest";
import { type BoardSession, type BoardState, openBoard } from "@/app/board-service";
import type { LineRef } from "@/domain/commands";
import { FakeDayFiles } from "./fakes/day-files";

const today = "2026-11-05";
const yesterday = "2026-11-04";

/** 受け取った状態を、比べやすい形で並べる。ボードは列ごとのカード名 */
const summary = (state: BoardState) =>
  state.kind === "board"
    ? [state.board.todo, state.board.doing, state.board.done].map((cards) =>
        cards.map((c) => c.name).join(","),
      )
    : state.kind;

interface Opened {
  session: BoardSession;
  states: ReturnType<typeof summary>[];
  notices: string[];
  errors: unknown[];
}

/** その日のボードを開いて購読し、受け取った状態・通知・例外を記録する。時計は今日の 9:00 */
function open(files: FakeDayFiles, dayKey = today): Opened {
  const notices: string[] = [];
  const errors: unknown[] = [];
  const session = openBoard(
    {
      files,
      clock: { now: () => new Date(2026, 10, 5, 9, 0) },
      notifier: { notify: (message) => notices.push(message) },
      onError: (error) => errors.push(error),
    },
    dayKey,
  );
  const states: ReturnType<typeof summary>[] = [];
  session.subscribe((state) => states.push(summary(state)));
  return { session, states, notices, errors };
}

/** n 番目の TODO ブロックを、その行の文字列とともに指す */
const card = (index: number, text: string): LineRef => ({ index, text });

/** 待っている読み込みと書き込みを終わらせる */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("openBoard：読み直し", () => {
  it("購読するとすぐに読み込み中を受け取る", () => {
    const { states } = open(new FakeDayFiles());

    expect(states).toEqual(["loading"]);
  });

  it("その日のファイルがあればボードを受け取る", async () => {
    const files = new FakeDayFiles();
    files.write(today, "- [ ] a\n- [x] b\n");

    const { states } = open(files);
    await settle();

    expect(states).toEqual(["loading", ["a", "", "b"]]);
  });

  it("その日のファイルがなければ、ファイルなしを受け取る", async () => {
    const { states } = open(new FakeDayFiles());
    await settle();

    expect(states).toEqual(["loading", "missing"]);
  });

  it("ファイルが変わるたびに読み直して、新しいボードを受け取る", async () => {
    const files = new FakeDayFiles();
    files.write(today, "- [ ] a\n");
    const { states } = open(files);
    await settle();

    files.write(today, "- [ ] a\n- [ ] b\n");
    await settle();

    expect(states).toEqual(["loading", ["a", "", ""], ["a,b", "", ""]]);
  });

  it("ファイルがあとから作られたらボードを受け取る。消されたらファイルなしに戻る", async () => {
    const files = new FakeDayFiles();
    const { states } = open(files);
    await settle();

    files.write(today, "- [ ] a\n");
    await settle();
    files.remove(today);
    await settle();

    expect(states).toEqual(["loading", "missing", ["a", "", ""], "missing"]);
  });

  it("ほかの日のファイルの変更では読み直さない", async () => {
    const files = new FakeDayFiles();
    files.write(today, "- [ ] a\n");
    const { states } = open(files);
    await settle();

    files.write(yesterday, "- [ ] 前の日\n");
    await settle();

    expect(states).toEqual(["loading", ["a", "", ""]]);
  });

  it("読み込みが追い越されても、最後の変更の内容だけを受け取る", async () => {
    const files = new FakeDayFiles();
    files.hold();
    const { states } = open(files);
    files.write(today, "- [ ] 古い\n");
    files.write(today, "- [ ] 新しい\n");

    files.release(2);
    await settle();
    files.release(1);
    files.release(0);
    await settle();

    expect(states).toEqual(["loading", ["新しい", "", ""]]);
  });

  it("読み込みに失敗しても、前の状態のまま次の変更を待つ", async () => {
    const files = new FakeDayFiles();
    files.write(today, "- [ ] a\n");
    const { states } = open(files);
    await settle();

    files.failNextRead = true;
    files.write(today, "- [ ] b\n");
    await settle();
    files.write(today, "- [ ] c\n");
    await settle();

    expect(states).toEqual(["loading", ["a", "", ""], ["c", "", ""]]);
  });

  it("最初の読み込みに失敗したら、読めなかったことを受け取る。次の変更で読み直す", async () => {
    const files = new FakeDayFiles();
    files.write(today, "- [ ] a\n");
    files.failNextRead = true;
    const { states } = open(files);
    await settle();

    files.write(today, "- [ ] b\n");
    await settle();

    expect(states).toEqual(["loading", "unreadable", ["b", "", ""]]);
  });

  it("受け取る側が例外を投げても onError に渡し、ほかの購読者と次の変更を受け取り続ける", async () => {
    const files = new FakeDayFiles();
    files.write(today, "- [ ] a\n");
    const { session, states, errors } = open(files);
    session.subscribe((state) => {
      if (state.kind === "board") {
        throw new Error("描けない");
      }
    });
    const after: BoardState[] = [];
    session.subscribe((state) => after.push(state));
    await settle();

    files.write(today, "- [ ] b\n");
    await settle();

    expect(states).toEqual(["loading", ["a", "", ""], ["b", "", ""]]);
    expect(after.map(summary)).toEqual(["loading", ["a", "", ""], ["b", "", ""]]);
    expect(errors).toHaveLength(2);
  });

  it("あとから購読しても、今の状態をすぐに受け取る", async () => {
    const files = new FakeDayFiles();
    files.write(today, "- [ ] a\n");
    const { session } = open(files);
    await settle();

    const later: BoardState[] = [];
    session.subscribe((state) => later.push(state));

    expect(later.map(summary)).toEqual([["a", "", ""]]);
  });

  it("購読をやめた受け取り手には渡さない", async () => {
    const files = new FakeDayFiles();
    files.write(today, "- [ ] a\n");
    const { session } = open(files);
    const received: BoardState[] = [];
    const unsubscribe = session.subscribe((state) => received.push(state));

    unsubscribe();
    await settle();

    expect(received.map(summary)).toEqual(["loading"]);
  });

  it("閉じると、変更を受けず、変更の購読も外す", async () => {
    const files = new FakeDayFiles();
    files.write(today, "- [ ] a\n");
    const { session, states } = open(files);
    await settle();

    session.close();
    files.write(today, "- [ ] b\n");
    await settle();

    expect(states).toEqual(["loading", ["a", "", ""]]);
    expect(files.listenerCount(today)).toBe(0);
  });

  it("閉じた後に終わった読み込みは受け取らない", async () => {
    const files = new FakeDayFiles();
    files.write(today, "- [ ] a\n");
    files.hold();
    const { session, states } = open(files);

    session.close();
    files.release(0);
    await settle();

    expect(states).toEqual(["loading"]);
  });
});

describe("openBoard：カードを動かす", () => {
  const body = "- [ ] a\n- [ ] b\n- [x] c\n";
  const a = card(0, "- [ ] a");
  const b = card(1, "- [ ] b");

  it("動かすとすぐに新しい並びを受け取り、書き込んだ本文も同じ並びになる", async () => {
    const files = new FakeDayFiles();
    files.write(today, body);
    const { session, states } = open(files);
    await settle();
    files.holdWrites();

    void session.move(a, "done", 0);

    expect(states.at(-1)).toEqual(["b", "", "a,c"]);
    await settle();
    files.releaseWrite();
    await settle();
    expect(files.body(today)).toBe("- [ ] b\n- [x] a\n- [x] c\n");
    expect(states.at(-1)).toEqual(["b", "", "a,c"]);
  });

  it("書き込みが終わるまでは、読み直しの結果で先読みの表示を上書きしない", async () => {
    const files = new FakeDayFiles();
    files.write(today, body);
    const { session, states } = open(files);
    await settle();
    files.holdWrites();

    void session.move(a, "done", 0);
    files.write(today, body);
    await settle();

    expect(states.at(-1)).toEqual(["b", "", "a,c"]);
    files.releaseWrite();
    await settle();
    expect(states.at(-1)).toEqual(["b", "", "a,c"]);
  });

  it("書き込みは1つずつ行い、2回目の操作は1回目の結果に当たる", async () => {
    const files = new FakeDayFiles();
    files.write(today, body);
    const { session, states, notices } = open(files);
    await settle();
    files.holdWrites();

    void session.move(a, "done", 0);
    void session.move(card(0, "- [ ] b"), "done", 2);
    await settle();

    expect(files.startedWrites).toBe(1);
    expect(states.at(-1)).toEqual(["", "", "a,c,b"]);
    files.releaseWrite();
    await settle();
    files.releaseWrite();
    await settle();
    expect(files.body(today)).toBe("- [x] a\n- [x] c\n- [x] b\n");
    expect(notices).toEqual([]);
  });

  it("ファイルが変わっていて stale になったら、知らせて、読み直した表示に戻る", async () => {
    const files = new FakeDayFiles();
    files.write(today, body);
    const { session, states, notices } = open(files);
    await settle();
    files.holdWrites();

    void session.move(b, "done", 0);
    files.write(today, "- [ ] 先頭に足した\n- [ ] a\n- [ ] b\n");
    await settle();
    files.releaseWrite();
    await settle();

    expect(notices).toEqual(["ファイルが変わっていたので、操作を取りやめて読み直しました"]);
    expect(states.at(-1)).toEqual(["先頭に足した,a,b", "", ""]);
  });

  it("表示より古い ref で動かすと、表示を変えずに知らせる", async () => {
    const files = new FakeDayFiles();
    files.write(today, body);
    const { session, states, notices } = open(files);
    await settle();

    await session.move(card(0, "- [ ] 古い行"), "done", 0);
    await settle();

    expect(states.at(-1)).toEqual(["a,b", "", "c"]);
    expect(files.body(today)).toBe(body);
    expect(notices).toEqual(["ファイルが変わっていたので、操作を取りやめて読み直しました"]);
  });

  it("読み直すと区切りが変わる操作は、知らせて取りやめる", async () => {
    const files = new FakeDayFiles();
    const unstable = "- [ ] a\n---\nメモ\n---\n";
    files.write(today, unstable);
    const { session, notices } = open(files);
    await settle();

    await session.move(a, "done", 0);
    await settle();

    expect(files.body(today)).toBe(unstable);
    expect(notices).toEqual(["この操作をするとファイルの区切りが変わるため、取りやめました"]);
  });

  it("過去の日は書き込まずに知らせる", async () => {
    const files = new FakeDayFiles();
    files.write(yesterday, body);
    const { session, states, notices } = open(files, yesterday);
    await settle();

    await session.move(a, "done", 0);

    expect(files.startedWrites).toBe(0);
    expect(states.at(-1)).toEqual(["a,b", "", "c"]);
    expect(notices).toEqual(["過去の日は、作業時間の修正だけができます"]);
  });

  it("ファイルがなければ書き込まずに知らせる", async () => {
    const files = new FakeDayFiles();
    const { session, notices } = open(files);
    await settle();

    await session.move(a, "done", 0);

    expect(notices).toEqual(["今日のファイルがありません"]);
  });

  it("閉じた後の操作は何もしない", async () => {
    const files = new FakeDayFiles();
    files.write(today, body);
    const { session, states, notices } = open(files);
    await settle();

    session.close();
    await session.move(a, "done", 0);

    expect(files.startedWrites).toBe(0);
    expect(states.at(-1)).toEqual(["a,b", "", "c"]);
    expect(notices).toEqual([]);
  });
});
