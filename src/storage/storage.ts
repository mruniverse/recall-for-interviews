import { schedule, type Rating } from '../scheduler/schedule.ts';
import { MIGRATIONS } from './schema.ts';

export const NEW_CARDS_PER_DAY = 5;
export const MAX_LOCK_RETRIES = 3;

type BindParams = Record<string, string | number | null>;

/** The subset of expo-sqlite 58 `SQLiteDatabase` used here; Node tests adapt `node:sqlite` to it. */
export interface SQLiteConnection {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: BindParams): Promise<{ changes: number }>;
  getFirstAsync<T>(source: string, params: BindParams): Promise<T | null>;
  getAllAsync<T>(source: string, params: BindParams): Promise<T[]>;
  closeAsync(): Promise<void>;
}

/** Shape of expo-sqlite's `openDatabaseAsync`. */
export type OpenDatabase = (
  name: string,
  options: { useNewConnection: true },
) => Promise<SQLiteConnection>;

export interface AttemptInput {
  attemptId: string;
  deckId: string;
  cardId: string;
  deckRevision: number;
  /** Progress revision shown with the prompt (`QueueCard.revision`); 0 for a new card. */
  expectedRevision: number;
  rating: Rating;
  attemptedAt: Date;
  /** IANA zone of the device at the attempt, e.g. `America/New_York`. */
  timeZone: string;
}

export interface Attempt {
  attemptId: string;
  deckId: string;
  cardId: string;
  deckRevision: number;
  rating: Rating;
  /** UTC instant, ISO 8601. */
  attemptedAt: string;
  timeZone: string;
  civilDate: string;
  intervalDays: number;
  streak: number;
  dueDate: string;
  /** Progress revision this attempt produced. */
  revision: number;
}

/** `stale`: the card's progress moved since the prompt was shown; nothing was written, reload the queue. */
export type CommitResult = { status: 'committed'; attempt: Attempt } | { status: 'stale' };

export interface QueueCard {
  cardId: string;
  revision: number;
}

export interface TodayInput {
  deckId: string;
  /** Active cards in deck order; progress for IDs missing here (archived) is kept but not queued. */
  cardIds: readonly string[];
  now: Date;
  timeZone: string;
}

export interface Today {
  today: string;
  /** Due on or before today, by due date then card ID. */
  due: QueueCard[];
  /** Never-attempted cards in deck order, capped by today's remaining new-card budget. */
  new: QueueCard[];
  /** Earliest due date after today among active cards; null when none. */
  nextDueDate: string | null;
}

export interface Storage {
  commitAttempt(input: AttemptInput): Promise<CommitResult>;
  loadToday(input: TodayInput): Promise<Today>;
  close(): Promise<void>;
}

/** The write lock stayed taken through every retry; keep the feedback and retry with the same attempt ID. */
export class StorageBusyError extends Error {
  name = 'StorageBusyError';

  constructor(cause: unknown) {
    super('Database is locked; retry with the same attempt ID', { cause });
  }
}

