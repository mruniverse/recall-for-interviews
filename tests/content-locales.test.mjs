import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateDeck } from '../src/content/deck.ts';
import { FIXTURE_LOCALES, localizeFixtureCard, translatedFixtureIds } from '../src/content/fixture-locales.ts';

const TODAY = '2026-11-26';
const ROUND_OF_TOPIC = { 'system-design': 'system-design', networking: 'fundamentals', databases: 'fundamentals', algorithms: 'coding' };
const fixtures = () => JSON.parse(readFileSync(new URL('../src/content/fixtures/deck.json', import.meta.url), 'utf8'));
// Words are counted by trimming and splitting on Unicode whitespace; code identifiers count as one.
const words = (text) => text.trim().split(/\s+/).length;

// Grading key as shipped before M2B: order, topic, type, answer, required flags, item ids. A change
// here means the card's learning objective or correct answer changed and needs a new card id.
// true on a choice means it carries a distractor reason.
const GRADING = {
  'sd-cache-aside': { topic: 'system-design', type: 'open', checklist: [['read-path', true], ['stale-source', true], ['bound', true], ['race', false], ['trade-off', false]] },
  'sd-rate-limit': { topic: 'system-design', type: 'open', checklist: [['shared-store', true], ['atomic', true], ['algorithm', true], ['store-failure', false], ['response', false]] },
  'sd-idempotency': { topic: 'system-design', type: 'open', checklist: [['client-key', true], ['atomic-record', true], ['replay', true], ['payload-mismatch', false], ['concurrency', false]] },
  'sd-backpressure': { topic: 'system-design', type: 'open', checklist: [['growth', true], ['consumers', true], ['backpressure', true], ['signals', false], ['idempotent', false]] },
  'sd-consistent-hashing': { topic: 'system-design', type: 'multiple-choice', answer: 'b', choices: [['a', true], ['b', false], ['c', true], ['d', true]] },
  'sd-partition-writes': { topic: 'system-design', type: 'multiple-choice', answer: 'c', choices: [['a', true], ['b', true], ['c', false], ['d', true]] },
  'net-l4-l7': { topic: 'networking', type: 'open', checklist: [['l7-routing', true], ['l4-forwarding', true], ['trade-off', true], ['protocols', false], ['use-case', false]] },
  'net-connection-setup': { topic: 'networking', type: 'open', checklist: [['tcp', true], ['tls', true], ['reuse', true], ['dns', false], ['quic-edge', false], ['replay', false]] },
  'net-dns-ttl': { topic: 'networking', type: 'open', checklist: [['caching', true], ['lower-early', true], ['overlap', true], ['stragglers', false], ['restore', false]] },
  'net-push-updates': { topic: 'networking', type: 'open', checklist: [['short', true], ['long', true], ['websocket', true], ['sse', false], ['choice', false]] },
  'net-udp-realtime': { topic: 'networking', type: 'multiple-choice', answer: 'd', choices: [['a', true], ['b', true], ['c', true], ['d', false]] },
  'net-rate-limit-status': { topic: 'networking', type: 'multiple-choice', answer: 'c', choices: [['a', true], ['b', true], ['c', false], ['d', true]] },
  'db-composite-index': { topic: 'databases', type: 'open', checklist: [['composite', true], ['avoids-work', true], ['write-cost', true], ['covering', false], ['verify', false]] },
  'db-lost-update': { topic: 'databases', type: 'open', checklist: [['anomaly', true], ['atomic', true], ['second', true], ['rows', false], ['trade-off', false]] },
  'db-replica-lag': { topic: 'databases', type: 'open', checklist: [['async', true], ['read-your-writes', true], ['cost', true], ['monitor', false], ['sync', false]] },
  'db-n-plus-one': { topic: 'databases', type: 'open', checklist: [['pattern', true], ['batch', true], ['latency', true], ['duplication', false], ['detect', false]] },
  'db-atomicity': { topic: 'databases', type: 'multiple-choice', answer: 'a', choices: [['a', false], ['b', true], ['c', true], ['d', true]] },
  'db-index-prefix': { topic: 'databases', type: 'multiple-choice', answer: 'd', choices: [['a', true], ['b', true], ['c', true], ['d', false]] },
  'algo-hash-map': { topic: 'algorithms', type: 'open', checklist: [['bucket', true], ['load-factor', true], ['collisions', true], ['amortized', false], ['flooding', false]] },
  'algo-lower-bound': { topic: 'algorithms', type: 'open', checklist: [['invariant', true], ['shrink', true], ['result', true], ['complexity', false], ['overflow', false]] },
  'algo-bfs-shortest': { topic: 'algorithms', type: 'open', checklist: [['order', true], ['dfs', true], ['memory', true], ['complexity', false], ['variants', false]] },
  'algo-top-k': { topic: 'algorithms', type: 'open', checklist: [['count', true], ['heap', true], ['complexity', true], ['alternatives', false], ['approximate', false]] },
  'algo-quicksort-pivot': { topic: 'algorithms', type: 'multiple-choice', answer: 'a', choices: [['a', false], ['b', true], ['c', true], ['d', true]] },
  'algo-nested-search': { topic: 'algorithms', type: 'multiple-choice', answer: 'b', choices: [['a', true], ['b', false], ['c', true], ['d', true]] },
};
const ORDER = Object.keys(GRADING);

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

