// Shared harness for the study tests (not a test file itself): the production storage over
// node:sqlite through an expo-sqlite-shaped shim, an in-memory preference store and a fixed clock.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { localizeFixtureCard } from '../src/content/fixture-locales.ts';
import { openStorage } from '../src/storage/storage.ts';
import { parseFixtureDeck } from '../src/study/content.ts';
import { createStudy, LOCALE_KEY } from '../src/study/controller.ts';

export const NY = 'America/New_York';
export { LOCALE_KEY };

export const fixtureDeck = () =>
  parseFixtureDeck(JSON.parse(fs.readFileSync(new URL('../src/content/fixtures/deck.json', import.meta.url), 'utf8')));

const tick = () => new Promise((resolve) => setImmediate(resolve));

// Same contract as expo-sqlite 58 on device: each call yields first, foreign keys start off.
function expoSqlite(dir) {
  return async function openDatabaseAsync(name, options) {
    assert.deepEqual(options, { useNewConnection: true });
    const raw = new DatabaseSync(path.join(dir, name), { enableForeignKeyConstraints: false });
    const call = async (run) => {
      await tick();
      return run();
    };
    return {
      execAsync: (source) => call(() => void raw.exec(source)),
      runAsync: (source, params) => call(() => ({ changes: Number(raw.prepare(source).run(params).changes) })),
      getFirstAsync: (source, params) => call(() => raw.prepare(source).get(params) ?? null),
      getAllAsync: (source, params) => call(() => raw.prepare(source).all(params)),
      closeAsync: () => call(() => raw.close()),
    };
  };
}

export function memoryPreferences(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    failWrites: false,
    async getItem(key) {
      await tick();
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      await tick();
      if (this.failWrites) throw new Error('write failed');
      values.set(key, value);
    },
  };
}

/**
 * One device: a database directory and a preference store that survive `launch()` calls, so a
 * second launch is a relaunch after a force quit (in-memory session state is gone).
 */
export function device(t, { busyTimeoutMs = 1000, preferences = memoryPreferences() } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recall-study-'));
  const openDatabaseAsync = expoSqlite(dir);
  const controllers = [];
  const handles = [];
  t.after(async () => {
    for (const study of controllers) await study.dispose().catch(() => undefined);
    for (const handle of handles) await handle.close().catch(() => undefined);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  let clock = new Date('2026-11-26T15:00:00Z');
  return {
    file: path.join(dir, 'recall.db'),
    preferences,
    setClock(iso) {
      clock = new Date(iso);
    },
    /** A second storage handle on the same file, as another session would hold. */
    async otherHandle() {
      const handle = await openStorage(openDatabaseAsync, 'recall.db', busyTimeoutMs);
      handles.push(handle);
      return handle;
    },
    async launch({ deck = fixtureDeck(), localize = localizeFixtureCard } = {}) {
      const commits = [];
      const ids = [];
      const launchNumber = controllers.length + 1;
      const study = createStudy({
        openStorage: async () => {
          const storage = await openStorage(openDatabaseAsync, 'recall.db', busyTimeoutMs);
          return {
            ...storage,
            commitAttempt(input) {
              commits.push(input);
              return storage.commitAttempt(input);
            },
          };
        },
        preferences,
        deck,
        localize,
        now: () => new Date(clock),
        timeZone: () => NY,
        newAttemptId: () => {
          const id = `launch${launchNumber}-prompt${ids.length + 1}`;
          ids.push(id);
          return id;
        },
      });
      controllers.push(study);
      await study.init();
      return { study, commits, ids, state: () => study.getState() };
    },
  };
}

export function rows(file, sql) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return db.prepare(sql).all().map((row) => ({ ...row }));
  } finally {
    db.close();
  }
}

/** Current prompt; fails the test when no session is on screen. */
export function prompt(study) {
  const state = study.getState();
  assert.equal(state.screen, 'study', `expected a study screen, got ${state.screen}`);
  return state.session.prompt;
}

/** Answers the current prompt: open cards self-rate, multiple choice picks `choice` (default: correct). */
export async function answer(study, rating = 'correct') {
  const { card } = prompt(study);
  if (card.type === 'open') {
    await study.submit();
    await study.rate(rating);
  } else {
    const wrong = card.choices.find((choice) => choice.id !== card.answer).id;
    study.selectChoice(rating === 'correct' ? card.answer : wrong);
    await study.submit();
  }
  assert.equal(prompt(study).save.status, 'saved');
}
