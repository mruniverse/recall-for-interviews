import test from 'node:test';
import assert from 'node:assert/strict';
import { schedule } from '../src/scheduler/schedule.ts';

test('correct answers advance, partial and missed reset, recovery restarts at seven', () => {
  const first = schedule('2026-11-26', 0, 'correct');
  assert.deepEqual(first, { dueDate: '2026-12-03', streak: 1, intervalDays: 7 });
  const second = schedule(first.dueDate, first.streak, 'correct');
  assert.deepEqual(second, { dueDate: '2027-01-02', streak: 2, intervalDays: 30 });
  for (const rating of ['partial', 'missed']) {
    const reset = schedule(second.dueDate, second.streak, rating);
    assert.deepEqual(reset, { dueDate: '2027-01-03', streak: 0, intervalDays: 1 });
    assert.equal(schedule(reset.dueDate, reset.streak, 'correct').intervalDays, 7);
  }
});

test('uses calendar days across leap days, DST and host timezones', () => {
  assert.equal(schedule('2028-02-28', 0, 'missed').dueDate, '2028-02-29');
  assert.equal(schedule('2026-03-08', 0, 'missed').dueDate, '2026-03-09');
  assert.equal(schedule('2026-11-01', 0, 'correct').dueDate, '2026-11-08');
});

test('rejects impossible dates, invalid ratings and invalid streaks', () => {
  for (const date of ['2026-02-29', '2026-03-3', '9999-12-31']) {
    assert.throws(() => schedule(date, 0, 'missed'), RangeError);
  }
  assert.throws(() => schedule('2026-11-26', -1, 'correct'), RangeError);
  assert.throws(() => schedule('2026-11-26', 0, 'unknown'), RangeError);
});
