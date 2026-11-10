export const POMODORO_MINUTES = 25;
export const HOUR_MINUTES = 60;
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

/** 分数をポモドーロに換算する（M2 の合計）。小数1桁に四捨五入 */
export function pomodoroEquivalent(minutes: number): number {
  return Math.round((minutes / POMODORO_MINUTES) * 10) / 10;
}
