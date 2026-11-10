import { FakeDayFiles, settle } from "@tests/app/fakes/day-files";
import {
  FakeAlarm,
  FakeClock,
  FakeTimerStore,
  NINE,
  runningTimer,
  TODAY,
} from "@tests/app/fakes/timer";
import { estimate } from "@tests/domain/document/arbitraries";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type BoardSession, type BoardState, openBoard } from "@/app/board/session";
import { DayEditor } from "@/app/day-editor";
import type { LineRef } from "@/domain/commands/command";
import type { WorkEdits } from "@/domain/commands/work";
import type { Timer } from "@/domain/timer";

const today = TODAY;
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
  clock: FakeClock;
  editor: DayEditor;
}

/** その日のボードを開いて購読し、受け取った状態・通知・例外を記録する。時計は今日の 9:00 */
function open(files: FakeDayFiles, dayKey = today, timer: Timer = undefined): Opened {
  const notices: string[] = [];
  const errors: unknown[] = [];
  const clock = new FakeClock();
  const notifier = { notify: (message: string) => notices.push(message) };
  const onError = (error: unknown) => errors.push(error);
  const editor = new DayEditor(
    {
      files,
      store: new FakeTimerStore(timer),
      clock,
      notifier,
      alarm: new FakeAlarm(),
      onError,
    },
    timer,
  );
  const session = openBoard({ files, clock, notifier, editor, onError }, dayKey);
  const states: ReturnType<typeof summary>[] = [];
  session.subscribe((state) => states.push(summary(state)));
  return { session, states, notices, errors, clock, editor };
}

/** 開いて読み込み、受け取った状態をそのまま記録する */
async function openWithStates(files: FakeDayFiles, dayKey = today) {
  const opened = open(files, dayKey);
  const received: BoardState[] = [];
  opened.session.subscribe((state) => received.push(state));
  await settle();
  return { ...opened, received };
}

