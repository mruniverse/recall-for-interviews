import test from 'node:test';
import assert from 'node:assert/strict';
import { localizeFixtureCard } from '../src/content/fixture-locales.ts';
import { localizeDeck, StudyContentError, textIn } from '../src/study/content.ts';
import { COPY, DEFAULT_LOCALE, formatCivilDate, formatDueDate, isStudyLocale, LOCALES } from '../src/study/copy.ts';
import { newAttemptId } from '../src/study/ids.ts';
import { fixtureDeck } from './study-support.mjs';

// Walks both copies in parallel: same keys, same list lengths, and non-empty text everywhere.
function sameShape(en, pt, path) {
  assert.equal(typeof pt, typeof en, path);
  if (typeof en === 'string') {
    assert.ok(en.trim() && pt.trim(), `${path} is empty`);
  } else if (typeof en === 'function') {
    const args = Array.from({ length: en.length }, (_, i) => i + 2);
    sameShape(en(...args), pt(...args), `${path}()`);
  } else if (Array.isArray(en)) {
    assert.equal(pt.length, en.length, path);
    en.forEach((value, i) => sameShape(value, pt[i], `${path}[${i}]`));
  } else {
    assert.deepEqual(Object.keys(pt).sort(), Object.keys(en).sort(), path);
    for (const key of Object.keys(en)) sameShape(en[key], pt[key], `${path}.${key}`);
  }
}

test('both languages define every interface string, English by default', () => {
  assert.deepEqual(LOCALES, ['en', 'pt-BR']);
  assert.equal(DEFAULT_LOCALE, 'en');
  sameShape(COPY.en, COPY['pt-BR'], 'copy');
  assert.equal(COPY.en.submit, 'Submit answer');
  assert.equal(COPY['pt-BR'].submit, 'Enviar resposta');
  assert.equal(COPY.en.dontKnow, "I don't know");
  assert.equal(COPY['pt-BR'].dontKnow, 'Não sei');
  for (const value of ['en', 'pt-BR']) assert.ok(isStudyLocale(value));
  for (const value of ['pt', 'EN', '', null, undefined]) assert.equal(isStudyLocale(value), false);
});

test('the daily new-question limit is spelled out in each language, with singular and plural', () => {
  const en = COPY.en;
  const pt = COPY['pt-BR'];
  assert.deepEqual(
    [1, 3, 5, 10].map((n) => en.newCardLimitOption(n)),
    ['1 new question per day', '3 new questions per day', '5 new questions per day', '10 new questions per day'],
  );
  assert.deepEqual(
    [1, 3, 5, 10].map((n) => pt.newCardLimitOption(n)),
    ['1 pergunta nova por dia', '3 perguntas novas por dia', '5 perguntas novas por dia', '10 perguntas novas por dia'],
  );
  assert.match(en.rules(1)[2], /^Up to 1 new question per day; .*Due reviews are never limited/);
  assert.match(en.rules(10)[2], /^Up to 10 new questions per day; /);
  assert.match(pt.rules(1)[2], /^Até 1 pergunta nova por dia; .*Revisões pendentes nunca são limitadas/);
  assert.match(pt.rules(10)[2], /^Até 10 perguntas novas por dia; /);
  assert.equal(en.rules(3)[3], en.draftsRule);
  assert.equal(pt.rules(3)[3], pt.draftsRule);
  assert.deepEqual([en.settings, pt.settings], ['Settings', 'Configurações']);
  assert.match(pt.rules(3)[2], /Configurações/);
  assert.match(en.rules(3)[2], /Settings/);
  // No English left in the Portuguese settings copy, and vice versa.
  const ptSettings = [pt.newCardLimit, pt.newCardLimitHelp, pt.newCardLimitOption(3), pt.notices['limit-not-saved'], pt.rules(3)[2]];
  for (const text of ptSettings) assert.doesNotMatch(text, /\b(new|questions?|per day|limit|reviews?|settings)\b/i, text);
  const enSettings = [en.newCardLimit, en.newCardLimitHelp, en.newCardLimitOption(3), en.notices['limit-not-saved'], en.rules(3)[2]];
  for (const text of enSettings) assert.doesNotMatch(text, /\b(perguntas?|novas?|por dia|limite|revisões|configurações)\b/i, text);
});

