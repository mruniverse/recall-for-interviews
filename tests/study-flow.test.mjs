import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { localizeFixtureCard } from '../src/content/fixture-locales.ts';
import { textIn } from '../src/study/content.ts';
import { LOCALE_KEY, NY, answer, device, fixtureDeck, memoryPreferences, prompt, rows } from './study-support.mjs';

const DAY_1 = '2026-11-26T15:00:00Z';
const DAY_2 = '2026-11-27T15:00:00Z';

async function onToday(phone, options) {
  const app = await phone.launch(options);
  if (app.state().screen === 'onboarding') await app.study.finishOnboarding();
  assert.equal(app.state().screen, 'today');
  return app;
}

const attemptCount = (phone) => rows(phone.file, 'SELECT count(*) AS n FROM review_attempt')[0].n;

test('first launch shows English onboarding; Continue stores the language and relaunch opens Today', async (t) => {
  const phone = device(t);
  const { study, state } = await phone.launch();
  assert.equal(state().screen, 'onboarding');
  assert.equal(state().locale, 'en');
  assert.deepEqual(state().today, { date: '2026-11-26', due: 0, new: 5, nextDueDate: null, status: 'ready' });
  assert.equal(phone.preferences.values.has(LOCALE_KEY), false);

  await study.finishOnboarding();
  assert.equal(state().screen, 'today');
  assert.equal(phone.preferences.values.get(LOCALE_KEY), 'en');

  const relaunched = await phone.launch();
  assert.equal(relaunched.state().screen, 'today');
  assert.equal(relaunched.state().locale, 'en');
});

test('Portuguese applies to every card field, persists across relaunch and cannot change mid-session', async (t) => {
  const phone = device(t);
  const first = await phone.launch();
  await first.study.chooseLocale('pt-BR');
  assert.equal(first.state().locale, 'pt-BR');
  assert.equal(phone.preferences.values.has(LOCALE_KEY), false, 'stored only when onboarding completes');
  await first.study.finishOnboarding();
  assert.equal(phone.preferences.values.get(LOCALE_KEY), 'pt-BR');

  const app = await phone.launch();
  assert.equal(app.state().screen, 'today');
  assert.equal(app.state().locale, 'pt-BR');
  await app.study.start();
  const { card } = prompt(app.study);
  assert.equal(card.type, 'open');
  assert.notEqual(textIn(card.prompt, 'pt-BR'), textIn(card.prompt, 'en'));
  for (const field of [card.reference, card.explanation, ...card.checklist.map((item) => item.text)]) {
    assert.ok(textIn(field, 'pt-BR'));
  }

  await app.study.chooseLocale('en');
  assert.equal(app.state().locale, 'pt-BR', 'the language is fixed during a session');
  await app.study.leave();
  await app.study.chooseLocale('en');
  assert.equal(app.state().locale, 'en');
  assert.equal(phone.preferences.values.get(LOCALE_KEY), 'en');

  phone.preferences.failWrites = true;
  await app.study.chooseLocale('pt-BR');
  assert.deepEqual([app.state().locale, app.state().notice], ['pt-BR', 'locale-not-saved']);
  assert.equal(phone.preferences.values.get(LOCALE_KEY), 'en');
});

test('selecting the current language retries a failed preference write and survives relaunch', async (t) => {
  const phone = device(t);
  const { study, state } = await onToday(phone);
  phone.preferences.failWrites = true;
  await study.chooseLocale('pt-BR');
  assert.equal(state().notice, 'locale-not-saved');

  phone.preferences.failWrites = false;
  await study.chooseLocale('pt-BR');
  assert.deepEqual([state().locale, state().notice], ['pt-BR', null]);
  const relaunched = await phone.launch();
  assert.deepEqual([relaunched.state().screen, relaunched.state().locale], ['today', 'pt-BR']);
});

