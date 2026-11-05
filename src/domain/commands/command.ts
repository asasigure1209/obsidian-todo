import {
  type DayDocument,
  parseDocument,
  serializeDocument,
  type TodoBlock,
  todoBlocks,
} from "@/domain/document/body";

/** 操作の対象の行。n 番目の TODO ブロック（またはカードの中で n 番目の作業時間の行）と、その行の文字列（AD-5） */
export interface LineRef {
  index: number;
  text: string;
}

/**
 * 何もしなかった理由。
 * - stale：対象の位置と行の文字列が最新の本文と一致しない（読み直して再表示する）
 * - invalid：入力が書式にならない（空の名前、0分など）
 * - unstable：書き戻して読み直すと区切りが変わる（先頭に来た `---` が frontmatter になる、など）
 */
export interface Rejection {
  rejected: "stale" | "invalid" | "unstable";
}

export type CommandResult = DayDocument | Rejection;

/** 1回の操作 */
export type DocumentCommand = (doc: DayDocument) => CommandResult;

export const STALE: Rejection = { rejected: "stale" };
export const INVALID: Rejection = { rejected: "invalid" };
const UNSTABLE: Rejection = { rejected: "unstable" };

/** コマンドの結果（DayDocument）にも、applyToBody の結果（本文の文字列）にも使える */
export function isRejection<T extends object | string>(result: T | Rejection): result is Rejection {
  return typeof result === "object" && "rejected" in result;
}

/** `vault.process` に渡す形。読み直すと区切りが変わる結果は書き込まない（AD-5 と同じく、ずれたら何もしない） */
export function applyToBody(body: string, command: DocumentCommand): string | Rejection {
  const next = command(parseDocument(body));
  if (isRejection(next)) {
    return next;
  }
  const written = serializeDocument(next);
  return layoutOf(parseDocument(written)) === layoutOf(next) ? written : UNSTABLE;
}

/** 位置と行の文字列が一致する TODO ブロック。一致しなければ undefined（AD-5） */
export function findCard(doc: DayDocument, card: LineRef): TodoBlock | undefined {
  const block = todoBlocks(doc.segments)[card.index];
  return block?.head.text === card.text ? block : undefined;
}

/** カードのブロックを、その位置のまま置き換える */
export function updateBlock(
  doc: DayDocument,
  card: LineRef,
  update: (block: TodoBlock) => TodoBlock | Rejection,
): CommandResult {
  const target = findCard(doc, card);
  const next = target ? update(target) : STALE;
  return isRejection(next)
    ? next
    : { ...doc, segments: doc.segments.map((segment) => (segment === target ? next : segment)) };
}

/** 入力した名前やメモを1行にする。改行と続く空白は1つの空白にまとめる */
export function singleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * frontmatter と区切りごとの行の文字列。キーの順番に左右されないよう配列だけで表す。
 * TODO 行の文字列は必ず TODO ブロックとして読まれるので、区切りの種類は持たなくてよい
 */
function layoutOf(doc: DayDocument): string {
  return JSON.stringify([
    doc.frontmatter.map((line) => line.text),
    doc.segments.map((segment) =>
      segment.kind === "todo"
        ? [segment.head, ...segment.children].map((line) => line.text)
        : [segment.line.text],
    ),
  ]);
}
