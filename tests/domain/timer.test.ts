import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { editWork, isRejection, type LineRef, type WorkEdits } from "@/domain/commands";
import { parseDocument, serializeDocument, todoBlocks } from "@/domain/document/body";
import { parseWorkEntry } from "@/domain/document/work-entry";
import {
  parseTimer,
  type RunningTimer,
  startsTimer,
  stepTimer,
  type Timer,
  type TimerOp,
} from "@/domain/timer";
import { markdownLike } from "./document/arbitraries";

const day = "2026-11-05";
const t0 = new Date(2026, 10, 5, 9, 0).getTime();
const at = (minutes: number, seconds = 0) => t0 + minutes * 60_000 + seconds * 1000;

const board = `- [/] 提案資料 [est:: 3]
    - 25分 ポモドーロ
- [ ] レビュー対応
- [x] 経費精算
`;

/** n 番目の TODO ブロックを、その行の文字列とともに指す */
const card = (index: number, text: string): LineRef => ({ index, text });
const proposal = card(0, "- [/] 提案資料 [est:: 3]");
const review = card(1, "- [ ] レビュー対応");

/** 提案資料を 9:00 から計測している */
const running = (overrides: Partial<RunningTimer> = {}): RunningTimer => ({
  dayKey: day,
  startedAt: at(0),
  text: proposal.text,
  held: false,
  ...overrides,
});

function step(timer: Timer, op: TimerOp, now: number, body = board) {
  const result = stepTimer(timer, parseDocument(body), day, op, now);
  const written = isRejection(result.result) ? result.result : serializeDocument(result.result);
  return { ...result, written };
}