/** n 番目の TODO ブロックを、その行の文字列とともに指す */
const card = (index: number, text: string): LineRef => ({ index, text });

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

  it("書き込みの途中で閉じたら、書き込みが終わっても読み直さない", async () => {
    const files = new FakeDayFiles();
    files.write(today, "- [ ] a\n");
    const { session } = open(files);
    await settle();
    files.holdWrites();
    const moved = session.move(card(0, "- [ ] a"), "done", 0);
    await settle();
    session.close();
    const reads = files.reads;

    files.releaseWrite();
    await moved;
    await settle();

    expect(files.reads).toBe(reads);
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

  it("先の操作が断られたら、その先読みをもとにした後の操作は書き込まず、知らせるのは1回だけ", async () => {
    const files = new FakeDayFiles();
    files.write(today, body);
    const { session, states, notices } = open(files);
    await settle();
    files.holdWrites();

    void session.move(a, "done", 0);
    void session.move(card(0, "- [ ] b"), "done", 0);
    files.write(today, "- [ ] 先頭に足した\n- [ ] a\n- [ ] b\n");
    await settle();
    files.releaseWrite();
    await settle();

    // 1回目は読んだ時点で stale になるので、どちらも書き込みは始まらない
    expect(files.startedWrites).toBe(0);
    expect(files.body(today)).toBe("- [ ] 先頭に足した\n- [ ] a\n- [ ] b\n");
    expect(notices).toEqual(["ファイルが変わっていたので、操作を取りやめて読み直しました"]);
    expect(states.at(-1)).toEqual(["先頭に足した,a,b", "", ""]);
  });

  it("断られた後の新しい操作は、読み直した表示に対して書き込む", async () => {
    const files = new FakeDayFiles();
    files.write(today, body);
    const { session, notices } = open(files);
    await settle();

    await session.move(card(0, "- [ ] 古い行"), "done", 0);
    await settle();
    await session.move(b, "done", 0);
    await settle();

    expect(files.body(today)).toBe("- [ ] a\n- [x] b\n- [x] c\n");
    expect(notices).toHaveLength(1);
  });

  it("書き込みに失敗したら、知らせて例外を onError に渡し、読み直した表示に戻る", async () => {
    const files = new FakeDayFiles();
    files.write(today, body);
    const { session, states, notices, errors } = open(files);
    await settle();

    files.failNextWrite = true;
    await session.move(a, "done", 0);
    await settle();

    expect(notices).toEqual(["ファイルに書き込めませんでした"]);
    expect(errors).toHaveLength(1);
    expect(states.at(-1)).toEqual(["a,b", "", "c"]);
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

    expect(notices).toEqual(["2026-11-05 のファイルがありません"]);
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

describe("openBoard：作業時間の修正（M2）", () => {
  const body = "- [x] a\n    - 25分 ポモドーロ\n- [ ] b\n";
  const a = card(0, "- [x] a");
  const entry = { index: 0, text: "    - 25分 ポモドーロ" };
  const edits: WorkEdits = { updated: [{ entry, minutes: 20 }], removed: [], added: [10] };
  const minutesOf = (state: BoardState) =>
    state.kind === "board" ? state.board.done[0]?.workedMinutes : undefined;

  it("保存すると書き込みを待たずに新しい合計を出し、書き込めたら true を返す", async () => {
    const files = new FakeDayFiles();
    files.write(today, body);
    const { session, received } = await openWithStates(files);
    files.holdWrites();

    const saved = session.editWork(a, edits);

    expect(minutesOf(received.at(-1) as BoardState)).toBe(30);
    await settle();
    files.releaseWrite();
    expect(await saved).toBe(true);
    expect(files.body(today)).toBe("- [x] a\n    - 20分 手動\n    - 10分 手動\n- [ ] b\n");
  });

  it("過去の日でも保存できる", async () => {
    const files = new FakeDayFiles();
    files.write(yesterday, body);
    const { session, notices } = await openWithStates(files, yesterday);

    expect(await session.editWork(a, edits)).toBe(true);
    expect(files.body(yesterday)).toContain("    - 20分 手動\n");
    expect(notices).toEqual([]);
  });

  it("ファイルが変わっていて保存できなければ、知らせて false を返す", async () => {
    const files = new FakeDayFiles();
    files.write(today, body);
    const { session, notices } = await openWithStates(files);
    files.write(today, "- [x] a\n    - 10分 ポモドーロ\n");
    await settle();

    expect(await session.editWork(a, edits)).toBe(false);
    expect(notices).toEqual(["ファイルが変わっていたので、操作を取りやめて読み直しました"]);
  });

  it("閉じた後は保存せず、false を返す", async () => {
    const files = new FakeDayFiles();
    files.write(today, body);
    const { session } = await openWithStates(files);

    session.close();

    expect(await session.editWork(a, edits)).toBe(false);
    expect(files.startedWrites).toBe(0);
  });
});

describe("openBoard：TODOの追加（M4）", () => {
  const body = "- [ ] a\n- [x] b\n";

  it("追加すると書き込みを待たずに今日やるのいちばん下に出し、書き込めたら true を返す", async () => {
    const files = new FakeDayFiles();
    files.write(today, body);
    const { session, states } = open(files);
    await settle();
    files.holdWrites();

    const added = session.addTodo("メールの返信", "2");

    expect(states.at(-1)).toEqual(["a,メールの返信", "", "b"]);
    await settle();
    files.releaseWrite();
    expect(await added).toBe(true);
    expect(files.body(today)).toBe("- [ ] a\n- [ ] メールの返信 [est:: 2]\n- [x] b\n");
  });

  it("見積もりを選ばなければ、見積もりなしで追加する", async () => {
    const files = new FakeDayFiles();
    files.write(today, body);
    const { session } = open(files);
    await settle();

    expect(await session.addTodo("メールの返信")).toBe(true);
    expect(files.body(today)).toBe("- [ ] a\n- [ ] メールの返信\n- [x] b\n");
  });

  it("過去の日は書き込まずに知らせ、false を返す", async () => {
    const files = new FakeDayFiles();
    files.write(yesterday, body);
    const { session, states, notices } = open(files, yesterday);
    await settle();

    expect(await session.addTodo("メールの返信")).toBe(false);
    expect(files.startedWrites).toBe(0);
    expect(states.at(-1)).toEqual(["a", "", "b"]);
    expect(notices).toEqual(["過去の日は、作業時間の修正だけができます"]);
  });

  it("書式にならない名前は、表示を変えずに知らせて false を返す", async () => {
    const files = new FakeDayFiles();
    files.write(today, body);
    const { session, states, notices } = open(files);
    await settle();

    expect(await session.addTodo("見積もりつき [est:: 1]")).toBe(false);
    expect(files.body(today)).toBe(body);
    expect(states.at(-1)).toEqual(["a", "", "b"]);
    expect(notices).toEqual(["入力が書式に合わないため、追加・変更しませんでした"]);
  });

  /** 最後に受け取ったボードで追加できるか */
  const canAddOf = (received: BoardState[]) => {
    const last = received.at(-1);
    return last?.kind === "board" ? last.canAdd : undefined;
  };

  it.each([
    [today, true],
    [yesterday, false],
  ])("%s のボードで追加できるか：%s", async (dayKey, expected) => {
    const files = new FakeDayFiles();
    files.write(dayKey, body);
    const { received } = await openWithStates(files, dayKey);

    expect(canAddOf(received)).toBe(expected);
  });

  it("開いたまま日付をまたぐと、次に読み直したときから追加できない", async () => {
    const files = new FakeDayFiles();
    files.write(today, body);
    const received: BoardState[] = [];
    const { session, clock } = open(files);
    session.subscribe((state) => received.push(state));
    await settle();

    clock.advance(15 * 60);
    files.write(today, body);
    await settle();

    expect(canAddOf(received)).toBe(false);
  });

  it("閉じた後は追加せず、false を返す", async () => {
    const files = new FakeDayFiles();
    files.write(today, body);
    const { session } = open(files);
    await settle();

    session.close();

    expect(await session.addTodo("メールの返信")).toBe(false);
    expect(files.startedWrites).toBe(0);
  });

  it("どんな名前・見積もりでも、書き込めたら先読みの表示と読み直した表示が同じ", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), estimate, async (name, est) => {
        const files = new FakeDayFiles();
        files.write(today, body);
        const { session, states } = open(files);
        await settle();
        files.holdWrites();

        const added = session.addTodo(name, est);
        const previewed = states.at(-1);
        await settle();
        files.releaseWrite();
        fc.pre(await added);
        await settle();
        const reopened = open(files);
        await settle();

        expect(reopened.states.at(-1)).toEqual(previewed);
        expect(previewed).not.toEqual(["a", "", "b"]);
      }),
    );
  });
});

