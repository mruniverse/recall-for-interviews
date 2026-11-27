import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cardContentHash, checkRevision, countWords, DeckValidationError, parseBaseline, validateDeck } from '../src/content/deck.ts';
import { approve, asSchemaOne, choiceCard, openCard, PATTERN_SOURCE, problems, sampleDeck, TODAY, TOPIC_SOURCE, words } from './content-support.mjs';

const fixtures = () => JSON.parse(readFileSync(new URL('../src/content/fixtures/deck.json', import.meta.url), 'utf8'));
const firstOpen = (deck, topic = 'networking') => deck.cards.find((card) => card.type === 'open' && card.topic === topic);
const firstChoice = (deck, topic = 'networking') => deck.cards.find((card) => card.type === 'multiple-choice' && card.topic === topic);

/** Applies `mutate` to a fresh synthetic deck and returns its problems; private decks start approved. */
async function after(mutate, mode = 'fixtures') {
  const deck = mode === 'private' ? await approve(sampleDeck()) : sampleDeck();
  await mutate(deck);
  return problems(deck, mode);
}

function expectProblem(errors, expected, name) {
  assert.ok(errors.some((line) => expected.test(line)), `${name}: ${errors.join('; ') || 'no problems'}`);
}

async function revisionProblems(previous, next) {
  try {
    checkRevision(await parseBaseline(previous, { mode: 'fixtures', today: TODAY }), await validateDeck(next, { mode: 'fixtures', today: TODAY }));
    return [];
  } catch (error) {
    assert.ok(error instanceof DeckValidationError, error);
    return error.errors;
  }
}

test('the public fixture deck is a valid unreviewed draft and never passes as a private release', async () => {
  const deck = await validateDeck(fixtures(), { mode: 'fixtures', today: TODAY });
  for (const card of deck.cards) assert.deepEqual(card.review, { status: 'unreviewed' }, card.id);
  const errors = await problems(fixtures(), 'private');
  for (const card of deck.cards) {
    assert.ok(errors.some((line) => line.startsWith(`card ${card.id}.review: must be approved for a private release`)), card.id);
  }
});

test('an unreviewed draft may have no sources; a private release needs approval and question evidence on every card', async () => {
  assert.deepEqual(await problems(sampleDeck()), []);
  const errors = await problems(sampleDeck(), 'private');
  assert.equal(errors.length, 24);
  for (const card of sampleDeck().cards) {
    assert.ok(errors.some((line) => new RegExp(`^card ${card.id}\\.review: must be approved for a private release \\(content [0-9a-f]{64}\\)$`).test(line)));
    assert.ok(errors.includes(`card ${card.id}.provenance.sources: needs a question-pattern source before approval or a private release; topic evidence alone is not enough`));
  }
  assert.deepEqual(await problems(await approve(sampleDeck()), 'private'), []);
});

test('topic minimums apply only to the topics a deck includes', async () => {
  for (const topics of [['cloud'], ['tools'], ['system-design', 'networking', 'databases', 'algorithms', 'cloud', 'tools']]) {
    assert.deepEqual(await problems(sampleDeck(topics)), [], topics.join());
  }
  const cases = [
    ['too few open cards', (d) => { d.cards.splice(d.cards.indexOf(firstOpen(d, 'cloud')), 1); }, /^topic cloud: needs at least 4 open cards \(has 3\)$/],
    ['too few choice cards', (d) => { d.cards.splice(d.cards.indexOf(firstChoice(d)), 1); }, /^topic networking: needs at least 2 multiple-choice cards \(has 1\)$/],
    ['one stray card adds its topic', (d) => { d.cards.push({ ...openCard('tools', 1) }); }, /^topic tools: needs at least 4 open cards \(has 1\)$/],
    ['unknown topic', (d) => { firstOpen(d).topic = 'frontend'; }, /\.topic: must be one of system-design, networking, databases, algorithms, cloud, tools$/],
    ['empty deck', (d) => { d.cards = []; }, /^deck\.cards: needs at least one card$/],
  ];
  for (const [name, mutate, expected] of cases) expectProblem(await after(mutate), expected, name);
});

test('words are counted on Unicode whitespace, and a code identifier is one word', () => {
  assert.equal(countWords(''), 0);
  assert.equal(countWords(' \u2003\n '), 0);
  assert.equal(countWords('  a\u00a0b\u3000c\td\u0085e\n '), 5);
  assert.equal(countWords('a\u200bb'), 1);
  assert.equal(countWords('Call Array.prototype.map(fn) on user_ids'), 4);
});