test('a language the deck cannot fully render is refused instead of mixing languages', async (t) => {
  // Returns fixture cards untouched for pt-BR: their prompts exist only in English.
  const englishOnly = (card, locale) => (locale === 'en' ? localizeFixtureCard(card, 'en') : card);
  const { study, state } = await onToday(device(t), { localize: englishOnly });
  await study.chooseLocale('pt-BR');
  assert.deepEqual([state().locale, state().notice], ['en', 'locale-unavailable']);

  const stored = device(t, { preferences: memoryPreferences({ [LOCALE_KEY]: 'pt-BR' }) });
  const stuck = await stored.launch({ localize: englishOnly });
  assert.deepEqual(stuck.state(), { screen: 'unavailable', locale: 'pt-BR', problem: 'content' });
  await stuck.study.chooseLocale('en');
  assert.deepEqual([stuck.state().screen, stuck.state().locale], ['today', 'en']);
  assert.equal(stored.preferences.values.get(LOCALE_KEY), 'en');
});

test('recovering from unavailable content reports a language preference that could not be saved', async (t) => {
  const preferences = memoryPreferences({ [LOCALE_KEY]: 'pt-BR' });
  const englishOnly = (card, locale) => (locale === 'en' ? localizeFixtureCard(card, 'en') : card);
  const phone = device(t, { preferences });
  const { study, state } = await phone.launch({ localize: englishOnly });
  assert.equal(state().screen, 'unavailable');

  preferences.failWrites = true;
  await study.chooseLocale('en');
  assert.deepEqual([state().screen, state().locale, state().notice], ['today', 'en', 'locale-not-saved']);
  assert.equal(preferences.values.get(LOCALE_KEY), 'pt-BR');
});

test('unavailable content does not persist another language whose content is also unavailable', async (t) => {
  const preferences = memoryPreferences({ [LOCALE_KEY]: 'pt-BR' });
  const { study, state } = await device(t, { preferences }).launch({ localize: (card) => card });
  assert.deepEqual(state(), { screen: 'unavailable', locale: 'pt-BR', problem: 'content' });

  await study.chooseLocale('en');
  assert.equal(state().problem, 'content');
  assert.equal(preferences.values.get(LOCALE_KEY), 'pt-BR', 'a rejected language must not replace the saved choice');
});

test('Submit on an open card reveals feedback without typing; only the self-rating saves, once', async (t) => {
  const phone = device(t);
  const { study, commits, ids } = await onToday(phone);
  await study.start();
  const first = prompt(study);
  assert.deepEqual([first.card.type, first.stage, first.draft], ['open', 'answering', '']);

  await Promise.all([study.submit(), study.submit()]);
  assert.deepEqual([prompt(study).stage, prompt(study).save.status, commits.length], ['feedback', 'idle', 0]);
  await study.dontKnow();
  study.setDraft('typed after submitting');
  assert.deepEqual([prompt(study).gaveUp, prompt(study).draft], [false, '']);

  await Promise.all([study.rate('correct'), study.rate('missed')]);
  assert.equal(commits.length, 1);
  const { save } = prompt(study);
  assert.equal(save.status, 'saved');
  assert.deepEqual(
    [save.attempt.rating, save.attempt.civilDate, save.attempt.intervalDays, save.attempt.dueDate],
    ['correct', '2026-11-26', 7, '2026-12-03'],
  );
  assert.equal(commits[0].attemptId, first.attemptId);
  assert.deepEqual(ids, [first.attemptId]);
  assert.equal(attemptCount(phone), 1);
});

test('multiple choice: tapping an option only selects it; Submit is needed and grades exactly once', async (t) => {
  const phone = device(t);
  const { study, commits } = await onToday(phone);
  await study.start();
  for (let i = 0; i < 4; i++) {
    await answer(study);
    await study.next();
  }
  const mc = prompt(study);
  assert.equal(mc.card.type, 'multiple-choice');

  await study.submit();
  assert.equal(prompt(study).stage, 'answering', 'Submit needs a selected option');
  const wrong = mc.card.choices.find((choice) => choice.id !== mc.card.answer).id;
  study.selectChoice(mc.card.answer);
  study.selectChoice(wrong);
  study.selectChoice('not-an-option');
  assert.deepEqual([prompt(study).selectedChoice, prompt(study).stage, commits.length], [wrong, 'answering', 4]);

  await Promise.all([study.submit(), study.submit()]);
  assert.equal(commits.length, 5);
  const graded = prompt(study);
  assert.equal(graded.stage, 'feedback');
  assert.equal(graded.attemptId, mc.attemptId);
  assert.deepEqual([graded.save.attempt.rating, graded.save.attempt.dueDate], ['missed', '2026-11-27']);

  study.selectChoice(mc.card.answer);
  await study.rate('correct');
  assert.deepEqual([prompt(study).selectedChoice, commits.length], [wrong, 5], 'graded answers are final');
});