const throwsError = (fn) => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  assert.fail('expected an error');
};

test('the deck keeps the 24 reviewed card ids, order and types', () => {
  const cards = fixtures().cards;
  assert.equal(cards.length, 24);
  assert.deepEqual(cards.map((card) => card.id), ORDER);
  assert.deepEqual(cards.map((card) => card.type), ORDER.map((id) => GRADING[id].type));
  assert.deepEqual(translatedFixtureIds(), [...ORDER].sort());
  assert.deepEqual(FIXTURE_LOCALES, ['en', 'pt-BR']);
});

test('the deck is schema version 2 at revision 2 with the draft metadata', () => {
  const deck = fixtures();
  assert.equal(deck.schemaVersion, 2);
  assert.equal(deck.revision, 2);
  assert.equal(deck.deckId, 'recall-sample');
  assert.deepEqual(deck.archived, []);
  for (const card of deck.cards) {
    assert.equal(card.level, 'mid', card.id);
    assert.equal(card.round, ROUND_OF_TOPIC[card.topic], `${card.id} round`);
    assert.deepEqual(card.provenance, { origin: 'original', author: 'ai-assisted-draft', sources: [] }, card.id);
    assert.deepEqual(card.review, { status: 'unreviewed' }, card.id);
  }
});

test('every card keeps its grading key: topic, answer, required flags, item and choice ids', () => {
  for (const card of fixtures().cards) {
    const expected = GRADING[card.id];
    assert.equal(card.topic, expected.topic, `${card.id} topic`);
    if (card.type === 'open') {
      assert.deepEqual(card.checklist.map((item) => [item.id, item.required]), expected.checklist, `${card.id} checklist`);
      assert.equal(card.choices, undefined, `${card.id} has choices`);
    } else {
      assert.equal(card.answer, expected.answer, `${card.id} answer`);
      assert.deepEqual(card.choices.map((choice) => [choice.id, choice.reason !== undefined]), expected.choices, `${card.id} choices`);
      assert.ok(card.choices.some((choice) => choice.id === card.answer), `${card.id} answer is not a choice`);
      assert.equal(new Set(card.choices.map((choice) => choice.id)).size, card.choices.length, `${card.id} duplicate choice ids`);
    }
  }
});

test('every display field has non-blank English and pt-BR text and no other locale keys', () => {
  for (const card of fixtures().cards) {
    for (const [path, text] of displayTexts(card)) {
      assert.deepEqual(Object.keys(text).sort(), ['en', 'pt-BR'], `${card.id}.${path}`);
      for (const locale of FIXTURE_LOCALES) {
        assert.ok(text[locale].trim().length > 0, `${card.id}.${path} is blank in ${locale}`);
      }
    }
  }
});

test('prompts stay within 25 English and 30 Portuguese words and ask one question', () => {
  for (const card of fixtures().cards) {
    assert.ok(words(card.prompt.en) <= 25, `${card.id} prompt en ${words(card.prompt.en)} words`);
    assert.ok(words(card.prompt['pt-BR']) <= 30, `${card.id} prompt pt-BR ${words(card.prompt['pt-BR'])} words`);
    for (const locale of FIXTURE_LOCALES) {
      assert.ok((card.prompt[locale].match(/\?/g) ?? []).length <= 1, `${card.id} prompt ${locale} has more than one question`);
    }
  }
});

test('open references stay within 60 English and 75 Portuguese words, with 1 to 3 required items', () => {
  for (const card of fixtures().cards.filter((c) => c.type === 'open')) {
    assert.ok(words(card.reference.en) <= 60, `${card.id} reference en ${words(card.reference.en)} words`);
    assert.ok(words(card.reference['pt-BR']) <= 75, `${card.id} reference pt-BR ${words(card.reference['pt-BR'])} words`);
    const required = card.checklist.filter((item) => item.required).length;
    assert.ok(required >= 1 && required <= 3, `${card.id} has ${required} required items`);
  }
});