test('prompt, reference and option limits hold separately in each locale', async () => {
  const fields = [
    ['prompt', (d) => firstOpen(d).prompt, { en: 25, 'pt-BR': 30 }],
    ['reference', (d) => firstOpen(d).reference, { en: 60, 'pt-BR': 75 }],
    ['choices[0].text', (d) => firstChoice(d).choices[0].text, { en: 12, 'pt-BR': 12 }],
  ];
  for (const [field, target, limits] of fields) {
    for (const [locale, limit] of Object.entries(limits)) {
      const name = `${field}.${locale}`;
      // Padding whitespace is not a word; a non-breaking space still separates words.
      assert.deepEqual(await after((d) => { target(d)[locale] = `\u00a0 ${words(limit - 1, 'x')}\u00a0user_id.map() `; }), [], `${name} at the limit`);
      const errors = await after((d) => { target(d)[locale] = words(limit + 1, 'x').replaceAll(' ', '\u00a0'); });
      assert.deepEqual(errors.filter((line) => line.includes(name)), [`card ${name.startsWith('choices') ? 'networking-choice-1' : 'networking-open-1'}.${name}: has ${limit + 1} words; the limit is ${limit}`], name);
    }
  }
  // The Portuguese allowance does not extend to English.
  expectProblem(await after((d) => { firstOpen(d).prompt.en = words(30); }), /\.prompt\.en: has 30 words; the limit is 25$/, 'English prompt at the Portuguese limit');
});

test('open cards need one to three required points and choice cards two to four options', async () => {
  const item = (id, required) => ({ id, required, text: { en: 'Explains one point.', 'pt-BR': 'Explica um ponto.' } });
  const checklist = (required, optional = 1) => (d) => {
    firstOpen(d).checklist = [...Array.from({ length: required }, (_, i) => item(`req-${i}`, true)), ...Array.from({ length: optional }, (_, i) => item(`opt-${i}`, false))];
  };
  const choice = (id) => ({ id, text: { en: `Option ${id}`, 'pt-BR': `Opção ${id}` }, reason: { en: 'Why not.', 'pt-BR': 'Por que não.' } });
  const choices = (n) => (d) => { const card = firstChoice(d); card.choices = Array.from({ length: n }, (_, i) => choice('abcde'[i])); card.answer = 'a'; };

  for (const ok of [checklist(1, 0), checklist(3, 4), choices(2), choices(4)]) assert.deepEqual(await after(ok), []);
  const cases = [
    ['no required point', checklist(0, 3), /\.checklist: needs 1 to 3 required items \(has 0\)$/],
    ['four required points', checklist(4, 0), /\.checklist: needs 1 to 3 required items \(has 4\)$/],
    ['one option', choices(1), /\.choices: needs 2 to 4 choices \(has 1\)$/],
    ['five options', choices(5), /\.choices: needs 2 to 4 choices \(has 5\)$/],
  ];
  for (const [name, mutate, expected] of cases) expectProblem(await after(mutate), expected, name);
});

test('every display text needs non-empty English and Brazilian Portuguese', async () => {
  const fields = {
    prompt: (d) => firstOpen(d).prompt,
    explanation: (d) => firstChoice(d).explanation,
    reference: (d) => firstOpen(d).reference,
    'checklist[0].text': (d) => firstOpen(d).checklist[0].text,
    'checklist[1].text': (d) => firstOpen(d).checklist[1].text,
    'choices[1].text': (d) => firstChoice(d).choices[1].text,
    'choices[0].reason': (d) => firstChoice(d).choices[0].reason,
  };
  for (const [field, target] of Object.entries(fields)) {
    for (const locale of ['en', 'pt-BR']) {
      expectProblem(await after((d) => { delete target(d)[locale]; }), new RegExp(`\\.${field.replace(/[[\]]/g, '\\$&')}: missing ${locale}$`), `${field} without ${locale}`);
      expectProblem(await after((d) => { target(d)[locale] = ' \u00a0 '; }), new RegExp(`\\.${field.replace(/[[\]]/g, '\\$&')}\\.${locale}: must be non-empty text$`), `${field} blank ${locale}`);
    }
    expectProblem(await after((d) => { target(d).es = 'Texto'; }), /: unknown field es$/, `${field} in Spanish`);
  }
  expectProblem(await after((d) => { delete firstChoice(d).choices[0].reason; }), /\.choices\[0\]: a distractor needs a reason$/, 'distractor without reason');
  assert.deepEqual(await after((d) => { const card = firstChoice(d); card.choices[1].reason = { en: 'Right.', 'pt-BR': 'Certa.' }; }), []);
});

