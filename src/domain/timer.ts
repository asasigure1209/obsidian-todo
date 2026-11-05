import {
  addWork,
  completeCard,
  type DocumentCommand,
  findCard,
  isRejection,
  type LineRef,
  moveCard,
  type Rejection,
  STALE,
} from "@/domain/commands";
import { type DayDocument, todoBlocks } from "@/domain/document";
import { POMODORO_MS, recordableMinutes } from "@/domain/minutes";
import { formatTodoLine, parseTodoLine, type Status } from "@/domain/todo-line";
import type { WorkKind } from "@/domain/work-entry";

/** 計測中のタイマー（AD-6）。停止中は undefined */
export interface RunningTimer {
  dayKey: string;
  startedAt: number;
  /** 対象の行の文字列。その日のファイルにただ1つある [/] の行で、文字列が一致するものが対象 */
  text: string;
  /** 対象が見つからず、次の判定を待っている */
  held: boolean;
}

export type Timer = RunningTimer | undefined;

/**
 * タイマーに関わるきっかけ。move はボードのドラッグ、expire は毎秒の満了の判定、recheck は保留中の読み直し。
 * edit はタイマーを動かさない本文だけの変更（M2 の保存など）。同じ並びで書き込むためにここを通す
 */
export type TimerOp =
  | { kind: "move"; card: LineRef; status: Status; position: number }
  | { kind: "complete"; card: LineRef }
  | { kind: "interrupt" }
  | { kind: "next"; card: LineRef }
  | { kind: "expire" }
  | { kind: "recheck" }
  | { kind: "edit"; command: DocumentCommand };

export interface TimerStep {
  result: DayDocument | Rejection;
  timer: Timer;
  notice?: "expired" | "discarded";
}

const unchanged: DocumentCommand = (doc) => doc;

/** この日のタイマーと、その対象の行 */
export interface RunningTarget {
  timer: RunningTimer;
  target: LineRef;
}

/** 1回の判定に使う材料。own はこの日のタイマー、running はその対象が見つかったときの組 */
interface Context {
  timer: Timer;
  own: RunningTimer | undefined;
  running: RunningTarget | undefined;
  doc: DayDocument;
  dayKey: string;
  now: number;
}

/**
 * タイマーの状態遷移（design 8.1）。記録とカードの移動を1つの本文の変更にまとめて返す。
 * ほかの日のタイマーは、この日の本文では記録も判定もしない（着手中へ動かしたときは置き換える）
 */
export function stepTimer(
  timer: Timer,
  doc: DayDocument,
  dayKey: string,
  op: TimerOp,
  now: number,
): TimerStep {
  const own = timer?.dayKey === dayKey ? timer : undefined;
  const ctx: Context = { timer, own, running: runningTarget(timer, doc, dayKey), doc, dayKey, now };
  switch (op.kind) {
    case "move":
      return move(ctx, op.card, op.status, op.position);
    case "complete":
      return onCard(ctx, op.card, "ポモドーロ", (d) => completeCard(d, op.card));
    case "interrupt":
      return ctx.running ? finish(ctx, ctx.running, "中断", unchanged) : judged(ctx, unchanged);
    case "next":
      return next(ctx, op.card);
    case "expire":
      return expire(ctx);
    case "recheck":
      return recheck(ctx);
    case "edit":
      // タイマーを動かす操作ではないので、対象の判定はしない（design 8.1）
      return { result: op.command(doc), timer };
  }
}

/** この日のタイマーの対象。その日のファイルにただ1つある [/] の行で、文字列が一致するもの（AD-6） */
export function runningTarget(
  timer: Timer,
  doc: DayDocument,
  dayKey: string,
): RunningTarget | undefined {
  if (timer?.dayKey !== dayKey) {
    return undefined;
  }
  const doing = todoBlocks(doc.segments)
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.todo.status === "doing");
  const only = doing.length === 1 ? doing[0] : undefined;
  return only?.block.head.text === timer.text
    ? { timer, target: { index: only.index, text: timer.text } }
    : undefined;
}

/** 25分たって、満了を確定する時か。保留中は読み直しに任せる */
export function isDue(timer: Timer, now: number): timer is RunningTimer {
  return timer !== undefined && !timer.held && now - timer.startedAt >= POMODORO_MS;
}

/** 新しく計測を始める操作か */
export function startsTimer(op: TimerOp): boolean {
  return (op.kind === "move" && op.status === "doing") || op.kind === "next";
}