test('"I don\'t know" is a separate shortcut: open cards then accept only Missed, multiple choice saves a miss', async (t) => {
  const { study, commits } = await onToday(device(t));
  await study.start();
  study.setDraft('half an idea');
  await study.dontKnow();
  assert.deepEqual(
    [prompt(study).stage, prompt(study).gaveUp, prompt(study).draft, commits.length],
    ['feedback', true, 'half an idea', 0],
  );
  await study.rate('correct');
  await study.rate('partial');
  assert.equal(commits.length, 0);
  await study.rate('missed');
  assert.equal(prompt(study).save.attempt.rating, 'missed');

  for (let i = 0; i < 3; i++) {
    await study.next();
    await answer(study);
  }
  await study.next();
  const mc = prompt(study);
  assert.equal(mc.card.type, 'multiple-choice');
  study.selectChoice(mc.card.answer);
  await study.dontKnow();
  const after = prompt(study);
  assert.deepEqual([after.gaveUp, after.selectedChoice, after.save.attempt.rating], [true, null, 'missed']);
});

test('Start freezes the queue: due by date then ID before new in deck order, nothing added later', async (t) => {
  const phone = device(t);
  const day1 = await onToday(phone);
  await day1.study.start();
  for (const rating of ['missed', 'partial', 'correct', 'missed', 'correct']) {
    await answer(day1.study, rating);
    await day1.study.next();
  }
  assert.equal(day1.state().screen, 'summary');
  assert.deepEqual(day1.state().summary, {
    answered: 5,
    ratings: { correct: 2, partial: 1, missed: 2 },
    today: '2026-11-26',
    nextReview: '2026-11-27',
  });

  phone.setClock(DAY_2);
  const { study, state, commits, ids } = await onToday(phone);
  assert.deepEqual([state().today.due, state().today.new], [3, 5]);
  await study.start();
  const { queue } = state().session;
  assert.ok(Object.isFrozen(queue));
  assert.deepEqual(
    queue.map((item) => [item.kind, item.cardId]),
    [
      ['due', 'sd-backpressure'],
      ['due', 'sd-cache-aside'],
      ['due', 'sd-rate-limit'],
      ['new', 'sd-partition-writes'],
      ['new', 'net-l4-l7'],
      ['new', 'net-connection-setup'],
      ['new', 'net-dns-ttl'],
      ['new', 'net-push-updates'],
    ],
  );

  phone.setClock('2026-11-28T15:00:00Z');
  const before = state();
  await study.refresh();
  assert.equal(state(), before, 'refresh does not touch a running session');

  for (let i = 0; i < queue.length; i++) {
    assert.equal(state().session.queue, queue);
    assert.equal(prompt(study).item, queue[i]);
    await answer(study, 'correct');
    await study.next();
  }
  assert.equal(state().screen, 'summary');
  assert.equal(state().summary.answered, queue.length);
  assert.deepEqual(
    commits.map((input) => input.attemptId),
    ids,
    'one attempt ID per prompt',
  );
  assert.equal(new Set(ids).size, queue.length);
});

test('rated attempts survive a relaunch; the unfinished prompt and its draft are discarded', async (t) => {
  const phone = device(t);
  const app = await onToday(phone);
  await app.study.start();
  await answer(app.study, 'missed');
  await app.study.next();
  await answer(app.study, 'correct');
  await app.study.next();
  const unfinished = prompt(app.study);
  app.study.setDraft('not saved');
  await app.study.submit();
  await app.study.dispose(); // force quit before rating

  const relaunched = await phone.launch();
  assert.equal(relaunched.state().screen, 'today');
  assert.deepEqual(relaunched.state().today, {
    date: '2026-11-26',
    due: 0,
    new: 3,
    nextDueDate: '2026-11-27',
    status: 'ready',
  });
  await relaunched.study.start();
  const again = prompt(relaunched.study);
  assert.equal(again.item.cardId, unfinished.item.cardId);
  assert.notEqual(again.attemptId, unfinished.attemptId);
  assert.deepEqual([again.draft, again.stage], ['', 'answering']);
  assert.equal(attemptCount(phone), 2);

  phone.setClock(DAY_2);
  const nextDay = await phone.launch();
  assert.deepEqual(
    [nextDay.state().today.due, nextDay.state().today.nextDueDate],
    [1, '2026-12-03'],
  );
});