describe("stepTimer（design 8.1）", () => {
  it("停止中にカードを着手中へ動かすと計測が始まり、前の着手中は記録せずに今日やるへ戻る", () => {
    const result = step(
      undefined,
      { kind: "move", card: review, status: "doing", position: 0 },
      at(3),
    );

    // 今日やるがほかに残らないので、前の着手中は最後の TODO ブロックの直後に入る（AD-4 の列の端）
    expect(result.written).toBe(`- [/] レビュー対応
- [x] 経費精算
- [ ] 提案資料 [est:: 3]
    - 25分 ポモドーロ
`);
    expect(result.timer).toEqual({
      dayKey: day,
      startedAt: at(3),
      text: "- [/] レビュー対応",
      held: false,
    });
    expect(result.notice).toBeUndefined();
  });

  it("計測中に別のカードを着手中へ動かすと、前のカードに経過分を中断として記録して今日やるの先頭へ戻す", () => {
    const body = `${board}- [ ] 見積もりの返信\n`;
    const result = step(
      running(),
      { kind: "move", card: review, status: "doing", position: 0 },
      at(12, 30),
      body,
    );

    expect(result.written).toBe(`- [/] レビュー対応
- [x] 経費精算
- [ ] 提案資料 [est:: 3]
    - 25分 ポモドーロ
    - 12分 中断
- [ ] 見積もりの返信
`);
    expect(result.timer).toMatchObject({ startedAt: at(12, 30), text: "- [/] レビュー対応" });
  });

  it("経過が1分未満なら記録しない", () => {
    expect(step(running(), { kind: "interrupt" }, at(0, 59)).written).toBe(board);
    expect(step(running(), { kind: "interrupt" }, at(0, 59)).timer).toBeUndefined();
  });

  it("25分たつと 25分 ポモドーロ を記録して止まり、カードは着手中に残る", () => {
    const result = step(running(), { kind: "expire" }, at(25));

    expect(result.written).toBe(`- [/] 提案資料 [est:: 3]
    - 25分 ポモドーロ
    - 25分 ポモドーロ
- [ ] レビュー対応
- [x] 経費精算
`);
    expect(result.timer).toBeUndefined();
    expect(result.notice).toBe("expired");
  });

  it("25分たっていなければ、満了の判定では何もしない", () => {
    const result = step(running(), { kind: "expire" }, at(24, 59));

    expect(result.written).toBe(board);
    expect(result.timer).toEqual(running());
    expect(result.notice).toBeUndefined();
  });

  it("スリープなどで25分を過ぎていたら、25分で確定する", () => {
    expect(step(running(), { kind: "expire" }, at(90)).written).toContain(
      "    - 25分 ポモドーロ\n    - 25分 ポモドーロ\n",
    );
  });

  it("「次のポモドーロを開始」で、着手中のカードの計測を始める", () => {
    const result = step(undefined, { kind: "next", card: proposal }, at(30));

    expect(result.written).toBe(board);
    expect(result.timer).toEqual(running({ startedAt: at(30) }));
  });

  it("「次のポモドーロを開始」は、着手中でないカードや古い行には使えない", () => {
    expect(step(undefined, { kind: "next", card: review }, at(30)).result).toEqual({
      rejected: "stale",
    });
    expect(step(undefined, { kind: "next", card: card(0, "- [/] 古い") }, at(30)).result).toEqual({
      rejected: "stale",
    });
  });

  it("「中断」で経過分を中断として記録して止まり、カードは着手中に残る", () => {
    const result = step(running(), { kind: "interrupt" }, at(7));

    expect(result.written).toBe(`- [/] 提案資料 [est:: 3]
    - 25分 ポモドーロ
    - 7分 中断
- [ ] レビュー対応
- [x] 経費精算
`);
    expect(result.timer).toBeUndefined();
  });

  it("計測中に「完了にする」と、経過分をポモドーロとして記録して完了の末尾へ動かす", () => {
    const result = step(running(), { kind: "complete", card: proposal }, at(18));

    expect(result.written).toBe(`- [ ] レビュー対応
- [x] 経費精算
- [x] 提案資料 [est:: 3]
    - 25分 ポモドーロ
    - 18分 ポモドーロ
`);
    expect(result.timer).toBeUndefined();
  });

  it("停止中に「完了にする」と、記録せずに完了の末尾へ動かす", () => {
    expect(
      step(undefined, { kind: "complete", card: proposal }, at(18)).written,
    ).toBe(`- [ ] レビュー対応
- [x] 経費精算
- [x] 提案資料 [est:: 3]
    - 25分 ポモドーロ
`);
  });

  it("計測中に完了の列へドラッグすると、経過分をポモドーロとして記録してドロップした位置へ動かす", () => {
    const result = step(
      running(),
      { kind: "move", card: proposal, status: "done", position: 0 },
      at(5),
    );

    expect(result.written).toBe(`- [ ] レビュー対応
- [x] 提案資料 [est:: 3]
    - 25分 ポモドーロ
    - 5分 ポモドーロ
- [x] 経費精算
`);
    expect(result.timer).toBeUndefined();
  });

  it("計測中に今日やるへ戻すと、経過分を中断として記録して止まる", () => {
    const result = step(
      running(),
      { kind: "move", card: proposal, status: "todo", position: 1 },
      at(9),
    );

    expect(result.written).toBe(`- [ ] レビュー対応
- [ ] 提案資料 [est:: 3]
    - 25分 ポモドーロ
    - 9分 中断
- [x] 経費精算
`);
    expect(result.timer).toBeUndefined();
  });

  it("計測と関係のないカードを動かしても、計測は変わらない", () => {
    const result = step(
      running(),
      { kind: "move", card: review, status: "done", position: 0 },
      at(9),
    );

    expect(result.written).toBe(`- [/] 提案資料 [est:: 3]
    - 25分 ポモドーロ
- [x] レビュー対応
- [x] 経費精算
`);
    expect(result.timer).toEqual(running());
  });

  it("古い行を着手中へ動かそうとすると断り、計測は変えない", () => {
    const result = step(
      running(),
      { kind: "move", card: card(1, "- [ ] 古い"), status: "doing", position: 0 },
      at(9),
    );

    expect(result.result).toEqual({ rejected: "stale" });
    expect(result.timer).toEqual(running());
  });

  it("動かせない操作は断り、計測は変えない", () => {
    const result = step(
      running(),
      { kind: "move", card: card(1, "- [ ] 古い"), status: "done", position: 0 },
      at(9),
    );

    expect(result.result).toEqual({ rejected: "stale" });
    expect(result.timer).toEqual(running());
  });
});

describe("stepTimer：本文だけの変更（M2 の保存など）", () => {
  const entry = { index: 0, text: "    - 25分 ポモドーロ" };
  const edits = { updated: [{ entry, minutes: 20 }], removed: [], added: [5] };
  const editOf = (target: LineRef, workEdits: WorkEdits): TimerOp => ({
    kind: "edit",
    command: (doc) => editWork(doc, target, workEdits),
  });

  it("本文だけの変更は本文に当てるだけで、計測は変えない", () => {
    const result = step(running(), editOf(proposal, edits), at(30));

    expect(result.written).toBe(`- [/] 提案資料 [est:: 3]
    - 20分 手動
    - 5分 手動
- [ ] レビュー対応
- [x] 経費精算
`);
    expect(result.timer).toEqual(running());
  });

  it("対象が見つからなくても、本文だけの変更では判定しない（保留にも、捨てもしない）", () => {
    const renamed = board.replace("- [/] 提案資料 [est:: 3]", "- [/] 提案資料の構成 [est:: 3]");
    const held = running({ held: true });

    const result = step(held, editOf(review, { ...edits, updated: [] }), at(3), renamed);

    expect(result.timer).toEqual(held);
    expect(result.notice).toBeUndefined();
  });

  it("変更できなければ断り、計測は変えない", () => {
    const result = step(running(), editOf(review, edits), at(3));

    expect(result.result).toEqual({ rejected: "stale" });
    expect(result.timer).toEqual(running());
  });
});