function move(ctx: Context, card: LineRef, status: Status, position: number): TimerStep {
  if (status === "doing") {
    return begin(ctx, card.text, (d) => moveCard(d, card, "doing", position));
  }
  const kind: WorkKind = status === "done" ? "ポモドーロ" : "中断";
  return onCard(ctx, card, kind, (d) => moveCard(d, card, status, position));
}

/** 計測中のカードへの操作なら経過分を記録して止め、ほかのカードなら計測はそのまま */
function onCard(ctx: Context, card: LineRef, kind: WorkKind, command: DocumentCommand): TimerStep {
  const running = ctx.running;
  // 文字列が違えば command が stale で断るので、位置だけで比べればよい
  return running?.target.index === card.index
    ? finish(ctx, running, kind, command)
    : judged(ctx, command);
}

/** 「次のポモドーロを開始」。着手中のカードにだけ使える */
function next(ctx: Context, card: LineRef): TimerStep {
  return findCard(ctx.doc, card)?.todo.status === "doing"
    ? begin(ctx, card.text, unchanged)
    : { result: STALE, timer: ctx.timer };
}

/** 新しく計測を始める。前の計測は、対象が見つかれば中断として記録し、見つからなければ捨てて知らせる */
function begin(ctx: Context, text: string, command: DocumentCommand): TimerStep {
  const result = recordThen(ctx, ctx.running, "中断", command);
  if (isRejection(result)) {
    return { result, timer: ctx.timer };
  }
  const timer: RunningTimer = {
    dayKey: ctx.dayKey,
    startedAt: ctx.now,
    text: doingText(text),
    held: false,
  };
  return ctx.own && !ctx.running ? { result, timer, notice: "discarded" } : { result, timer };
}

function expire(ctx: Context): TimerStep {
  if (!isDue(ctx.own, ctx.now)) {
    return { result: ctx.doc, timer: ctx.timer };
  }
  return ctx.running
    ? { ...finish(ctx, ctx.running, "ポモドーロ", unchanged), notice: "expired" }
    : { result: ctx.doc, timer: { ...ctx.own, held: true } };
}

/** 保留中の読み直し。見つかれば保留を解き、25分を過ぎていれば確定する。見つからなければ待つ */
function recheck(ctx: Context): TimerStep {
  if (!ctx.running) {
    return { result: ctx.doc, timer: ctx.timer };
  }
  const timer = { ...ctx.running.timer, held: false };
  return expire({ ...ctx, timer, own: timer, running: { ...ctx.running, timer } });
}

/** 経過分を対象に記録してから command を当て、計測を止める */
function finish(
  ctx: Context,
  running: RunningTarget,
  kind: WorkKind,
  command: DocumentCommand,
): TimerStep {
  const result = recordThen(ctx, running, kind, command);
  return { result, timer: isRejection(result) ? ctx.timer : undefined };
}

/** 対象と関係のない操作。操作のたびに対象を判定し、見つからなければ保留、保留中なら捨てる（AD-6） */
function judged(ctx: Context, command: DocumentCommand): TimerStep {
  const result = command(ctx.doc);
  if (isRejection(result) || !ctx.own) {
    return { result, timer: ctx.timer };
  }
  if (ctx.running) {
    return { result, timer: { ...ctx.own, held: false } };
  }
  return ctx.own.held
    ? { result, timer: undefined, notice: "discarded" }
    : { result, timer: { ...ctx.own, held: true } };
}

/** 対象があれば経過分を記録してから command を当てる。1分未満は記録しない（design 8.1） */
function recordThen(
  ctx: Context,
  running: RunningTarget | undefined,
  kind: WorkKind,
  command: DocumentCommand,
): DayDocument | Rejection {
  const minutes = running ? recordableMinutes(running.timer.startedAt, ctx.now) : 0;
  const recorded =
    running && minutes > 0 ? addWork(ctx.doc, running.target, { minutes, kind }) : ctx.doc;
  return isRejection(recorded) ? recorded : command(recorded);
}

/** 着手中へ動かした後の行の文字列 */
function doingText(text: string): string {
  const todo = parseTodoLine(text);
  return todo ? formatTodoLine({ ...todo, status: "doing" }) : text;
}

/** 保存領域から読んだ値をタイマーにする。形が合わなければ停止中（プラグインの更新や手での編集で崩れていても動くように） */
export function parseTimer(value: unknown): Timer {
  const object = typeof value === "object" && value !== null ? value : {};
  const { dayKey, startedAt, text, held } = object as Partial<RunningTimer>;
  const valid =
    typeof dayKey === "string" &&
    typeof startedAt === "number" &&
    typeof text === "string" &&
    typeof held === "boolean";
  return valid ? { dayKey, startedAt, text, held } : undefined;
}
