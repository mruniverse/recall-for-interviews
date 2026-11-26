import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateDeck } from '../src/content/deck.ts';
import { FIXTURE_LOCALES, localizeFixtureCard, translatedFixtureIds } from '../src/content/fixture-locales.ts';

const TODAY = '2026-11-26';
const fixtures = () => JSON.parse(readFileSync(new URL('../src/content/fixtures/deck.json', import.meta.url), 'utf8'));
const other = (locale) => (locale === 'en' ? 'pt-BR' : 'en');
const words = (list, flags = 'u') => new RegExp(`(?<!\\p{L})(?:${list.join('|')})(?!\\p{L})`, flags);

// Options that are protocol status lines, SQL or Big-O notation stay literal in every locale.
const LITERAL_CHOICES = new Set(['net-rate-limit-status', 'db-index-prefix', 'algo-nested-search']);
// Heuristics for a single language per locale: function words of the other language must not
// appear, and longer texts must contain function words of their own language. SQL keywords are
// uppercase, so English words are matched in lowercase (or capitalized) only.
const FOREIGN = {
  en: [/[ãõçáéíóúâêôà]/i, words(['não', 'que', 'uma', 'um', 'para', 'com', 'sem', 'ou', 'como', 'mais', 'por', 'se', 'são', 'então', 'quando', 'também', 'isso', 'pelo', 'pela', 'de', 'da', 'dos', 'das', 'em', 'na', 'nos', 'nas', 'ao', 'aos'], 'iu')],
  'pt-BR': [words(['[Tt]he', 'and', 'of', 'is', 'are', 'with', '[Ww]hen', '[Ww]hich', '[Tt]hat', '[Tt]his', 'from', 'on', '[Ii]t', 'its', 'or', 'an', 'be', 'without', 'only'])],
};
const NATIVE = {
  en: words(['the', 'a', 'an', 'of', 'to', 'and', 'is', 'in', 'with', 'for', 'on', 'by', 'it', 'or', 'as', 'that', 'this', 'was', 'would', 'any', 'like', 'not']),
  'pt-BR': words(['de', 'que', 'um', 'uma', 'com', 'para', 'em', 'não', 'o', 'a', 'os', 'as', 'do', 'da', 'no', 'na', 'e', 'se', 'por', 'ou', 'como', 'nunca', 'é']),
};
// Numbers, acronyms, snake_case identifiers and Big-O expressions must survive translation.
const TECHNICAL = /O\([^)]*\)|[A-Za-z]+_[A-Za-z_]+|\d+|(?<![A-Za-z])[A-Z]{2,}(?![A-Za-z])/g;
const technical = (text) => new Set(text.match(TECHNICAL) ?? []);

/** Every display text of a card as [path, LocalizedText], in render order. */
function displayTexts(card) {
  const fields = [['prompt', card.prompt]];
  if (card.type === 'open') {
    fields.push(['reference', card.reference]);
    for (const item of card.checklist) fields.push([`checklist.${item.id}`, item.text]);
  } else {
    for (const choice of card.choices) {
      fields.push([`choices.${choice.id}`, choice.text]);
      if (choice.reason !== undefined) fields.push([`reasons.${choice.id}`, choice.reason]);
    }
  }
  fields.push(['explanation', card.explanation]);
  return fields;
}

/** The card's shape with all display text removed: ids, order, flags and answer. */
function skeleton(card) {
  const { prompt: _p, explanation: _e, reference: _r, checklist, choices, ...rest } = card;
  return {
    ...rest,
    checklist: checklist?.map(({ id, required }) => ({ id, required })),
    choices: choices?.map(({ id, reason }) => ({ id, hasReason: reason !== undefined })),
  };
}

const throwsMessage = (fn) => {
  try {
    fn();
  } catch (error) {
    return error.message;
  }
  assert.fail('expected an error');
};

test('the translation table covers exactly the 24 fixture cards', () => {
  const ids = fixtures().cards.map((card) => card.id).sort();
  assert.equal(ids.length, 24);
  assert.deepEqual(translatedFixtureIds(), ids);
  assert.deepEqual(FIXTURE_LOCALES, ['en', 'pt-BR']);
});

test('each locale fills every display field of every card without changing its structure', () => {
  for (const locale of FIXTURE_LOCALES) {
    for (const card of fixtures().cards) {
      const localized = localizeFixtureCard(card, locale);
      assert.deepEqual(skeleton(localized), skeleton(card), `${card.id} (${locale})`);
      for (const [path, text] of displayTexts(localized)) {
        assert.equal(typeof text[locale], 'string', `${card.id}.${path} lacks ${locale}`);
        assert.ok(text[locale].trim().length > 0, `${card.id}.${path} has blank ${locale}`);
      }
      // Text authored in the fixture is kept verbatim; only the missing locale is added.
      const original = new Map(displayTexts(card));
      for (const [path, text] of displayTexts(localized)) {
        const before = original.get(path);
        for (const key of Object.keys(before)) assert.equal(text[key], before[key], `${card.id}.${path}.${key} changed`);
        assert.deepEqual(Object.keys(text).sort(), [...new Set([...Object.keys(before), locale])].sort(), `${card.id}.${path}`);
      }
    }
  }
});

