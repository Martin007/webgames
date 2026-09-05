export const DAY_MS = 86_400_000;
export const TRIVIAIRE_EPOCH = Date.UTC(2026, 8, 5);
export const utcDay = (date = new Date()): string => date.toISOString().slice(0, 10);
export const challengeNumber = (day: string): number =>
  Math.max(1, Math.floor((Date.parse(`${day}T00:00:00Z`) - TRIVIAIRE_EPOCH) / DAY_MS) + 1);
export const untilReset = (now = new Date()): number =>
  DAY_MS - (now.getTime() % DAY_MS);
export const countdown = (ms: number): string => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((n) => String(n).padStart(2, '0')).join(':');
};
export const displayDay = (day: string): string =>
  new Intl.DateTimeFormat('en', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'})
    .format(new Date(`${day}T00:00:00Z`));