test('labels the build as a prototype with unreviewed fixture content, never as released', () => {
  assert.match(COPY.en.prototypeLabel, /prototype/i);
  assert.match(COPY.en.prototypeLabel, /fixture deck, not reviewed/);
  assert.match(COPY.en.prototypeLabel, /not a released app/);
  assert.match(COPY['pt-BR'].prototypeLabel, /Protótipo/);
  assert.match(COPY['pt-BR'].prototypeLabel, /\(fixtures\), não revisado/);
  assert.match(COPY['pt-BR'].prototypeLabel, /não é um app publicado/);
});

test('formats stored civil dates in the chosen language without shifting them', () => {
  assert.equal(formatCivilDate('2026-12-03', 'en'), 'December 3, 2026');
  assert.equal(formatCivilDate('2026-12-03', 'pt-BR'), '3 de dezembro de 2026');
  const cases = [
    ['2026-11-26', '2026-11-26', 'today (November 26, 2026)', 'hoje (26 de novembro de 2026)'],
    ['2026-11-27', '2026-11-26', 'tomorrow (November 27, 2026)', 'amanhã (27 de novembro de 2026)'],
    ['2026-03-09', '2026-03-08', 'tomorrow (March 9, 2026)', 'amanhã (9 de março de 2026)'],
    ['2026-11-08', '2026-11-01', 'in 7 days (November 8, 2026)', 'em 7 dias (8 de novembro de 2026)'],
    ['2027-01-02', '2026-12-03', 'in 30 days (January 2, 2027)', 'em 30 dias (2 de janeiro de 2027)'],
  ];
  for (const [due, today, en, pt] of cases) {
    assert.equal(formatDueDate(due, today, 'en'), en);
    assert.equal(formatDueDate(due, today, 'pt-BR'), pt);
  }
});

test('every fixture card renders entirely in either language, and missing text has no fallback', () => {
  const deck = fixtureDeck();
  for (const locale of LOCALES) {
    const cards = localizeDeck(deck, locale, localizeFixtureCard);
    assert.deepEqual([...cards.keys()], deck.cards.map((card) => card.id));
  }
  const portuguese = localizeDeck(deck, 'pt-BR', localizeFixtureCard);
  for (const card of portuguese.values()) assert.notEqual(card.prompt['pt-BR'], card.prompt.en, card.id);

  assert.equal(textIn({ en: 'Only English' }, 'en'), 'Only English');
  assert.throws(() => textIn({ en: 'Only English' }, 'pt-BR'), StudyContentError);
  assert.throws(() => textIn({ 'pt-BR': 'Só português' }, 'en'), StudyContentError);
  assert.throws(() => textIn({ en: '  ' }, 'en'), StudyContentError);
  assert.throws(() => textIn(undefined, 'en'), StudyContentError);
});

test('refuses a localization that changes what grading or scheduling depends on', () => {
  const deck = fixtureDeck();
  const tamper = (change) => (card, locale) => change(localizeFixtureCard(card, locale));
  const changes = [
    (card) => (card.type === 'multiple-choice' ? { ...card, answer: card.choices[0].id === card.answer ? card.choices[1].id : card.choices[0].id } : card),
    (card) =>
      card.type === 'open' ? { ...card, checklist: card.checklist.map((item) => ({ ...item, required: !item.required })) } : card,
    (card) => ({ ...card, id: `${card.id}-copy` }),
    (card) =>
      card.type === 'multiple-choice' ? { ...card, choices: card.choices.map((choice) => ({ ...choice, reason: undefined })) } : card,
  ];
  for (const change of changes) {
    assert.throws(() => localizeDeck(deck, 'en', tamper(change)), StudyContentError);
  }
});

test('attempt IDs are unique, with or without crypto.randomUUID', (t) => {
  const many = (n) => new Set(Array.from({ length: n }, () => newAttemptId()));
  assert.equal(many(2000).size, 2000);
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
  t.after(() => Object.defineProperty(globalThis, 'crypto', original));
  const fallback = many(2000);
  assert.equal(fallback.size, 2000);
  for (const id of fallback) assert.match(id, /^[0-9a-z]+-[0-9a-z]+-[0-9a-f]{24}$/);
});
