import { describe, expect, it } from "vitest";
import { DayEditor } from "@/app/day-editor";
import type { LineRef } from "@/domain/commands";
import type { RunningTimer, Timer } from "@/domain/timer";
import { FakeDayFiles } from "./fakes/day-files";
import { FakeClock, FakeTimerStore } from "./fakes/timer";

const today = "2026-11-05";
const yesterday = "2026-11-04";
const nine = new Date(2026, 10, 5, 9, 0).getTime();

const body = `- [/] 提案資料
    - 25分 ポモドーロ
- [ ] レビュー対応
`;
const proposal: LineRef = { index: 0, text: "- [/] 提案資料" };
const review: LineRef = { index: 1, text: "- [ ] レビュー対応" };

const running = (overrides: Partial<RunningTimer> = {}): RunningTimer => ({
  dayKey: today,
  startedAt: nine,
  text: proposal.text,
  held: false,
  ...overrides,
});

/** 偽物をつないだ DayEditor。受け取ったタイマー・通知・音・例外を記録する */
function setup(timer: Timer = undefined) {
  const files = new FakeDayFiles();
  files.write(today, body);
  const clock = new FakeClock();
  const store = new FakeTimerStore(timer);
  const notices: string[] = [];
  const errors: unknown[] = [];
  const alarms: string[] = [];
  const editor = new DayEditor(
    {
      files,
      store,
      clock,
      notifier: { notify: (message) => notices.push(message) },
      alarm: { ring: (message) => alarms.push(message) },
      onError: (error) => errors.push(error),
    },
    timer,
  );
  return { files, clock, store, notices, errors, editor, alarms };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("DayEditor：操作", () => {
  it("保存してあったタイマーを今のタイマーとして持つ", () => {
    expect(setup(running()).editor.current()).toEqual(running());
  });

  it("着手中へ動かすと計測を始め、タイマーを保存してから書き込む", async () => {
    const { files, clock, store, editor } = setup();
    clock.advance(3);
    files.holdWrites();

    const outcome = editor.edit(today, {
      kind: "move",
      card: review,
      status: "doing",
      position: 0,
    });
    await settle();

    const started = running({ startedAt: nine + 3 * 60_000, text: "- [/] レビュー対応" });
    expect(store.current()).toEqual(started);
    expect(files.body(today)).toBe(body);
    files.releaseWrite();
    expect(await outcome).toBe("done");
    expect(files.body(today)).toContain("- [/] レビュー対応");
    expect(editor.current()).toEqual(started);
  });

  it("「中断」で経過分を記録して止める", async () => {
    const { files, clock, store, editor } = setup(running());
    clock.advance(7);

    await editor.edit(today, { kind: "interrupt" });

    expect(files.body(today)).toContain("    - 7分 中断\n");
    expect(store.current()).toBeUndefined();
  });

  it("断られた操作は書き込まず、タイマーも変えずに知らせる", async () => {
    const { files, store, editor, notices } = setup(running());

    const outcome = await editor.edit(today, {
      kind: "move",
      card: { index: 1, text: "- [ ] 古い" },
      status: "doing",
      position: 0,
    });

    expect(outcome).toBe("refused");
    expect(files.body(today)).toBe(body);
    expect(store.saved).toEqual([]);
    expect(notices).toEqual(["ファイルが変わっていたので、操作を取りやめて読み直しました"]);
  });

  it("読んだ後、書き込む前に本文が変わっていたら、タイマーを元に戻して知らせる", async () => {
    const { files, clock, store, editor, notices } = setup(running());
    clock.advance(7);
    files.holdWrites();

    const outcome = editor.edit(today, { kind: "interrupt" });
    await settle();
    files.write(today, `${body}- [ ] 足した\n`);
    files.releaseWrite();

    expect(await outcome).toBe("refused");
    expect(files.body(today)).toBe(`${body}- [ ] 足した\n`);
    expect(store.current()).toEqual(running());
    expect(notices).toEqual(["ファイルが変わっていたので、操作を取りやめて読み直しました"]);
  });

  it("書き込みに失敗したら、タイマーを元に戻して知らせ、例外を onError に渡す", async () => {
    const { files, clock, store, editor, notices, errors } = setup(running());
    clock.advance(7);
    files.failNextWrite = true;

    expect(await editor.edit(today, { kind: "interrupt" })).toBe("refused");

    expect(store.current()).toEqual(running());
    expect(notices).toEqual(["ファイルに書き込めませんでした"]);
    expect(errors).toHaveLength(1);
  });

  it("ファイルがなければ知らせる", async () => {
    const { editor, notices } = setup();

    expect(await editor.edit(yesterday, { kind: "interrupt" })).toBe("refused");

    expect(notices).toEqual(["2026-11-04 のファイルがありません"]);
  });

  it("書き込む時点で続けてよいかを確かめ、だめなら何もしない", async () => {
    const { files, editor, notices } = setup();

    const outcome = await editor.edit(
      today,
      { kind: "move", card: review, status: "done", position: 0 },
      () => false,
    );

    expect(outcome).toBe("skipped");
    expect(files.startedWrites).toBe(0);
    expect(notices).toEqual([]);
  });

  it("操作は1つずつ順番に行う", async () => {
    const { files, editor } = setup();
    files.holdWrites();

    const first = editor.edit(today, { kind: "move", card: review, status: "done", position: 0 });
    const second = editor.edit(today, { kind: "complete", card: proposal });
    await settle();

    expect(files.startedWrites).toBe(1);
    files.releaseWrite();
    await first;
    await settle();
    files.releaseWrite();
    expect(await second).toBe("done");
    expect(files.body(today)).toBe(`- [x] レビュー対応
- [x] 提案資料
    - 25分 ポモドーロ
`);
  });

  it("ほかの日のタイマーがあるときに着手中へ動かすと、先にその日のファイルへ中断を記録する", async () => {
    const { files, clock, editor, store } = setup(running({ dayKey: yesterday }));
    files.write(yesterday, body);
    clock.advance(10);

    await editor.edit(today, { kind: "move", card: review, status: "doing", position: 0 });

    expect(files.body(yesterday)).toContain("    - 10分 中断\n");
    expect(store.current()).toMatchObject({ dayKey: today, text: "- [/] レビュー対応" });
  });

  it("ほかの日のタイマーがあるときに「次のポモドーロを開始」でも、先にその日のファイルへ中断を記録する", async () => {
    const { files, clock, editor } = setup(running({ dayKey: yesterday }));
    files.write(yesterday, body);
    clock.advance(4);

    await editor.edit(today, { kind: "next", card: proposal });

    expect(files.body(yesterday)).toContain("    - 4分 中断\n");
  });

  it("書き込む直前にファイルが消えていたら、ファイルがないと知らせる", async () => {
    const { files, clock, editor, notices, store } = setup(running());
    clock.advance(7);
    files.holdWrites();

    const outcome = editor.edit(today, { kind: "interrupt" });
    await settle();
    files.remove(today);
    files.releaseWrite();

    expect(await outcome).toBe("refused");
    expect(notices).toEqual(["2026-11-05 のファイルがありません"]);
    expect(store.current()).toEqual(running());
  });

  it("対象が見つからず捨てたときは知らせる", async () => {
    const { files, editor, notices, store } = setup(running({ held: true }));
    files.write(today, body.replace("提案資料", "提案資料の構成"));

    await editor.edit(today, { kind: "interrupt" });

    expect(store.current()).toBeUndefined();
    expect(notices).toEqual([
      "着手中のカードが見つからないため、計測を取りやめました（記録していません）",
    ]);
  });
});

describe("DayEditor：毎秒の満了の判定", () => {
  it("25分たつと記録して止め、カードの名前を添えて満了を知らせる（通知は Alarm だけ）", async () => {
    const { files, clock, editor, store, notices, alarms } = setup(running());
    clock.advance(25);

    editor.tick();
    await settle();

    expect(files.body(today)).toContain("    - 25分 ポモドーロ\n    - 25分 ポモドーロ\n");
    expect(store.current()).toBeUndefined();
    expect(alarms).toEqual(["25分たちました。「提案資料」にポモドーロを記録しました"]);
    expect(notices).toEqual([]);
  });

  it("25分前は何もしない", async () => {
    const { files, clock, editor } = setup(running());
    clock.advance(24, 59);

    editor.tick();
    await settle();

    expect(files.startedWrites).toBe(0);
  });

  it("確定の途中の判定は重ねない", async () => {
    const { files, clock, editor } = setup(running());
    clock.advance(25);
    files.hold();

    // 読み込みが終わるまではタイマーが残っているので、判定が重なりうる
    editor.tick();
    await settle();
    editor.tick();
    editor.tick();
    files.release(0);
    await settle();
    await settle();

    expect(files.reads).toBe(1);
  });

  it("保留中は毎秒の判定で読み直さず、ファイルが変わったときだけ読み直す", async () => {
    const { files, clock, editor } = setup(running({ held: true }));
    clock.advance(30);

    editor.tick();
    await settle();
    expect(files.reads).toBe(0);

    files.write(yesterday, body);
    await settle();
    expect(files.reads).toBe(0);
  });

  it("保留中でなければ、ファイルが変わっても読み直さない", async () => {
    const { files, editor } = setup(running());

    files.write(today, body);
    await settle();
    editor.close();

    expect(files.reads).toBe(0);
  });

  it("計測を始めると、その日のファイルを見張る", async () => {
    const { files, clock, editor } = setup();

    await editor.edit(today, { kind: "next", card: proposal });
    files.write(today, body.replace("提案資料", "提案資料の構成"));
    clock.advance(25);
    editor.tick();
    await settle();
    files.write(today, body);
    await settle();
    await settle();

    expect(files.body(today)).toContain("    - 25分 ポモドーロ\n    - 25分 ポモドーロ\n");
  });

  it("確定の途中で次の判定が来ても、記録は1行だけ", async () => {
    const { files, clock, editor } = setup(running());
    clock.advance(25);
    files.holdWrites();

    editor.tick();
    await settle();
    editor.tick();
    clock.advance(0, 1);
    editor.tick();
    files.releaseWrite();
    await settle();
    await settle();

    expect(files.body(today)?.match(/25分 ポモドーロ/g)).toHaveLength(2);
  });

  it("満了と「完了にする」が重なっても、記録は1行だけ", async () => {
    const { files, clock, editor } = setup(running());
    clock.advance(25);

    editor.tick();
    await editor.edit(today, { kind: "complete", card: proposal });
    await settle();

    expect(files.body(today)?.match(/分 ポモドーロ/g)).toHaveLength(2);
    expect(files.body(today)).toContain("- [x] 提案資料");
  });

  it("満了の時点で見つからなければ保留にし、ファイルが直って見つかれば記録する", async () => {
    const { files, clock, editor, store } = setup(running());
    const renamed = body.replace("提案資料", "提案資料の構成");
    files.write(today, renamed);
    clock.advance(25);

    editor.tick();
    await settle();
    expect(store.current()).toEqual(running({ held: true }));
    editor.tick();
    await settle();
    expect(files.startedWrites).toBe(0);

    files.write(today, body);
    await settle();
    await settle();

    expect(files.body(today)).toContain("    - 25分 ポモドーロ\n    - 25分 ポモドーロ\n");
    expect(store.current()).toBeUndefined();
  });

  it("閉じた後は、まだ止まっていないタイマーも判定しない", async () => {
    const { files, clock, editor } = setup(running());
    clock.advance(30);

    editor.close();
    editor.tick();
    await settle();

    expect(files.reads).toBe(0);
  });

  it("閉じた後に終わった操作で、ファイルの見張りを始め直さない", async () => {
    const { files, editor } = setup();
    files.holdWrites();

    const outcome = editor.edit(today, { kind: "next", card: proposal });
    editor.close();
    files.releaseWrite();
    await outcome;

    expect(files.listenerCount(today)).toBe(0);
  });

  it("閉じた後は判定も読み直しもしない", async () => {
    const { files, clock, editor } = setup(running({ held: true }));
    clock.advance(30);

    editor.close();
    editor.tick();
    files.write(today, body);
    await settle();

    expect(files.startedWrites).toBe(0);
    expect(files.listenerCount(today)).toBe(0);
  });
});