test('sources are HTTPS URLs or citations with known kinds and scopes, and nothing else', async () => {
  const withSource = (source) => (d) => { firstOpen(d).provenance.sources = [source]; };
  const valid = [
    PATTERN_SOURCE,
    TOPIC_SOURCE,
    { kind: 'book-course', locator: 'Kleppmann, M. Designing Data-Intensive Applications: The Big Ideas. O’Reilly, 2017.', evidenceScope: 'topic' },
  ];
  for (const source of valid) assert.deepEqual(await after(withSource(source)), [], source.locator);

  const cases = [
    ['unknown kind', { ...PATTERN_SOURCE, kind: 'blog' }, /\.sources\[0\]\.kind: must be one of official-guide, book-course, candidate-reports$/],
    ['unknown scope', { ...PATTERN_SOURCE, evidenceScope: 'frequency' }, /\.sources\[0\]\.evidenceScope: must be one of topic, question-pattern$/],
    ['empty locator', { ...PATTERN_SOURCE, locator: '  ' }, /\.sources\[0\]\.locator: must be an HTTPS URL/],
    ['placeholder locator', { ...PATTERN_SOURCE, locator: 'TBD' }, /\.locator: must be an HTTPS URL/],
    ['plain HTTP', { ...PATTERN_SOURCE, locator: 'http://example.org/reports' }, /\.locator: must be an HTTPS URL/],
    ['credentials in URL', { ...PATTERN_SOURCE, locator: 'https://user:secret@example.org/reports' }, /\.locator: must be an HTTPS URL/],
    ['scheme-less address', { ...PATTERN_SOURCE, locator: 'example.org/reports' }, /\.locator: must be an HTTPS URL/],
    ['script URL', { ...PATTERN_SOURCE, locator: 'javascript:alert(1)' }, /\.locator: must be an HTTPS URL/],
    ['citation hiding an HTTP URL', { ...PATTERN_SOURCE, locator: 'Reports at http://example.org/reports' }, /\.locator: must be an HTTPS URL/],
    ['number as locator', { ...PATTERN_SOURCE, locator: 42 }, /\.locator: must be an HTTPS URL/],
    ['blank company', { ...PATTERN_SOURCE, company: ' ' }, /\.sources\[0\]\.company: must be non-empty text when present$/],
    ['placeholder role', { ...PATTERN_SOURCE, role: 'n/a' }, /\.sources\[0\]\.role: must be non-empty text when present$/],
    ['unknown source field', { ...PATTERN_SOURCE, frequency: 'often' }, /\.sources\[0\]: unknown field frequency$/],
    ['missing locator', { kind: 'official-guide', evidenceScope: 'topic' }, /\.sources\[0\]: missing locator$/],
    ['source as text', 'https://example.org/reports', /\.sources\[0\]: must be an object$/],
  ];
  for (const [name, source, expected] of cases) expectProblem(await after(withSource(source)), expected, name);
  expectProblem(await after((d) => { firstOpen(d).provenance.sources = null; }), /\.provenance\.sources: must be an array$/, 'sources not a list');
  expectProblem(await after((d) => { delete firstOpen(d).provenance.sources; }), /\.provenance: missing sources$/, 'sources missing');
});

test('topic evidence is not question evidence: approval and private release need a question-pattern source', async () => {
  const onlyTopic = async (d) => {
    const card = firstOpen(d);
    card.provenance.sources = [TOPIC_SOURCE];
    card.review.contentHash = await cardContentHash(card);
  };
  const expected = /^card networking-open-1\.provenance\.sources: needs a question-pattern source/;
  assert.deepEqual((await after(onlyTopic, 'private')).filter((line) => !expected.test(line)), []);
  expectProblem(await after(onlyTopic, 'private'), expected, 'private');
  // An approval in a fixtures deck makes the same claim and needs the same evidence.
  const approvedFixture = await approve(sampleDeck());
  await onlyTopic(approvedFixture);
  expectProblem(await problems(approvedFixture), expected, 'approved fixture');

  assert.deepEqual(await after(async (d) => {
    const card = firstOpen(d);
    card.provenance.sources = [TOPIC_SOURCE, PATTERN_SOURCE];
    card.review.contentHash = await cardContentHash(card);
  }, 'private'), []);
  const unreviewed = sampleDeck();
  firstOpen(unreviewed).provenance.sources = [PATTERN_SOURCE];
  assert.deepEqual((await problems(unreviewed, 'private')).filter((line) => line.startsWith('card networking-open-1')), [
    `card networking-open-1.review: must be approved for a private release (content ${await cardContentHash(firstOpen(unreviewed))})`,
  ]);
});