/** Local calendar date (YYYY-MM-DD) of `instant` in `timeZone`. */
export function localCivilDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  const date = `${part('year')}-${part('month')}-${part('day')}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError('Date outside supported range');
  return date;
}

/**
 * Opens a dedicated connection (never expo-sqlite's shared cached one), applies its PRAGMAs before
 * any transaction, migrates, and serializes every later operation on it.
 */
export async function openStorage(
  openDatabase: OpenDatabase,
  name: string,
  busyTimeoutMs = 1000,
): Promise<Storage> {
  if (!Number.isSafeInteger(busyTimeoutMs) || busyTimeoutMs < 0) {
    throw new RangeError('Invalid busy timeout');
  }
  const db = await openDatabase(name, { useNewConnection: true });
  try {
    // Connection-scoped (foreign_keys is ignored inside a transaction): set on this handle before BEGIN.
    await db.execAsync(
      'PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON; ' +
        `PRAGMA busy_timeout = ${busyTimeoutMs};`,
    );
    await writeTransaction(db, () => migrate(db));
  } catch (error) {
    await db.closeAsync().catch(() => undefined);
    throw error;
  }

  let tail: Promise<unknown> = Promise.resolve();
  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const run = tail.then(operation);
    tail = run.catch(() => undefined);
    return run;
  };

  return {
    async commitAttempt(input) {
      const civilDate = localCivilDate(input.attemptedAt, input.timeZone);
      const attemptedAt = input.attemptedAt.toISOString();
      return serialize(() => writeTransaction(db, () => commit(db, input, civilDate, attemptedAt)));
    },
    async loadToday(input) {
      const today = localCivilDate(input.now, input.timeZone);
      return serialize(() => readToday(db, input, today));
    },
    close: () => serialize(() => db.closeAsync()),
  };
}

async function migrate(db: SQLiteConnection): Promise<void> {
  const version = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', {}))!
    .user_version;
  if (version > MIGRATIONS.length) {
    throw new Error(`Database schema ${version} is newer than this app (${MIGRATIONS.length})`);
  }
  if (version === MIGRATIONS.length) return;
  for (const migration of MIGRATIONS.slice(version)) await db.execAsync(migration);
  await db.execAsync(`PRAGMA user_version = ${MIGRATIONS.length}`);
}

// expo-sqlite 58's exclusive helper sends a plain deferred BEGIN on a fresh connection without these
// PRAGMAs; take the write lock up front instead and, on contention, rerun the whole operation.
async function writeTransaction<T>(db: SQLiteConnection, operation: () => Promise<T>): Promise<T> {
  for (let retries = 0; ; retries++) {
    try {
      await db.execAsync('BEGIN IMMEDIATE');
      const result = await operation();
      await db.execAsync('COMMIT');
      return result;
    } catch (error) {
      await db.execAsync('ROLLBACK').catch(() => undefined);
      if (!/database (table )?is locked/.test(String((error as Error)?.message))) throw error;
      if (retries === MAX_LOCK_RETRIES) throw new StorageBusyError(error);
    }
  }
}

type AttemptRow = {
  attempt_id: string;
  deck_id: string;
  card_id: string;
  deck_revision: number;
  rating: Rating;
  attempted_at: string;
  time_zone: string;
  civil_date: string;
  interval_days: number;
  streak: number;
  due_date: string;
  progress_revision: number;
};

async function findAttempt(db: SQLiteConnection, input: AttemptInput): Promise<CommitResult | null> {
  const row = await db.getFirstAsync<AttemptRow>(
    `SELECT attempt_id, deck_id, card_id, deck_revision, rating, attempted_at, time_zone, civil_date,
            interval_days, streak, due_date, progress_revision
       FROM review_attempt WHERE attempt_id = $attemptId`,
    { $attemptId: input.attemptId },
  );
  if (!row) return null;
  if (row.deck_id !== input.deckId || row.card_id !== input.cardId) {
    throw new Error(`Attempt ${input.attemptId} was recorded for another card`);
  }
  return {
    status: 'committed',
    attempt: {
      attemptId: row.attempt_id,
      deckId: row.deck_id,
      cardId: row.card_id,
      deckRevision: row.deck_revision,
      rating: row.rating,
      attemptedAt: row.attempted_at,
      timeZone: row.time_zone,
      civilDate: row.civil_date,
      intervalDays: row.interval_days,
      streak: row.streak,
      dueDate: row.due_date,
      revision: row.progress_revision,
    },
  };
}

async function commit(
  db: SQLiteConnection,
  input: AttemptInput,
  civilDate: string,
  attemptedAt: string,
): Promise<CommitResult> {
  const recorded = await findAttempt(db, input);
  if (recorded) return recorded;

  const key = { $deckId: input.deckId, $cardId: input.cardId };
  const current = await db.getFirstAsync<{ streak: number }>(
    'SELECT streak FROM card_progress WHERE deck_id = $deckId AND card_id = $cardId',
    key,
  );
  const next = schedule(civilDate, current?.streak ?? 0, input.rating);
  const state = { ...key, $streak: next.streak, $dueDate: next.dueDate };
  // Compare-and-swap on the progress revision: zero changed rows means another attempt won.
  const { changes } =
    input.expectedRevision === 0
      ? await db.runAsync(
          `INSERT INTO card_progress (deck_id, card_id, revision, streak, due_date)
           VALUES ($deckId, $cardId, 1, $streak, $dueDate)
           ON CONFLICT (deck_id, card_id) DO NOTHING`,
          state,
        )
      : await db.runAsync(
          `UPDATE card_progress SET revision = revision + 1, streak = $streak, due_date = $dueDate
            WHERE deck_id = $deckId AND card_id = $cardId AND revision = $expectedRevision`,
          { ...state, $expectedRevision: input.expectedRevision },
        );
  if (changes === 0) return { status: 'stale' };

  await db.runAsync(
    `INSERT INTO review_attempt (attempt_id, deck_id, card_id, deck_revision, rating, attempted_at,
                                 time_zone, civil_date, interval_days, streak, due_date, progress_revision)
     SELECT $attemptId, deck_id, card_id, $deckRevision, $rating, $attemptedAt,
            $timeZone, $civilDate, $intervalDays, streak, due_date, revision
       FROM card_progress WHERE deck_id = $deckId AND card_id = $cardId`,
    {
      ...key,
      $attemptId: input.attemptId,
      $deckRevision: input.deckRevision,
      $rating: input.rating,
      $attemptedAt: attemptedAt,
      $timeZone: input.timeZone,
      $civilDate: civilDate,
      $intervalDays: next.intervalDays,
    },
  );
  return (await findAttempt(db, input))!;
}

async function readToday(db: SQLiteConnection, input: TodayInput, today: string): Promise<Today> {
  const progress = await db.getAllAsync<{ card_id: string; revision: number; due_date: string }>(
    `SELECT card_id, revision, due_date FROM card_progress
      WHERE deck_id = $deckId ORDER BY due_date, card_id`,
    { $deckId: input.deckId },
  );
  const { started } = (await db.getFirstAsync<{ started: number }>(
    `SELECT count(*) AS started FROM review_attempt
      WHERE deck_id = $deckId AND civil_date = $today AND progress_revision = 1`,
    { $deckId: input.deckId, $today: today },
  ))!;
  const active = new Set(input.cardIds);
  const tracked = progress.filter((row) => active.has(row.card_id));
  const seen = new Set(progress.map((row) => row.card_id));
  return {
    today,
    due: tracked
      .filter((row) => row.due_date <= today)
      .map((row) => ({ cardId: row.card_id, revision: row.revision })),
    new: [...active]
      .filter((cardId) => !seen.has(cardId))
      .slice(0, Math.max(0, NEW_CARDS_PER_DAY - started))
      .map((cardId) => ({ cardId, revision: 0 })),
    nextDueDate: tracked.find((row) => row.due_date > today)?.due_date ?? null,
  };
}
