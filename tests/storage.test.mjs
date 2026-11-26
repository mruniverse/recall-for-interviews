import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  MAX_LOCK_RETRIES,
  NEW_CARDS_PER_DAY,
  StorageBusyError,
  localCivilDate,
  openStorage,
} from '../src/storage/storage.ts';

const NY = 'America/New_York';
const DECK = 'software-engineering';

// expo-sqlite 58's async surface over node:sqlite, so the production SQL and transaction code run
// unchanged. Each call yields first, like the native bridge, so unserialized work would interleave.
// Opened with SQLite's defaults, as Expo opens: foreign keys off, no busy timeout.
function expoSqlite(dir, hooks = {}) {
  const log = [];
  const handles = [];
  async function openDatabaseAsync(name, options) {
    assert.deepEqual(options, { useNewConnection: true });
    const raw = new DatabaseSync(path.join(dir, name), { enableForeignKeyConstraints: false });
    handles.push(raw);
    const call = async (source, run) => {
      await new Promise((resolve) => setImmediate(resolve));
      log.push(source);
      hooks.beforeStatement?.(source);
      return run();
    };
    return {
      execAsync: (source) => call(source, () => void raw.exec(source)),
      runAsync: (source, params) =>
        call(source, () => ({ changes: Number(raw.prepare(source).run(params).changes) })),
      getFirstAsync: (source, params) => call(source, () => raw.prepare(source).get(params) ?? null),
      getAllAsync: (source, params) => call(source, () => raw.prepare(source).all(params)),
      closeAsync: () => call('close', () => raw.close()),
    };
  }
  return { log, handles, openDatabaseAsync };
}