test('each locale reads as one language, with literal code only where intended', () => {
  const failures = [];
  for (const locale of FIXTURE_LOCALES) {
    for (const card of fixtures().cards) {
      const localized = localizeFixtureCard(card, locale);
      const original = new Map(displayTexts(card));
      for (const [path, text] of displayTexts(localized)) {
        const value = text[locale];
        const at = `${card.id}.${path} (${locale})`;
        const authored = original.get(path)[locale] !== undefined;
        const source = original.get(path)[other(locale)];
        if (LITERAL_CHOICES.has(card.id) && path.startsWith('choices.')) {
          if (!authored && value !== source) failures.push(`${at} should stay literal`);
          continue;
        }
        if (!authored && value === source) failures.push(`${at} is untranslated`);
        for (const pattern of FOREIGN[locale]) if (pattern.test(value)) failures.push(`${at} contains "${value.match(pattern)[0]}"`);
        // Authored fixture text is the source of truth; the positive check targets translations.
        if (!authored && value.split(/\s+/).length >= 4 && !NATIVE[locale].test(value)) failures.push(`${at} does not read as ${locale}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('translations keep numbers, acronyms, identifiers and Big-O expressions', () => {
  for (const locale of FIXTURE_LOCALES) {
    for (const card of fixtures().cards) {
      const original = new Map(displayTexts(card));
      for (const [path, text] of displayTexts(localizeFixtureCard(card, locale))) {
        const source = original.get(path)[other(locale)];
        if (original.get(path)[locale] !== undefined || source === undefined) continue;
        const kept = technical(text[locale]);
        const lost = [...technical(source)].filter((token) => !kept.has(token));
        assert.deepEqual(lost, [], `${card.id}.${path} (${locale}) dropped ${lost.join(', ')}`);
      }
    }
  }
});

test('localized decks still pass the deck validator and leave the fixtures untouched', async () => {
  for (const locale of FIXTURE_LOCALES) {
    const deck = fixtures();
    const pristine = structuredClone(deck);
    const localized = { ...deck, cards: deck.cards.map((card) => localizeFixtureCard(card, locale)) };
    assert.deepEqual(deck, pristine, `${locale} mutated the input`);
    const validated = await validateDeck(localized, { mode: 'fixtures', today: TODAY });
    assert.deepEqual(validated.cards.map((card) => card.id), pristine.cards.map((card) => card.id));
  }
});

test('missing or conflicting text fails closed instead of falling back to the other language', () => {
  const card = (id) => fixtures().cards.find((c) => c.id === id);
  const cases = [
    ['unknown card', 'en', () => ({ ...card('net-l4-l7'), id: 'net-unpublished' }), /net-unpublished has no en translation/],
    ['unknown card', 'pt-BR', () => ({ ...card('net-l4-l7'), id: 'net-unpublished' }), /net-unpublished has no pt-BR translation/],
    ['new checklist item', 'pt-BR', () => { const c = card('net-l4-l7'); c.checklist.push({ id: 'extra', required: false, text: { en: 'CONFIDENTIAL item' } }); return c; }, /checklist\.extra is missing pt-BR/],
    ['prompt only in pt-BR', 'en', () => { const c = card('net-l4-l7'); c.prompt = { 'pt-BR': 'CONFIDENTIAL pergunta' }; return c; }, /prompt is missing en/],
    ['prompt authored twice', 'pt-BR', () => { const c = card('net-l4-l7'); c.prompt['pt-BR'] = 'CONFIDENTIAL pergunta'; return c; }, /prompt has pt-BR text both in the fixture and in the translation table/],
    ['reason added to the answer', 'en', () => { const c = card('algo-nested-search'); c.choices.find((x) => x.id === c.answer).reason = { 'pt-BR': 'CONFIDENTIAL motivo' }; return c; }, /reasons\.b is missing en/],
    ['checklist item removed', 'pt-BR', () => { const c = card('net-l4-l7'); c.checklist.pop(); return c; }, /pt-BR translation checklist\.use-case matches no field/],
    ['distractor reason removed', 'en', () => { const c = card('algo-nested-search'); delete c.choices[0].reason; return c; }, /en translation reasons\.a matches no field/],
  ];
  for (const [name, locale, build, expected] of cases) {
    const message = throwsMessage(() => localizeFixtureCard(build(), locale));
    assert.match(message, expected, `${name} (${locale})`);
    assert.ok(!message.includes('CONFIDENTIAL'), `${name} (${locale}) echoed card text`);
  }
  assert.match(throwsMessage(() => localizeFixtureCard(card('net-l4-l7'), 'es')), /unsupported locale es/);
  // The other locale still works for a card that only lacks one locale.
  const extra = card('net-l4-l7');
  extra.checklist.push({ id: 'extra', required: false, text: { en: 'Extra item' } });
  assert.equal(localizeFixtureCard(extra, 'en').checklist.at(-1).text.en, 'Extra item');
});
