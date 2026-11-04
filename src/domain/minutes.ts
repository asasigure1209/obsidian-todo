export const POMODORO_MINUTES = 25;

/**
 * 記録する分数を求める（design 8.1）。
 * 分未満は切り捨て、上限は1ポモドーロ。0 のときは記録しない。
 */
export function recordableMinutes(startedAt: number, now: number): number {
  const elapsed = Math.floor((now - startedAt) / 60_000);
  return Math.min(Math.max(elapsed, 0), POMODORO_MINUTES);
}