for (const locale of ['en', 'pt-BR']) {
  test(`${locale}: changing language preserves SQLite history and advances the same open and choice cards after relaunch`, async (t) => {
    const deck = fixtureDeck();
    deck.cards = [deck.cards.find((card) => card.type === 'open'), deck.cards.find((card) => card.type === 'multiple-choice')];
    const phone = device(t);
    const app = await onToday(phone, { deck });
    await app.study.chooseLocale(locale);
    await app.study.start();
    app.study.setDraft('A user-written draft stays exactly as entered.');
    await app.study.submit();
    assert.equal(prompt(app.study).draft, 'A user-written draft stays exactly as entered.');
    await app.study.rate('correct');
    await app.study.next();
    await answer(app.study, 'correct');
    await app.study.next();
    assert.equal(app.state().summary.answered, 2);
    await app.study.closeSummary();

    const progress = () => rows(phone.file, 'SELECT * FROM card_progress ORDER BY card_id');
    const history = () => rows(phone.file, 'SELECT * FROM review_attempt ORDER BY attempt_id');
    const before = { progress: progress(), history: history() };
    const otherLocale = locale === 'en' ? 'pt-BR' : 'en';
    await app.study.chooseLocale(otherLocale);
    assert.deepEqual({ progress: progress(), history: history() }, before);

    const relaunched = await phone.launch({ deck });
    assert.deepEqual([relaunched.state().locale, relaunched.state().today.status], [otherLocale, 'caught-up']);
    assert.equal(relaunched.state().today.nextDueDate, '2026-12-03');
    phone.setClock('2026-12-03T15:00:00Z');
    await relaunched.study.start();
    assert.deepEqual(relaunched.state().session.queue.map((item) => item.cardId), deck.cards.map((card) => card.id));
    assert.equal(textIn(prompt(relaunched.study).card.prompt, otherLocale), localizeFixtureCard(deck.cards[0], otherLocale).prompt[otherLocale]);
    await answer(relaunched.study, 'correct');
    assert.deepEqual(
      [prompt(relaunched.study).save.attempt.revision, prompt(relaunched.study).save.attempt.streak, prompt(relaunched.study).save.attempt.dueDate],
      [2, 2, '2027-01-02'],
    );
    await relaunched.study.next();
    await answer(relaunched.study, 'missed');
    assert.deepEqual(
      [prompt(relaunched.study).save.attempt.revision, prompt(relaunched.study).save.attempt.streak, prompt(relaunched.study).save.attempt.dueDate],
      [2, 0, '2026-12-04'],
    );
    assert.equal(history().length, 4);
  });
}

test('Today tells an empty deck apart from caught up and shows the next review date', async (t) => {
  const empty = await device(t).launch({ deck: { ...fixtureDeck(), cards: [] } });
  assert.deepEqual(empty.state().today, { date: '2026-11-26', due: 0, new: 0, nextDueDate: null, status: 'empty' });

  const { study, state } = await onToday(device(t));
  await study.start();
  for (let i = 0; i < 5; i++) {
    await answer(study, 'correct');
    await study.next();
  }
  assert.equal(state().summary.nextReview, '2026-12-03');
  await study.closeSummary();
  assert.deepEqual(state().today, { date: '2026-11-26', due: 0, new: 0, nextDueDate: '2026-12-03', status: 'caught-up' });
  await study.start();
  assert.equal(state().screen, 'today', 'nothing to start when caught up');
});

test('the summary points to the next review across the deck, including cards that became due', async (t) => {
  const phone = device(t);
  const { study, state } = await onToday(phone);
  await study.start();
  await answer(study, 'missed');
  await study.leave();
  await study.start();
  for (let i = 0; i < 4; i++) {
    await answer(study, 'correct');
    await study.next();
  }
  assert.deepEqual([state().summary.today, state().summary.nextReview], ['2026-11-26', '2026-11-27']);

  const latePhone = device(t);
  const late = await onToday(latePhone);
  await late.study.start();
  await answer(late.study, 'missed');
  await late.study.next();
  latePhone.setClock(DAY_2);
  for (let i = 0; i < 4; i++) {
    await answer(late.study, 'correct');
    await late.study.next();
  }
  assert.deepEqual([late.state().summary.today, late.state().summary.nextReview], ['2026-11-27', '2026-11-27']);
});

