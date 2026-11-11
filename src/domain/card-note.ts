import type { Card } from "@/domain/board";
import type { Status } from "@/domain/document/todo-line";

/** カードの見え方。着手中は計測中か停止中かで分ける */
export type CardPhase = "todo" | "running" | "stopped" | "done";

type Figures = Pick<Card, "estimate" | "workedMinutes" | "pomodoros">;

/** 見積もりの前に置く部分。何も置かないなら undefined */
const LEADS: Record<CardPhase, (card: Figures) => string | undefined> = {
  todo: () => undefined,
  // 何個目かは、そのカードのポモドーロの行の数＋1（中断と手動は数えない）
  running: (card) => `${card.pomodoros + 1}個目のポモドーロ`,
  stopped: (card) => (card.pomodoros > 0 ? `${card.pomodoros}個目が終わりました` : undefined),
  done: (card) => `実績 ${card.workedMinutes}分`,
};

/**
 * カードの名前の下に出す1行（design 5章 M1）。「2個目のポモドーロ ／ 見積 3」のように並べる。
 * 見積もりのない TODO は見積を出さない。出すものがなければ空文字
 */
export function cardNote(card: Figures, phase: CardPhase): string {
  const estimate = card.estimate && `見積 ${card.estimate}`;
  return [LEADS[phase](card), estimate].filter(Boolean).join(" ／ ");
}

/** カードの見え方。着手中は、そのカードを計測しているかで計測中と停止中に分かれる */
export function cardPhase(status: Status, running: boolean): CardPhase {
  if (status !== "doing") {
    return status;
  }
  return running ? "running" : "stopped";
}