describe("openBoard：タイマー", () => {
  const body = "- [/] 提案資料\n- [ ] レビュー対応\n";
  const proposal = card(0, "- [/] 提案資料");
  const nine = NINE;
  const running = runningTimer(proposal.text);

  it("計測中のカードを示す", async () => {
    const files = new FakeDayFiles();
    files.write(today, body);
    const received: BoardState[] = [];
    const { session } = open(files, today, running);
    session.subscribe((state) => received.push(state));
    await settle();

    expect(received.at(-1)).toMatchObject({
      kind: "board",
      running: { key: "- [/] 提案資料#0", startedAt: nine, count: 1 },
    });
  });

  it("着手中へ動かすと計測が始まり、計測中のカードとして示す", async () => {
    const files = new FakeDayFiles();
    files.write(today, body);
    const received: BoardState[] = [];
    const { session } = open(files);
    session.subscribe((state) => received.push(state));
    await settle();

    await session.move(card(1, "- [ ] レビュー対応"), "doing", 0);
    await settle();

    expect(received.at(-1)).toMatchObject({ running: { key: "- [/] レビュー対応#0" } });
  });

  it("「中断」で経過分を記録して止め、計測中のカードを示さなくなる", async () => {
    const files = new FakeDayFiles();
    files.write(today, body);
    const received: BoardState[] = [];
    const { session, clock } = open(files, today, running);
    session.subscribe((state) => received.push(state));
    await settle();
    clock.advance(8);

    await session.interrupt();
    await settle();

    expect(files.body(today)).toBe("- [/] 提案資料\n    - 8分 中断\n- [ ] レビュー対応\n");
    expect(received.at(-1)).not.toHaveProperty("running");
  });

  it("「次のポモドーロを開始」で計測を始め、「完了にする」で記録して完了へ動かす", async () => {
    const files = new FakeDayFiles();
    files.write(today, body);
    const { session, clock, states } = open(files);
    await settle();

    await session.next(proposal);
    clock.advance(20);
    await session.complete(proposal);
    await settle();

    expect(files.body(today)).toBe("- [ ] レビュー対応\n- [x] 提案資料\n    - 20分 ポモドーロ\n");
    expect(states.at(-1)).toEqual(["レビュー対応", "", "提案資料"]);
  });

  it("ほかの日のタイマーは、この日のボードでは計測中として示さない", async () => {
    const files = new FakeDayFiles();
    files.write(today, body);
    const received: BoardState[] = [];
    const { session } = open(files, today, { ...running, dayKey: yesterday });
    session.subscribe((state) => received.push(state));
    await settle();

    expect(received.at(-1)).not.toHaveProperty("running");
  });

  it("過去の日のボードでは計測を始められない", async () => {
    const files = new FakeDayFiles();
    files.write(yesterday, body);
    const { session, notices } = open(files, yesterday);
    await settle();

    await session.next(proposal);

    expect(files.startedWrites).toBe(0);
    expect(notices).toEqual(["過去の日は、作業時間の修正だけができます"]);
  });

  it("日付をまたいで過去の日になったボードでも、その日の計測は「中断」で止めて記録できる", async () => {
    const files = new FakeDayFiles();
    files.write(yesterday, body);
    const { session, notices, clock } = open(files, yesterday, { ...running, dayKey: yesterday });
    await settle();
    clock.advance(5);

    await session.interrupt();

    expect(files.body(yesterday)).toContain("    - 5分 中断\n");
    expect(notices).toEqual([]);
  });

  it("保留中のタイマーでも、対象が見つかれば計測中のカードとして示す", async () => {
    const files = new FakeDayFiles();
    files.write(today, body.replace("提案資料", "提案資料の構成"));
    const received: BoardState[] = [];
    const { session } = open(files, today, { ...running, held: true });
    session.subscribe((state) => received.push(state));
    await settle();

    files.write(today, body);
    await settle();
    await settle();

    expect(received.at(-1)).toMatchObject({ running: { key: "- [/] 提案資料#0" } });
  });

  it("「完了にする」と、書き込みを待たずに完了の列へ出す", async () => {
    const files = new FakeDayFiles();
    files.write(today, body);
    const { session, states } = open(files);
    await settle();
    files.holdWrites();

    void session.complete(proposal);

    expect(states.at(-1)).toEqual(["レビュー対応", "", "提案資料"]);
  });

  it("閉じた後は、タイマーが変わっても受け取らない", async () => {
    const files = new FakeDayFiles();
    files.write(today, body);
    const { session, states, editor } = open(files);
    await settle();
    const count = states.length;

    session.close();
    await editor.edit(today, { kind: "next", card: proposal });

    expect(states).toHaveLength(count);
  });
});