test('an approval must be human, independent, complete, dated and bound to the reviewed content and sources', async () => {
  const cases = {
    'content edited after review': (card) => { card.prompt.en += ' Explain briefly.'; },
    'source changed after review': (card) => { card.provenance.sources[0].locator = 'https://example.org/other-report'; },
    'level changed after review': (card) => { card.level = 'senior'; },
    'reviewer is the author': (card) => { card.review.reviewer = ' author a '; },
    'placeholder reviewer': (card) => { card.review.reviewer = 'TBD'; },
    'AI reviewer': (card) => { card.review.reviewer = 'AI reviewer'; },
    'bot reviewer': (card) => { card.review.reviewer = 'review-bot'; },
    'model reviewer': (card) => { card.review.reviewer = 'GPT-5 assistant'; },
    'source relevance not checked': (card) => { card.review.checks = ['accuracy', 'trade-offs', 'rubric']; },
    'duplicated check': (card) => { card.review.checks = ['accuracy', 'trade-offs', 'rubric', 'rubric']; },
    'extra check': (card) => { card.review.checks.push('style'); },
    'review dated in the future': (card) => { card.review.reviewedAt = '2026-11-27'; },
    'impossible review date': (card) => { card.review.reviewedAt = '2026-02-30'; },
    'missing evidence': (card) => { delete card.review.evidence; },
    'placeholder evidence': (card) => { card.review.evidence = ' n/a '; },
    'unknown status': (card) => { card.review.status = 'approved-by-default'; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const deck = await approve(sampleDeck());
    const card = firstOpen(deck);
    mutate(card);
    const errors = await problems(deck, 'private');
    assert.ok(errors.length > 0, name);
    assert.ok(errors.every((line) => line.startsWith(`card ${card.id}.review`)), `${name}: ${errors.join('; ')}`);
  }
  // Names that merely contain those letters are not flagged.
  const deck = await approve(sampleDeck());
  for (const card of deck.cards) card.review.reviewer = 'Kai Botelho';
  assert.deepEqual(await problems(deck, 'private'), []);
});

test('structural problems fail closed in either mode', async () => {
  const cases = [
    ['unknown deck field', (d) => { d.mode = 'private'; }, /^deck: unknown field mode$/],
    ['unknown card field', (d) => { firstOpen(d).followUp = { en: 'Follow-up', 'pt-BR': 'Seguimento' }; }, /unknown field followUp/],
    ['missing level', (d) => { delete firstOpen(d).level; }, /^card networking-open-1: missing level$/],
    ['unknown level', (d) => { firstOpen(d).level = 'staff'; }, /\.level: must be one of junior, mid, senior$/],
    ['missing round', (d) => { delete firstChoice(d).round; }, /^card networking-choice-1: missing round$/],
    ['unknown round', (d) => { firstChoice(d).round = 'behavioral'; }, /\.round: must be one of fundamentals, coding, system-design$/],
    ['choices on an open card', (d) => { firstOpen(d).choices = []; }, /unknown field choices/],
    ['duplicate checklist id', (d) => { const list = firstOpen(d).checklist; list[1].id = list[0].id; }, /checklist\[1\]\.id: duplicates/],
    ['duplicate Portuguese option', (d) => { const c = firstChoice(d).choices; c[2].text['pt-BR'] = ` ${c[0].text['pt-BR'].toUpperCase()} `; }, /choices\[2\]\.text\.pt-BR: duplicates another choice$/],
    ['answer outside the choices', (d) => { firstChoice(d).answer = 'z'; }, /\.answer: must match a choice id/],
    ['duplicate card id', (d) => { d.cards[1].id = d.cards[0].id; }, /\.id: duplicates/],
    ['archived id reused', (d) => { d.archived.push(d.cards[0].id); }, /\.id: duplicates/],
    ['unknown type', (d) => { firstOpen(d).type = 'essay'; }, /\.type: must be open or multiple-choice/],
    ['non-original provenance', (d) => { firstOpen(d).provenance.origin = 'adapted'; }, /provenance\.origin: must be original/],
    ['unknown provenance field', (d) => { firstOpen(d).provenance.verified = true; }, /provenance: unknown field verified$/],
    ['approval without a record', (d) => { firstOpen(d).review = { status: 'approved' }; }, /\.review: missing reviewer/],
    ['schema 1', (d) => { d.schemaVersion = 1; }, /^deck\.schemaVersion: must be 2$/],
    ['non-integer revision', (d) => { d.revision = 1.5; }, /^deck\.revision: must be a positive integer$/],
  ];
  for (const [name, mutate, expected] of cases) {
    for (const mode of ['fixtures', 'private']) expectProblem(await after(mutate, mode), expected, `${name} (${mode})`);
  }
  assert.deepEqual(await problems(null), ['deck: must be an object']);
  assert.deepEqual(await problems([]), ['deck: must be an object']);
});

test('validation errors name fields without echoing card text or source locators', async () => {
  const deck = sampleDeck();
  const card = firstOpen(deck);
  card.prompt = { en: words(40, 'CONFIDENTIAL') };
  card.checklist[0].text = { 'pt-BR': 'CONFIDENTIAL-ITEM' };
  card.provenance.sources = [{ ...PATTERN_SOURCE, locator: 'http://CONFIDENTIAL.example.org', company: '' }];
  firstChoice(deck).choices[0].text.en = 'CONFIDENTIAL-CHOICE';
  firstChoice(deck).choices[1].text.en = 'confidential-choice';
  const errors = await problems(deck);
  assert.ok(errors.length >= 5, errors.join('; '));
  assert.ok(errors.every((line) => !/confidential/i.test(line)), errors.join('; '));
});

test('a new revision keeps ids only while their meaning is unchanged and archives removed cards', async () => {
  const bump = (mutate) => { const d = sampleDeck(); d.revision = 2; mutate(d); return d; };
  const replaceCard = (d) => { const card = firstOpen(d); const old = card.id; card.id = `${old}-v2`; return old; };

  assert.deepEqual(await revisionProblems(sampleDeck(), sampleDeck()), []);
  assert.deepEqual(await revisionProblems(sampleDeck(), bump((d) => { firstOpen(d).reference.en = firstOpen(d).reference.en.replace('cuts', 'reduces'); })), []);
  assert.deepEqual(await revisionProblems(sampleDeck(), bump((d) => { firstOpen(d).level = 'senior'; firstChoice(d).choices.pop(); })), []);
  assert.deepEqual(await revisionProblems(sampleDeck(), bump((d) => { d.archived.push(replaceCard(d)); })), []);
  // Provenance is not shipped content, so a new source alone needs no revision.
  assert.deepEqual(await revisionProblems(sampleDeck(), (() => { const d = sampleDeck(); firstOpen(d).provenance.sources = [TOPIC_SOURCE]; return d; })()), []);

  const cases = [
    ['content change at the same revision', (d) => { d.revision = 1; firstOpen(d).reference.en += ' Briefly.'; }, /^deck\.revision: must increase/],
    ['level change at the same revision', (d) => { d.revision = 1; firstOpen(d).level = 'senior'; }, /^deck\.revision: must increase/],
    ['different correct choice', (d) => { const c = firstChoice(d); c.answer = 'a'; c.choices[1].reason = { en: 'Why not.', 'pt-BR': 'Por que não.' }; delete c.choices[0].reason; }, /networking-choice-1: .*needs a new card id/],
    ['different required checklist', (d) => { firstOpen(d).checklist[1].required = true; }, /networking-open-1: .*needs a new card id/],
    ['different topic', (d) => { firstOpen(d, 'cloud').topic = 'tools'; d.cards.push(...[2, 3, 4].map((n) => openCard('tools', n)), ...[1, 2].map((n) => choiceCard('tools', n))); d.cards.push(openCard('cloud', 5)); }, /cloud-open-1: .*needs a new card id/],
    ['card type changed', (d) => { const open = firstOpen(d); const choice = firstChoice(d); [open.id, choice.id] = [choice.id, open.id]; }, /needs a new card id/],
    ['removed id not archived', (d) => { replaceCard(d); }, /^card networking-open-1: a removed card must be listed in archived$/],
    ['deck renamed', (d) => { d.deckId = 'other-deck'; }, /^deck\.deckId: must not change/],
  ];
  for (const [name, mutate, expected] of cases) expectProblem(await revisionProblems(sampleDeck(), bump(mutate)), expected, name);

  expectProblem(await revisionProblems(bump(() => {}), sampleDeck()), /^deck\.revision: must increase/, 'lower revision');
  const archivedBefore = bump((d) => { d.archived.push(replaceCard(d)); });
  const unarchived = bump((d) => { replaceCard(d); });
  unarchived.revision = 3;
  expectProblem(await revisionProblems(archivedBefore, unarchived), /^deck\.archived: networking-open-1 must stay archived$/, 'archive dropped');
});

test('a typo fix may keep the id but needs a new approval', async () => {
  const deck = await approve(sampleDeck());
  firstOpen(deck).reference.en = firstOpen(deck).reference.en.replace('cuts', 'reduces');
  expectProblem(await problems(deck, 'private'), /^card networking-open-1\.review\.contentHash: does not match the current content/, 'typo after review');
});

test('a schema-1 baseline is compared on what it shares; any other baseline is refused explicitly', async () => {
  const v1 = asSchemaOne(sampleDeck());
  const legacy = await parseBaseline(v1, { mode: 'private', today: TODAY });
  assert.equal(legacy.schemaVersion, 1);

  const next = (mutate = () => {}) => { const d = sampleDeck(); d.revision = 2; mutate(d); return d; };
  assert.deepEqual(await revisionProblems(v1, next()), []);
  const cases = [
    ['schema change at the same revision', (d) => { d.revision = 1; }, /^deck\.revision: must increase/],
    ['different correct choice', (d) => { const c = firstChoice(d); c.answer = 'a'; c.choices[1].reason = { en: 'Why not.', 'pt-BR': 'Por que não.' }; delete c.choices[0].reason; }, /networking-choice-1: .*needs a new card id/],
    ['different required checklist', (d) => { firstOpen(d).checklist[1].required = true; }, /networking-open-1: .*needs a new card id/],
    ['removed id not archived', (d) => { firstOpen(d).id = 'networking-open-9'; }, /^card networking-open-1: a removed card must be listed in archived$/],
  ];
  for (const [name, mutate, expected] of cases) expectProblem(await revisionProblems(v1, next(mutate)), expected, name);

  const malformed = [
    ['card without type', (d) => { delete d.cards[0].type; }, /^previous card networking-open-1\.type: must be open or multiple-choice$/],
    ['checklist without flags', (d) => { delete d.cards[0].checklist[0].required; }, /^previous card networking-open-1\.checklist: must list items/],
    ['open card without checklist', (d) => { delete d.cards[0].checklist; }, /^previous card networking-open-1\.checklist: must list items/],
    ['choice without answer', (d) => { delete d.cards[4].answer; }, /^previous card networking-choice-1\.answer: must be a choice id$/],
    ['no cards', (d) => { delete d.cards; }, /^previous deck\.cards: must be an array$/],
    ['bad revision', (d) => { d.revision = 0; }, /^previous deck\.revision: must be a positive integer$/],
    ['duplicate id', (d) => { d.archived.push(d.cards[0].id); }, /^previous card networking-open-1\.id: duplicates another id$/],
    ['unknown schema', (d) => { d.schemaVersion = 3; }, /^previous deck\.schemaVersion: only schema 1 or 2 can be compared; a reviewed migration is required first$/],
    ['schema as text', (d) => { d.schemaVersion = '1'; }, /^previous deck\.schemaVersion: only schema 1 or 2/],
    ['no schema', (d) => { delete d.schemaVersion; }, /^previous deck\.schemaVersion: only schema 1 or 2/],
  ];
  for (const [name, mutate, expected] of malformed) {
    const baseline = asSchemaOne(sampleDeck());
    mutate(baseline);
    expectProblem(await revisionProblems(baseline, next()), expected, name);
  }
  // A schema-2 baseline gets the full validator, with the same prefix.
  const invalid = sampleDeck();
  firstOpen(invalid).level = 'staff';
  expectProblem(await revisionProblems(invalid, next()), /^previous card networking-open-1\.level: must be one of/, 'invalid schema-2 baseline');
  expectProblem(await revisionProblems(null, next()), /^previous deck: must be an object$/, 'not a deck');
});
