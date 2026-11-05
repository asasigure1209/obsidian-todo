import {
  addWork,
  completeCard,
  type DocumentCommand,
  isRejection,
  type LineRef,
  moveCard,
  type Rejection,
} from "@/domain/commands";
import {
  type DayDocument,
  formatTodoLine,
  parseTodoLine,
  type Status,
  todoBlocks,
  type WorkKind,
} from "@/domain/document";
import { POMODORO_MINUTES, recordableMinutes } from "@/domain/minutes";

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

/** タイマーに関わるきっかけ。move はボードのドラッグ、expire は毎秒の満了の判定、recheck は保留中の読み直し */
export type TimerOp =
  | { kind: "move"; card: LineRef; status: Status; position: number }
  | { kind: "complete"; card: LineRef }
  | { kind: "interrupt" }
  | { kind: "next"; card: LineRef }
  | { kind: "expire" }
  | { kind: "recheck" };

export interface TimerStep {
  result: DayDocument | Rejection;
  timer: Timer;
  notice?: "expired" | "discarded";
}

const POMODORO_MS = POMODORO_MINUTES * 60_000;
const STALE: Rejection = { rejected: "stale" };
const unchanged: DocumentCommand = (doc) => doc;

/** 1回の判定に使う材料。own はこの日のタイマー、target はその対象の行 */
interface Context {
  timer: Timer;
  own: RunningTimer | undefined;
  target: LineRef | undefined;
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
  const ctx: Context = { timer, own, target: own && findTarget(doc, own), doc, dayKey, now };
  switch (op.kind) {
    case "move":
      return move(ctx, op.card, op.status, op.position);
    case "complete":
      return onCard(ctx, op.card, "ポモドーロ", (d) => completeCard(d, op.card));
    case "interrupt":
      return ctx.target ? finish(ctx, "中断", unchanged) : judged(ctx, unchanged);
    case "next":
      return next(ctx, op.card);
    case "expire":
      return expire(ctx);
    case "recheck":
      return recheck(ctx);
  }
}

/** その日のファイルにただ1つある [/] の行で、文字列が一致するもの（AD-6） */
export function findTarget(doc: DayDocument, timer: RunningTimer): LineRef | undefined {
  const doing = todoBlocks(doc.segments)
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.todo.status === "doing");
  const only = doing.length === 1 ? doing[0] : undefined;
  return only?.block.head.text === timer.text ? { index: only.index, text: timer.text } : undefined;
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
  // 文字列が違えば command が stale で断るので、位置だけで比べればよい
  const isTarget = ctx.target?.index === card.index;
  return isTarget ? finish(ctx, kind, command) : judged(ctx, command);
}

/** 「次のポモドーロを開始」。着手中のカードにだけ使える */
function next(ctx: Context, card: LineRef): TimerStep {
  const block = todoBlocks(ctx.doc.segments)[card.index];
  const isDoing = block?.head.text === card.text && block.todo.status === "doing";
  return isDoing ? begin(ctx, card.text, unchanged) : { result: STALE, timer: ctx.timer };
}

/** 新しく計測を始める。前の計測は、対象が見つかれば中断として記録し、見つからなければ捨てて知らせる */
function begin(ctx: Context, text: string, command: DocumentCommand): TimerStep {
  const recorded = ctx.target ? record(ctx, ctx.target, "中断") : ctx.doc;
  const result = isRejection(recorded) ? recorded : command(recorded);
  if (isRejection(result)) {
    return { result, timer: ctx.timer };
  }
  const timer: RunningTimer = {
    dayKey: ctx.dayKey,
    startedAt: ctx.now,
    text: doingText(text),
    held: false,
  };
  return ctx.own && !ctx.target ? { result, timer, notice: "discarded" } : { result, timer };
}

function expire(ctx: Context): TimerStep {
  const due = ctx.own && !ctx.own.held && ctx.now - ctx.own.startedAt >= POMODORO_MS;
  if (!(due && ctx.own)) {
    return { result: ctx.doc, timer: ctx.timer };
  }
  return ctx.target
    ? { ...finish(ctx, "ポモドーロ", unchanged), notice: "expired" }
    : { result: ctx.doc, timer: { ...ctx.own, held: true } };
}

/** 保留中の読み直し。見つかれば保留を解き、25分を過ぎていれば確定する。見つからなければ待つ */
function recheck(ctx: Context): TimerStep {
  if (!(ctx.own && ctx.target)) {
    return { result: ctx.doc, timer: ctx.timer };
  }
  const unheld = { ...ctx.own, held: false };
  return expire({ ...ctx, timer: unheld, own: unheld });
}

/** 経過分を対象に記録してから command を当て、計測を止める */
function finish(ctx: Context, kind: WorkKind, command: DocumentCommand): TimerStep {
  const recorded = ctx.target ? record(ctx, ctx.target, kind) : ctx.doc;
  const result = isRejection(recorded) ? recorded : command(recorded);
  return { result, timer: isRejection(result) ? ctx.timer : undefined };
}

/** 対象と関係のない操作。操作のたびに対象を判定し、見つからなければ保留、保留中なら捨てる（AD-6） */
function judged(ctx: Context, command: DocumentCommand): TimerStep {
  const result = command(ctx.doc);
  if (isRejection(result) || !ctx.own) {
    return { result, timer: ctx.timer };
  }
  if (ctx.target) {
    return { result, timer: { ...ctx.own, held: false } };
  }
  return ctx.own.held
    ? { result, timer: undefined, notice: "discarded" }
    : { result, timer: { ...ctx.own, held: true } };
}

/** 1分未満は記録しない（design 8.1） */
function record(ctx: Context, target: LineRef, kind: WorkKind): DayDocument | Rejection {
  const minutes = recordableMinutes((ctx.own as RunningTimer).startedAt, ctx.now);
  return minutes > 0 ? addWork(ctx.doc, target, { minutes, kind }) : ctx.doc;
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
