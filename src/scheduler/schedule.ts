export type Rating = 'correct' | 'partial' | 'missed';

export function schedule(attemptDate: string, correctStreak: number, rating: Rating) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(attemptDate) || attemptDate.startsWith('0000')) {
    throw new RangeError('Expected a civil date');
  }
  const date = new Date(`${attemptDate}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== attemptDate) {
    throw new RangeError('Invalid civil date');
  }
  if (!Number.isSafeInteger(correctStreak) || correctStreak < 0 || correctStreak === Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Invalid streak');
  }
  if (rating !== 'correct' && rating !== 'partial' && rating !== 'missed') {
    throw new RangeError('Invalid rating');
  }
  const streak = rating === 'correct' ? correctStreak + 1 : 0;
  const intervalDays = streak === 0 ? 1 : streak === 1 ? 7 : 30;
  date.setUTCDate(date.getUTCDate() + intervalDays);
  if (date.getUTCFullYear() > 9999) throw new RangeError('Date outside supported range');
  return { dueDate: date.toISOString().slice(0, 10), streak, intervalDays };
}