describe("stepTimer：対象が見つからないとき（AD-6）", () => {
  const renamed = board.replace("- [/] 提案資料 [est:: 3]", "- [/] 提案資料の構成 [est:: 3]");
  const twoDoing = board.replace("- [ ] レビュー対応", "- [/] レビュー対応");

  it("[/] の行の文字列が違うときや、[/] が2件あるときは見つからず、保留にする", () => {
    expect(step(running(), { kind: "interrupt" }, at(7), renamed).timer).toEqual(
      running({ held: true }),
    );
    expect(step(running(), { kind: "interrupt" }, at(7), twoDoing).timer).toEqual(
      running({ held: true }),
    );
    expect(step(running(), { kind: "interrupt" }, at(7), renamed).written).toBe(renamed);
  });

  it("保留中の操作でも見つからなければ、捨てて知らせる", () => {
    const result = step(running({ held: true }), { kind: "interrupt" }, at(7), renamed);

    expect(result.timer).toBeUndefined();
    expect(result.notice).toBe("discarded");
    expect(result.written).toBe(renamed);
  });

  it("保留中でも、見つかれば保留を解いて計測を続ける", () => {
    const result = step(
      running({ held: true }),
      { kind: "move", card: review, status: "done", position: 0 },
      at(9),
    );

    expect(result.timer).toEqual(running());
  });

  it("保留中に計測中のカードを操作して見つかれば、そのまま記録する", () => {
    expect(step(running({ held: true }), { kind: "interrupt" }, at(7)).written).toContain(
      "    - 7分 中断\n",
    );
  });

  it("計測中に別のカードを着手中へ動かしたとき、前の対象が見つからなければ、捨てて知らせ、新しいカードの計測を始める", () => {
    const result = step(
      running(),
      { kind: "move", card: card(1, "- [ ] レビュー対応"), status: "doing", position: 0 },
      at(9),
      renamed,
    );

    expect(result.notice).toBe("discarded");
    expect(result.timer).toMatchObject({ startedAt: at(9), text: "- [/] レビュー対応" });
    expect(result.written).not.toContain("中断");
  });

  it("満了の時点で見つからなければ保留にし、保留中の満了の判定では何もしない", () => {
    const first = step(running(), { kind: "expire" }, at(25), renamed);
    const second = step(running({ held: true }), { kind: "expire" }, at(26), renamed);

    expect(first.timer).toEqual(running({ held: true }));
    expect(first.notice).toBeUndefined();
    expect(second.timer).toEqual(running({ held: true }));
    expect(second.notice).toBeUndefined();
  });

  it("保留中に読み直して見つかれば保留を解き、25分を過ぎていれば 25分 ポモドーロ を記録する", () => {
    expect(step(running({ held: true }), { kind: "recheck" }, at(10)).timer).toEqual(running());

    const expired = step(running({ held: true }), { kind: "recheck" }, at(40));
    expect(expired.written).toContain("    - 25分 ポモドーロ\n    - 25分 ポモドーロ\n");
    expect(expired.timer).toBeUndefined();
    expect(expired.notice).toBe("expired");
  });

  it("保留中に読み直しても見つからなければ、25分前でも過ぎていても保留のまま待つ", () => {
    expect(step(running({ held: true }), { kind: "recheck" }, at(10), renamed).timer).toEqual(
      running({ held: true }),
    );
    expect(step(running({ held: true }), { kind: "recheck" }, at(40), renamed).timer).toEqual(
      running({ held: true }),
    );
  });

  it("ほかの日のタイマーは、この日の操作では記録も判定もしない", () => {
    const other = running({ dayKey: "2026-11-04" });

    expect(step(other, { kind: "interrupt" }, at(7)).timer).toEqual(other);
    expect(step(other, { kind: "expire" }, at(30)).written).toBe(board);
    expect(step(other, { kind: "complete", card: proposal }, at(7)).written).not.toContain("7分");
  });
});