test('choice cards have 2 to 4 options of at most 12 words in each locale', () => {
  for (const card of fixtures().cards.filter((c) => c.type === 'multiple-choice')) {
    assert.ok(card.choices.length >= 2 && card.choices.length <= 4, `${card.id} has ${card.choices.length} choices`);
    for (const choice of card.choices) {
      for (const locale of FIXTURE_LOCALES) {
        assert.ok(words(choice.text[locale]) <= 12, `${card.id}.${choice.id} ${locale} ${words(choice.text[locale])} words`);
      }
    }
  }
});

test('each launch topic has at least four open and two multiple-choice cards', () => {
  const counts = {};
  for (const card of fixtures().cards) {
    counts[card.topic] ??= { open: 0, 'multiple-choice': 0 };
    counts[card.topic][card.type] += 1;
  }
  for (const [topic, count] of Object.entries(counts)) {
    assert.ok(count.open >= 4 && count['multiple-choice'] >= 2, `${topic} ${JSON.stringify(count)}`);
  }
});

test('localizing returns a full, equal copy for each locale and never mutates the deck', () => {
  const deck = fixtures();
  const pristine = structuredClone(deck);
  for (const locale of FIXTURE_LOCALES) {
    for (const card of deck.cards) {
      const localized = localizeFixtureCard(card, locale);
      assert.deepEqual(localized, card, `${card.id} (${locale})`);
      assert.notEqual(localized, card);
      assert.equal(localized.id, card.id);
      for (const [path, text] of displayTexts(localized)) {
        assert.ok(text[locale].trim().length > 0, `${card.id}.${path} (${locale})`);
      }
    }
  }
  assert.deepEqual(deck, pristine, 'localizing mutated the input');
});

test('a localized copy shares no nested objects with the input', () => {
  const card = fixtures().cards.find((c) => c.id === 'net-l4-l7');
  const copy = localizeFixtureCard(card, 'en');
  copy.prompt.en = 'changed';
  copy.checklist[0].text.en = 'changed';
  assert.notEqual(card.prompt.en, 'changed');
  assert.notEqual(card.checklist[0].text.en, 'changed');
});

test('localized decks still pass the deck validator', async () => {
  for (const locale of FIXTURE_LOCALES) {
    const deck = fixtures();
    const localized = { ...deck, cards: deck.cards.map((card) => localizeFixtureCard(card, locale)) };
    const validated = await validateDeck(localized, { mode: 'fixtures', today: TODAY });
    assert.deepEqual(validated.cards.map((card) => card.id), ORDER);
  }
});

test('missing or unsupported locale text fails closed, naming the field and never the text', () => {
  const card = (id) => structuredClone(fixtures().cards.find((c) => c.id === id));
  const cases = [
    ['prompt without en', 'en', () => { const c = card('net-l4-l7'); delete c.prompt.en; return c; }, /net-l4-l7: prompt is missing en text/],
    ['prompt without pt-BR', 'pt-BR', () => { const c = card('net-l4-l7'); delete c.prompt['pt-BR']; return c; }, /net-l4-l7: prompt is missing pt-BR text/],
    ['blank checklist text', 'pt-BR', () => { const c = card('net-l4-l7'); c.checklist[0].text['pt-BR'] = '   '; return c; }, /net-l4-l7: checklist\.l7-routing is missing pt-BR text/],
    ['reference without en', 'en', () => { const c = card('db-n-plus-one'); delete c.reference.en; return c; }, /db-n-plus-one: reference is missing en text/],
    ['explanation without pt-BR', 'pt-BR', () => { const c = card('algo-nested-search'); delete c.explanation['pt-BR']; return c; }, /algo-nested-search: explanation is missing pt-BR text/],
    ['choice without en', 'en', () => { const c = card('algo-nested-search'); delete c.choices[0].text.en; return c; }, /algo-nested-search: choices\.a is missing en text/],
    ['distractor reason without pt-BR', 'pt-BR', () => { const c = card('sd-consistent-hashing'); delete c.choices[0].reason['pt-BR']; return c; }, /sd-consistent-hashing: reasons\.a is missing pt-BR text/],
  ];
  for (const [name, locale, build, expected] of cases) {
    const error = throwsError(() => localizeFixtureCard(build(), locale));
    assert.match(error.message, expected, `${name} (${locale})`);
    assert.ok(!/CONFIDENTIAL/.test(error.message), `${name} echoed card text`);
  }
  assert.match(throwsError(() => localizeFixtureCard(card('net-l4-l7'), 'es')).message, /unsupported locale es/);
});