test('a busy database keeps feedback on screen; the retry reuses the attempt ID, rating and instant', async (t) => {
  const phone = device(t, { busyTimeoutMs: 5 });
  const { study, commits } = await onToday(phone);
  await study.start();
  await study.submit();
  const blocker = new DatabaseSync(phone.file);
  t.after(() => blocker.close());
  blocker.exec('BEGIN IMMEDIATE');

  await study.rate('partial');
  const failed = prompt(study);
  assert.deepEqual(
    [failed.stage, failed.save.status, failed.save.reason, failed.save.rating],
    ['feedback', 'failed', 'busy', 'partial'],
  );
  await study.rate('correct');
  assert.equal(commits.length, 1, 'a failed save is retried, not re-rated');

  phone.setClock(DAY_2);
  blocker.exec('ROLLBACK');
  await study.retrySave();
  const saved = prompt(study).save;
  assert.equal(saved.status, 'saved');
  assert.deepEqual([saved.attempt.rating, saved.attempt.civilDate], ['partial', '2026-11-26']);
  assert.equal(commits.length, 2);
  assert.deepEqual(commits[1], commits[0]);
  assert.equal(attemptCount(phone), 1);

  await study.retrySave();
  assert.equal(commits.length, 2);
});

test('a stale attempt writes nothing and returns to a refreshed Today', async (t) => {
  const phone = device(t);
  const deck = fixtureDeck();
  const { study, state } = await onToday(phone);
  await study.start();
  const shown = prompt(study);
  const other = await phone.otherHandle();
  await other.commitAttempt({
    attemptId: 'other-session',
    deckId: deck.deckId,
    cardId: shown.item.cardId,
    deckRevision: deck.revision,
    expectedRevision: 0,
    rating: 'correct',
    attemptedAt: new Date(DAY_1),
    timeZone: NY,
  });

  await study.submit();
  await study.rate('missed');
  assert.equal(state().screen, 'today');
  assert.equal(state().notice, 'stale');
  assert.deepEqual([state().today.due, state().today.new], [0, 4]);
  assert.deepEqual(rows(phone.file, 'SELECT attempt_id FROM review_attempt'), [{ attempt_id: 'other-session' }]);
});

test('while a save is in flight, rating, retrying, leaving and advancing are ignored', async (t) => {
  const { study, state, commits } = await onToday(device(t));
  await study.start();
  await study.submit();
  const pending = study.rate('correct');
  assert.equal(prompt(study).save.status, 'saving');
  await Promise.all([study.rate('missed'), study.retrySave(), study.leave(), study.next()]);
  assert.equal(state().screen, 'study');
  assert.equal(state().session.position, 0);
  await pending;
  assert.equal(commits.length, 1);
  assert.equal(prompt(study).save.attempt.rating, 'correct');
});

test('leaving discards the prompt without writing; Start presents it again with a new attempt ID', async (t) => {
  const phone = device(t);
  const { study, state, commits } = await onToday(phone);
  await study.start();
  const first = prompt(study);
  study.setDraft('draft');
  await study.leave();
  assert.equal(state().screen, 'today');
  assert.deepEqual([commits.length, attemptCount(phone)], [0, 0]);

  await study.start();
  const again = prompt(study);
  assert.equal(again.item.cardId, first.item.cardId);
  assert.notEqual(again.attemptId, first.attemptId);
  assert.equal(again.draft, '');
});

test('Today refreshes after midnight on foreground, and a double Start opens one session', async (t) => {
  const phone = device(t);
  const { study, state, ids } = await onToday(phone);
  await study.start();
  await answer(study, 'missed');
  await study.leave();
  assert.deepEqual([state().today.due, state().today.new], [0, 4]);

  phone.setClock(DAY_2);
  await study.refresh();
  assert.deepEqual([state().today.date, state().today.due, state().today.new], ['2026-11-27', 1, 5]);

  const before = ids.length;
  await Promise.all([study.start(), study.start()]);
  assert.equal(ids.length, before + 1);
  assert.equal(state().session.queue.length, 6);
});