describe("stepTimer の性質", () => {
  const ops = (doc: ReturnType<typeof parseDocument>) => {
    const refs = todoBlocks(doc.segments).map((block, index) => card(index, block.head.text));
    const ref = refs.length > 0 ? fc.constantFrom(...refs) : fc.constant(card(0, "- [ ] なし"));
    return fc.oneof(
      fc.record({
        kind: fc.constant("move" as const),
        card: ref,
        status: fc.constantFrom("todo" as const, "doing" as const, "done" as const),
        position: fc.nat(5),
      }),
      fc.record({ kind: fc.constant("complete" as const), card: ref }),
      fc.record({ kind: fc.constant("next" as const), card: ref }),
      fc.constantFrom(
        { kind: "interrupt" as const },
        { kind: "expire" as const },
        { kind: "recheck" as const },
      ),
    );
  };

  it("どんな本文と操作でも、作業時間の行は1行までしか増えず、分数は1〜25", () => {
    fc.assert(
      fc.property(
        markdownLike.chain((body) => fc.tuple(fc.constant(body), ops(parseDocument(body)))),
        fc.option(fc.constantFrom(...markdownTexts()), { nil: undefined }),
        fc.boolean(),
        fc.integer({ min: 0, max: 120 }),
        ([body, op], text, held, minutes) => {
          const timer = text === undefined ? undefined : running({ text, held });
          const before = workLines(body);
          const result = stepTimer(timer, parseDocument(body), day, op, at(minutes));
          fc.pre(!isRejection(result.result));

          const added = addedLines(
            before,
            workLines(serializeDocument(result.result as ReturnType<typeof parseDocument>)),
          );
          expect(added.length).toBeLessThanOrEqual(1);
          for (const line of added) {
            const minutesRecorded = parseWorkEntry(line)?.minutes ?? 0;
            expect(minutesRecorded).toBeGreaterThanOrEqual(1);
            expect(minutesRecorded).toBeLessThanOrEqual(25);
          }
        },
      ),
    );
  });
});

describe("stepTimer の性質：本文だけの変更", () => {
  const withEditOp = markdownLike.chain((body) => {
    const refs = todoBlocks(parseDocument(body).segments).map((block, index) =>
      card(index, block.head.text),
    );
    const ref = refs.length > 0 ? fc.constantFrom(...refs) : fc.constant(card(0, "- [ ] なし"));
    const edits: fc.Arbitrary<WorkEdits> = fc.record({
      updated: fc.constant([]),
      removed: fc.constant([]),
      added: fc.array(fc.integer({ min: 1, max: 60 }), { maxLength: 3 }),
    });
    return fc.tuple(
      fc.constant(body),
      fc.tuple(ref, edits).map(
        ([target, workEdits]): TimerOp => ({
          kind: "edit",
          command: (doc) => editWork(doc, target, workEdits),
        }),
      ),
    );
  });

  it("どんな本文とタイマーでも、本文だけの変更ではタイマーは変わらず、知らせることもない", () => {
    fc.assert(
      fc.property(
        withEditOp,
        fc.option(fc.constantFrom(...markdownTexts()), { nil: undefined }),
        fc.boolean(),
        fc.integer({ min: 0, max: 120 }),
        ([body, op], text, held, minutes) => {
          const timer = text === undefined ? undefined : running({ text, held });
          const result = stepTimer(timer, parseDocument(body), day, op, at(minutes));

          expect(result.timer).toBe(timer);
          expect(result.notice).toBeUndefined();
        },
      ),
    );
  });
});

/** 本文の作業時間の行 */
function workLines(body: string): string[] {
  return body.split(/\r?\n/).filter((line) => parseWorkEntry(line));
}

/** after にあって before にない行。同じ文字列の行は数で比べる */
function addedLines(before: string[], after: string[]): string[] {
  const rest = [...before];
  return after.filter((line) => {
    const i = rest.indexOf(line);
    if (i < 0) {
      return true;
    }
    rest.splice(i, 1);
    return false;
  });
}

function markdownTexts(): string[] {
  return ["- [/] b [est:: 2]", "- [/] 提案資料 [est:: 3]", "- [/] a"];
}

describe("parseTimer（保存領域から読んだ値）", () => {
  it("形の合う値をタイマーとして読む", () => {
    expect(parseTimer(running())).toEqual(running());
  });

  it.each([
    undefined,
    null,
    "timer",
    {},
    { ...running(), startedAt: "9:00" },
    { ...running(), dayKey: 20261105 },
    { ...running(), text: undefined },
    { ...running(), held: "no" },
  ])("形の合わない値（%j）は停止中として読む", (value) => {
    expect(parseTimer(value)).toBeUndefined();
  });

  it("余分な項目は読まない", () => {
    expect(parseTimer({ ...running(), extra: 1 })).toEqual(running());
  });
});

describe("startsTimer", () => {
  it("着手中へ動かす操作と「次のポモドーロを開始」だけが、新しく計測を始める", () => {
    expect(startsTimer({ kind: "move", card: review, status: "doing", position: 0 })).toBe(true);
    expect(startsTimer({ kind: "next", card: proposal })).toBe(true);
    expect(startsTimer({ kind: "move", card: review, status: "done", position: 0 })).toBe(false);
    expect(startsTimer({ kind: "move", card: review, status: "todo", position: 0 })).toBe(false);
    expect(startsTimer({ kind: "complete", card: proposal })).toBe(false);
    expect(startsTimer({ kind: "interrupt" })).toBe(false);
  });
});
