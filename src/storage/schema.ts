const CIVIL_DATE = "GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'";

// Forward-only: entry i upgrades `PRAGMA user_version` i to i + 1. Never edit a shipped entry; append.
export const MIGRATIONS: readonly string[] = [
  `CREATE TABLE card_progress (
    deck_id TEXT NOT NULL CHECK (deck_id <> ''),
    card_id TEXT NOT NULL CHECK (card_id <> ''),
    revision INTEGER NOT NULL CHECK (revision > 0),
    streak INTEGER NOT NULL CHECK (streak >= 0),
    due_date TEXT NOT NULL CHECK (due_date ${CIVIL_DATE}),
    PRIMARY KEY (deck_id, card_id)
  ) STRICT, WITHOUT ROWID;

  CREATE TABLE review_attempt (
    attempt_id TEXT NOT NULL PRIMARY KEY CHECK (attempt_id <> ''),
    deck_id TEXT NOT NULL,
    card_id TEXT NOT NULL,
    deck_revision INTEGER NOT NULL CHECK (deck_revision > 0),
    rating TEXT NOT NULL CHECK (rating IN ('correct', 'partial', 'missed')),
    attempted_at TEXT NOT NULL,
    time_zone TEXT NOT NULL CHECK (time_zone <> ''),
    civil_date TEXT NOT NULL CHECK (civil_date ${CIVIL_DATE}),
    interval_days INTEGER NOT NULL CHECK (interval_days > 0),
    streak INTEGER NOT NULL CHECK (streak >= 0),
    due_date TEXT NOT NULL CHECK (due_date ${CIVIL_DATE}),
    progress_revision INTEGER NOT NULL CHECK (progress_revision > 0),
    UNIQUE (deck_id, card_id, progress_revision),
    FOREIGN KEY (deck_id, card_id) REFERENCES card_progress (deck_id, card_id)
  ) STRICT;

  CREATE INDEX review_attempt_by_day ON review_attempt (deck_id, civil_date);`,

  // One row at most; no row means the default limit. The CHECK mirrors NEW_CARD_LIMITS in storage.ts.
  `CREATE TABLE study_preference (
    singleton INTEGER NOT NULL PRIMARY KEY CHECK (singleton = 1),
    new_card_limit INTEGER NOT NULL CHECK (new_card_limit IN (1, 3, 5, 10))
  ) STRICT;`,
];