function setup(t, { hooks, busyTimeoutMs = 1000 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recall-storage-'));
  const expo = expoSqlite(dir, hooks);
  const opened = [];
  t.after(async () => {
    for (const storage of opened) await storage.close().catch(() => undefined);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return {
    expo,
    file: path.join(dir, 'recall.db'),
    async open() {
      const storage = await openStorage(expo.openDatabaseAsync, 'recall.db', busyTimeoutMs);
      opened.push(storage);
      return storage;
    },
  };
}

let nextId = 0;
function attempt(overrides = {}) {
  return {
    attemptId: `attempt-${++nextId}`,
    deckId: DECK,
    cardId: 'l7-vs-l4',
    deckRevision: 3,
    expectedRevision: 0,
    rating: 'correct',
    attemptedAt: new Date('2026-11-26T15:00:00Z'),
    timeZone: NY,
    ...overrides,
  };
}

function inspect(file, sql) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return db.prepare(sql).all().map((row) => ({ ...row }));
  } finally {
    db.close();
  }
}

const today = (storage, cardIds, now, timeZone = NY, deckId = DECK) =>
  storage.loadToday({ deckId, cardIds, now: new Date(now), timeZone });

test('migrates an empty database forward once and keeps progress across relaunch', async (t) => {
  const env = setup(t);
  const first = await env.open();
  assert.deepEqual(inspect(env.file, 'PRAGMA user_version'), [{ user_version: 1 }]);
  const { attempt: saved } = await first.commitAttempt(attempt());
  await first.close();

  const relaunched = await env.open();
  assert.deepEqual(inspect(env.file, 'PRAGMA user_version'), [{ user_version: 1 }]);
  assert.deepEqual(await today(relaunched, ['l7-vs-l4'], '2026-11-27T15:00:00Z'), {
    today: '2026-11-27',
    due: [],
    new: [],
    nextDueDate: saved.dueDate,
  });
  assert.deepEqual(inspect(env.file, 'SELECT count(*) AS n FROM review_attempt'), [{ n: 1 }]);
});

test('refuses a database from a newer schema without touching it', async (t) => {
  const env = setup(t);
  const newer = new DatabaseSync(env.file);
  newer.exec('PRAGMA user_version = 2');
  newer.close();
  await assert.rejects(env.open(), /newer than this app/);
  assert.deepEqual(inspect(env.file, 'PRAGMA user_version'), [{ user_version: 2 }]);
  assert.deepEqual(inspect(env.file, "SELECT name FROM sqlite_master WHERE type = 'table'"), []);
});

test('rolls back a failed migration without bumping the schema version', async (t) => {
  const env = setup(t);
  const conflicting = new DatabaseSync(env.file);
  conflicting.exec('CREATE TABLE review_attempt (legacy TEXT)');
  conflicting.close();
  await assert.rejects(env.open(), /already exists/);
  assert.deepEqual(inspect(env.file, 'PRAGMA user_version'), [{ user_version: 0 }]);
  assert.deepEqual(inspect(env.file, "SELECT name FROM sqlite_master WHERE type = 'table'"), [
    { name: 'review_attempt' },
  ]);
});

test('configures the dedicated connection before its first BEGIN and only begins IMMEDIATE', async (t) => {
  const env = setup(t, { busyTimeoutMs: 1234 });
  const storage = await env.open();
  await storage.commitAttempt(attempt());
  await storage.commitAttempt(attempt({ expectedRevision: 5 }));

  const { log, handles } = env.expo;
  assert.equal(handles.length, 1);
  const pragmas = log.findIndex((source) => source.includes('PRAGMA foreign_keys = ON'));
  assert.ok(pragmas >= 0 && pragmas < log.indexOf('BEGIN IMMEDIATE'));
  assert.deepEqual([...new Set(log.filter((source) => /^\s*BEGIN/i.test(source)))], ['BEGIN IMMEDIATE']);

  const [raw] = handles;
  const pragma = (name) => Object.values(raw.prepare(`PRAGMA ${name}`).get())[0];
  assert.equal(pragma('foreign_keys'), 1);
  assert.equal(pragma('busy_timeout'), 1234);
  assert.equal(pragma('journal_mode'), 'wal');
  assert.equal(pragma('synchronous'), 2);
  assert.throws(
    () =>
      raw.exec(`INSERT INTO review_attempt VALUES ('orphan', '${DECK}', 'missing', 1, 'correct',
        '2026-11-26T15:00:00.000Z', '${NY}', '2026-11-26', 7, 1, '2026-12-03', 1)`),
    /FOREIGN KEY/,
  );
});

test('schedules from the attempt civil date and records the attempt with its resulting state', async (t) => {
  const storage = await setup(t).open();
  const first = await storage.commitAttempt(attempt({ attemptId: 'a1' }));
  assert.deepEqual(first, {
    status: 'committed',
    attempt: {
      attemptId: 'a1',
      deckId: DECK,
      cardId: 'l7-vs-l4',
      deckRevision: 3,
      rating: 'correct',
      attemptedAt: '2026-11-26T15:00:00.000Z',
      timeZone: NY,
      civilDate: '2026-11-26',
      intervalDays: 7,
      streak: 1,
      dueDate: '2026-12-03',
      revision: 1,
    },
  });
  const second = await storage.commitAttempt(
    attempt({ expectedRevision: 1, attemptedAt: new Date('2026-12-03T14:00:00Z') }),
  );
  assert.deepEqual(
    [second.attempt.intervalDays, second.attempt.streak, second.attempt.dueDate, second.attempt.revision],
    [30, 2, '2027-01-02', 2],
  );
  const partial = await storage.commitAttempt(
    attempt({ expectedRevision: 2, rating: 'partial', attemptedAt: new Date('2027-01-02T14:00:00Z') }),
  );
  assert.deepEqual(
    [partial.attempt.intervalDays, partial.attempt.streak, partial.attempt.dueDate, partial.attempt.revision],
    [1, 0, '2027-01-03', 3],
  );
});

test('returns the recorded result for a repeated attempt ID, including concurrent submits', async (t) => {
  const env = setup(t);
  const storage = await env.open();
  const input = attempt({ cardId: 'tcp-handshake' });
  const results = await Promise.all(Array.from({ length: 5 }, () => storage.commitAttempt(input)));
  for (const result of results) assert.deepEqual(result, results[0]);
  assert.equal(results[0].status, 'committed');

  const retried = await storage.commitAttempt({ ...input, rating: 'missed' });
  assert.deepEqual(retried, results[0]);
  await assert.rejects(storage.commitAttempt({ ...input, cardId: 'b-tree' }), /another card/);

  assert.deepEqual(inspect(env.file, 'SELECT attempt_id FROM review_attempt'), [{ attempt_id: input.attemptId }]);
  assert.deepEqual(inspect(env.file, 'SELECT card_id, revision FROM card_progress'), [
    { card_id: 'tcp-handshake', revision: 1 },
  ]);
});

test('serializes concurrent commits for different cards on the shared connection', async (t) => {
  const env = setup(t);
  const storage = await env.open();
  const cards = ['a', 'b', 'c', 'd'];
  const results = await Promise.all(cards.map((cardId) => storage.commitAttempt(attempt({ cardId }))));
  assert.deepEqual(results.map((result) => result.status), ['committed', 'committed', 'committed', 'committed']);
  assert.deepEqual(inspect(env.file, 'SELECT count(*) AS n FROM review_attempt'), [{ n: 4 }]);
});

test('rejects stale progress revisions without writing and the reloaded queue shows the truth', async (t) => {
  const env = setup(t);
  const storage = await env.open();
  await storage.commitAttempt(attempt({ cardId: 'cap' }));
  const before = inspect(env.file, 'SELECT * FROM card_progress');

  for (const stale of [
    attempt({ cardId: 'cap', expectedRevision: 0, rating: 'missed' }),
    attempt({ cardId: 'cap', expectedRevision: 2, rating: 'missed' }),
    attempt({ cardId: 'raft', expectedRevision: 1 }),
  ]) {
    assert.deepEqual(await storage.commitAttempt(stale), { status: 'stale' });
  }
  assert.deepEqual(inspect(env.file, 'SELECT * FROM card_progress'), before);
  assert.deepEqual(inspect(env.file, 'SELECT count(*) AS n FROM review_attempt'), [{ n: 1 }]);
  assert.deepEqual(await today(storage, ['cap', 'raft'], '2026-11-26T20:00:00Z'), {
    today: '2026-11-26',
    due: [],
    new: [{ cardId: 'raft', revision: 0 }],
    nextDueDate: '2026-12-03',
  });
});

test('retries lock contention at most three times, then commits on a retry with the same ID', async (t) => {
  const env = setup(t, { busyTimeoutMs: 5 });
  const storage = await env.open();
  const blocker = new DatabaseSync(env.file);
  t.after(() => blocker.close());
  blocker.exec('BEGIN IMMEDIATE');

  const input = attempt();
  const mark = env.expo.log.length;
  await assert.rejects(storage.commitAttempt(input), (error) => {
    assert.ok(error instanceof StorageBusyError);
    assert.match(error.cause.message, /database is locked/);
    return true;
  });
  const begins = env.expo.log.slice(mark).filter((source) => source === 'BEGIN IMMEDIATE');
  assert.equal(begins.length, 1 + MAX_LOCK_RETRIES);
  blocker.exec('ROLLBACK');
  assert.deepEqual(inspect(env.file, 'SELECT count(*) AS n FROM card_progress'), [{ n: 0 }]);

  const committed = await storage.commitAttempt(input);
  assert.equal(committed.status, 'committed');
  assert.deepEqual(await storage.commitAttempt(input), committed);
  assert.deepEqual(inspect(env.file, 'SELECT count(*) AS n FROM review_attempt'), [{ n: 1 }]);
});

test('commits when the lock clears within the retry budget', async (t) => {
  let blocker;
  let begins = 0;
  const env = setup(t, {
    busyTimeoutMs: 5,
    hooks: {
      beforeStatement(source) {
        if (blocker && source === 'BEGIN IMMEDIATE' && ++begins === 3) blocker.exec('ROLLBACK');
      },
    },
  });
  const storage = await env.open();
  blocker = new DatabaseSync(env.file);
  t.after(() => blocker.close());
  blocker.exec('BEGIN IMMEDIATE');

  const result = await storage.commitAttempt(attempt());
  assert.equal(result.status, 'committed');
  assert.equal(begins, 3);
});

test('rolls back a write interrupted by contention and reruns from the attempt-ID read', async (t) => {
  let interrupted = false;
  const env = setup(t, {
    hooks: {
      beforeStatement(source) {
        if (!interrupted && source.trimStart().startsWith('INSERT INTO review_attempt')) {
          interrupted = true;
          throw new Error('Error code 5: database is locked');
        }
      },
    },
  });
  const storage = await env.open();
  const result = await storage.commitAttempt(attempt({ attemptId: 'interrupted' }));
  assert.ok(interrupted);
  assert.equal(result.attempt.revision, 1);
  assert.deepEqual(inspect(env.file, 'SELECT revision FROM card_progress'), [{ revision: 1 }]);

  const { log } = env.expo;
  const lastBegin = log.lastIndexOf('BEGIN IMMEDIATE');
  assert.ok(log.slice(0, lastBegin).includes('ROLLBACK'));
  assert.match(log[lastBegin + 1], /FROM review_attempt WHERE attempt_id/);
});

test('builds today: due by date then ID, new cards in deck order within the daily budget', async (t) => {
  const storage = await setup(t).open();
  assert.deepEqual(await today(storage, [], '2026-11-26T15:00:00Z'), {
    today: '2026-11-26',
    due: [],
    new: [],
    nextDueDate: null,
  });

  const at = (day) => new Date(`${day}T15:00:00Z`);
  await storage.commitAttempt(attempt({ cardId: 'c03', rating: 'missed', attemptedAt: at('2026-11-20') }));
  await storage.commitAttempt(attempt({ cardId: 'c02', rating: 'missed', attemptedAt: at('2026-11-20') }));
  await storage.commitAttempt(attempt({ cardId: 'c01', rating: 'missed', attemptedAt: at('2026-11-24') }));
  await storage.commitAttempt(attempt({ cardId: 'c04', attemptedAt: at('2026-11-25') }));
  const deck = Array.from({ length: 12 }, (_, i) => `c${String(i + 1).padStart(2, '0')}`);
  const due = [
    { cardId: 'c02', revision: 1 },
    { cardId: 'c03', revision: 1 },
    { cardId: 'c01', revision: 1 },
  ];

  const morning = await today(storage, deck, '2026-11-26T13:00:00Z');
  assert.deepEqual(morning.due, due);
  assert.equal(morning.new.length, NEW_CARDS_PER_DAY);
  assert.deepEqual(morning.new.map((card) => card.cardId), ['c05', 'c06', 'c07', 'c08', 'c09']);
  assert.equal(morning.nextDueDate, '2026-12-02');

  await storage.commitAttempt(attempt({ cardId: 'c05' }));
  await storage.commitAttempt(attempt({ cardId: 'c06' }));
  await storage.commitAttempt(attempt({ cardId: 'c01', expectedRevision: 1 }));
  const later = await today(storage, deck, '2026-11-26T22:00:00Z');
  assert.deepEqual(later.due, due.slice(0, 2));
  assert.deepEqual(later.new.map((card) => card.cardId), ['c07', 'c08', 'c09']);

  const withoutArchived = await today(storage, deck.filter((id) => id !== 'c02'), '2026-11-26T22:00:00Z');
  assert.deepEqual(withoutArchived.due, [{ cardId: 'c03', revision: 1 }]);

  const otherDeck = await today(storage, ['c01'], '2026-11-26T22:00:00Z', NY, 'other-deck');
  assert.deepEqual(otherDeck.new, [{ cardId: 'c01', revision: 0 }]);
  assert.deepEqual(otherDeck.due, []);
});

test('reports caught up with the next due date when nothing is due and no new cards remain', async (t) => {
  const storage = await setup(t).open();
  await storage.commitAttempt(attempt({ cardId: 'x' }));
  await storage.commitAttempt(attempt({ cardId: 'y', rating: 'missed' }));
  const result = await today(storage, ['x', 'y'], '2026-11-26T23:00:00Z');
  assert.deepEqual(result, { today: '2026-11-26', due: [], new: [], nextDueDate: '2026-11-27' });
});

test('derives New York civil dates across DST transitions and midnight', () => {
  const cases = {
    '2026-03-08T04:59:59Z': '2026-03-07',
    '2026-03-08T05:00:00Z': '2026-03-08',
    '2026-03-09T03:59:59Z': '2026-03-08',
    '2026-03-09T04:00:00Z': '2026-03-09',
    '2026-11-01T05:30:00Z': '2026-11-01',
    '2026-11-01T06:30:00Z': '2026-11-01',
    '2026-11-02T04:59:59Z': '2026-11-01',
    '2026-11-02T05:00:00Z': '2026-11-02',
  };
  for (const [instant, date] of Object.entries(cases)) {
    assert.equal(localCivilDate(new Date(instant), NY), date, instant);
  }
  assert.throws(() => localCivilDate(new Date('2026-11-26T00:00:00Z'), 'Not/A_Zone'), RangeError);
});

test('keeps stored dates when the device timezone changes', async (t) => {
  const env = setup(t);
  const storage = await env.open();
  const first = await storage.commitAttempt(
    attempt({ attemptId: 'ny', attemptedAt: new Date('2026-03-08T04:30:00Z') }),
  );
  assert.deepEqual([first.attempt.civilDate, first.attempt.dueDate], ['2026-03-07', '2026-03-14']);

  const instant = '2026-03-14T03:30:00Z';
  const inNewYork = await today(storage, ['l7-vs-l4'], instant, NY);
  assert.deepEqual([inNewYork.today, inNewYork.due, inNewYork.nextDueDate], ['2026-03-13', [], '2026-03-14']);
  const inTokyo = await today(storage, ['l7-vs-l4'], instant, 'Asia/Tokyo');
  assert.deepEqual(
    [inTokyo.today, inTokyo.due, inTokyo.nextDueDate],
    ['2026-03-14', [{ cardId: 'l7-vs-l4', revision: 1 }], null],
  );

  const second = await storage.commitAttempt(
    attempt({ expectedRevision: 1, attemptedAt: new Date(instant), timeZone: 'Asia/Tokyo' }),
  );
  assert.deepEqual([second.attempt.civilDate, second.attempt.dueDate], ['2026-03-14', '2026-04-13']);
  assert.deepEqual(
    inspect(env.file, "SELECT time_zone, civil_date, due_date FROM review_attempt WHERE attempt_id = 'ny'"),
    [{ time_zone: NY, civil_date: '2026-03-07', due_date: '2026-03-14' }],
  );
  await assert.rejects(storage.commitAttempt(attempt({ timeZone: 'Not/A_Zone' })), RangeError);
  assert.deepEqual(inspect(env.file, 'SELECT count(*) AS n FROM review_attempt'), [{ n: 2 }]);
});
