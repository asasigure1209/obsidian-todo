export const POMODORO_MINUTES = 25;
export const HOUR_MINUTES = 60;
export const DAY_MINUTES = 24 * HOUR_MINUTES;
export const MINUTE_MS = 60_000;
export const POMODORO_MS = POMODORO_MINUTES * MINUTE_MS;

/**
 * 記録する分数を求める（design 8.1）。
 * 分未満は切り捨て、上限は1ポモドーロ。0 のときは記録しない。
 */
export function recordableMinutes(startedAt: number, now: number): number {
  const elapsed = Math.floor((now - startedAt) / MINUTE_MS);
  return Math.min(Math.max(elapsed, 0), POMODORO_MINUTES);
}

/** 小数1桁に四捨五入する。引き算の誤差（2.3 − 1 = 1.2999…）もここで消す */
export function roundTenths(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 分数をポモドーロに換算する（M2 の合計、M3 の実績）。小数1桁に四捨五入 */
export function pomodoroEquivalent(minutes: number): number {
  return roundTenths(minutes / POMODORO_MINUTES);
}

/** 分数がポモドーロ何個分か。25分で割って切り捨てる（多めに出さない） */
export function toPomodoros(minutes: number): number {
  return Math.floor(minutes / POMODORO_MINUTES);
}
