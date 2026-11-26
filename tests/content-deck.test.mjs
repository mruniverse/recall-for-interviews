import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cardContentHash, checkRevision, DeckValidationError, validateDeck } from '../src/content/deck.ts';

const TODAY = '2026-11-26';
const fixtures = () => JSON.parse(readFileSync(new URL('../src/content/fixtures/deck.json', import.meta.url), 'utf8'));
const openCard = (deck, topic = 'networking') => deck.cards.find((card) => card.type === 'open' && card.topic === topic);
const choiceCard = (deck, topic = 'networking') => deck.cards.find((card) => card.type === 'multiple-choice' && card.topic === topic);

// Synthetic approvals exist only in tests; the public fixtures carry none.
async function approve(deck) {
  for (const card of deck.cards) {
    card.provenance.author = 'Author A';
    card.review = {
      status: 'approved',
      reviewer: 'Reviewer B',
      reviewedAt: '2026-11-20',
      checks: ['accuracy', 'trade-offs', 'rubric'],
      evidence: 'review-log.md#2026-11-20',
      contentHash: await cardContentHash(card),
    };
  }
  return deck;
}

async function problems(input, mode = 'fixtures') {
  try {
    await validateDeck(input, { mode, today: TODAY });
    return [];
  } catch (error) {
    assert.ok(error instanceof DeckValidationError, error);
    return error.errors;
  }
}

async function revisionProblems(previous, next) {
  try {
    checkRevision(await validateDeck(previous, { mode: 'fixtures', today: TODAY }), await validateDeck(next, { mode: 'fixtures', today: TODAY }));
    return [];
  } catch (error) {
    assert.ok(error instanceof DeckValidationError, error);
    return error.errors;
  }
}

test('public fixtures pass the validator and carry no human approval', async () => {
  const deck = await validateDeck(fixtures(), { mode: 'fixtures', today: TODAY });
  assert.equal(deck.cards.length, 24);
  for (const card of deck.cards) {
    assert.equal(card.provenance.origin, 'original');
    assert.deepEqual(card.review, { status: 'unreviewed' });
  }
});

test('private mode rejects unreviewed cards and accepts documented independent approvals', async () => {
  const unreviewed = await problems(fixtures(), 'private');
  assert.equal(unreviewed.length, 24);
  assert.ok(unreviewed.every((line) => /\.review: must be approved for a private release \(content [0-9a-f]{64}\)$/.test(line)));
  assert.deepEqual(await problems(await approve(fixtures()), 'private'), []);
});

test('an approval must be independent, complete, dated and bound to the reviewed content', async () => {
  const cases = {
    'content edited after review': (card) => { card.prompt.en += ' Explain briefly.'; },
    'reviewer is the author': (card) => { card.review.reviewer = ' author a '; },
    'placeholder reviewer': (card) => { card.review.reviewer = 'TBD'; },
    'missing rubric check': (card) => { card.review.checks = ['accuracy', 'trade-offs', 'trade-offs']; },
    'review dated in the future': (card) => { card.review.reviewedAt = '2026-11-27'; },
    'impossible review date': (card) => { card.review.reviewedAt = '2026-02-30'; },
    'missing evidence': (card) => { delete card.review.evidence; },
    'placeholder evidence': (card) => { card.review.evidence = ' n/a '; },
    'unknown status': (card) => { card.review.status = 'approved-by-default'; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const deck = await approve(fixtures());
    const card = openCard(deck);
    mutate(card);
    const errors = await problems(deck, 'private');
    assert.ok(errors.length > 0, name);
    assert.ok(errors.every((line) => line.startsWith(`card ${card.id}.review`)), `${name}: ${errors.join('; ')}`);
  }
});

test('structural problems fail closed in either mode', async () => {
  const cases = [
    ['unknown card field', (d) => { openCard(d).followUp = { en: 'Unpublished follow-up' }; }, /unknown field followUp/],
    ['prompt without English', (d) => { openCard(d).prompt = { 'pt-BR': 'Pergunta' }; }, /\.prompt: missing en/],
    ['explanation without pt-BR', (d) => { openCard(d).explanation = { en: 'Explanation' }; }, /\.explanation: missing pt-BR/],
    ['unsupported locale', (d) => { openCard(d).reference.es = 'Respuesta'; }, /\.reference: unknown field es/],
    ['reference without English', (d) => { openCard(d).reference = { 'pt-BR': 'Resposta' }; }, /\.reference: missing en/],
    ['blank reference', (d) => { openCard(d).reference.en = '   '; }, /\.reference\.en: must be non-empty text/],
    ['required checklist item only in pt-BR', (d) => { openCard(d).checklist[0].text = { 'pt-BR': 'Item' }; }, /\.checklist\[0\]\.text: missing en/],
    ['no required checklist item', (d) => { for (const item of openCard(d).checklist) item.required = false; }, /needs at least one required item/],
    ['duplicate checklist id', (d) => { const list = openCard(d).checklist; list[1].id = list[0].id; }, /checklist\[1\]\.id: duplicates/],
    ['distractor without reason', (d) => { const c = choiceCard(d); delete c.choices.find((x) => x.id !== c.answer).reason; }, /a distractor needs a pt-BR reason/],
    ['distractor reason only in English', (d) => { const c = choiceCard(d); c.choices.find((x) => x.id !== c.answer).reason = { en: 'Why' }; }, /\.reason: missing pt-BR/],
    ['choice without English', (d) => { choiceCard(d).choices[0].text = { 'pt-BR': 'Opção' }; }, /\.choices\[0\]\.text: missing en/],
    ['answer outside the choices', (d) => { choiceCard(d).answer = 'z'; }, /\.answer: must match a choice id/],
    ['duplicate choice text', (d) => { const c = choiceCard(d).choices; c[1].text = { en: ` ${c[0].text.en.toUpperCase()} ` }; }, /duplicates another choice/],
    ['choices on an open card', (d) => { openCard(d).choices = []; }, /unknown field choices/],
    ['duplicate card id', (d) => { d.cards[1].id = d.cards[0].id; }, /\.id: duplicates/],
    ['archived id reused', (d) => { d.archived.push(d.cards[0].id); }, /\.id: duplicates/],
    ['unknown topic', (d) => { openCard(d).topic = 'frontend'; }, /\.topic: must be one of/],
    ['unknown type', (d) => { openCard(d).type = 'essay'; }, /\.type: must be open or multiple-choice/],
    ['too few open cards', (d) => { d.cards.splice(d.cards.indexOf(openCard(d, 'databases')), 1); }, /topic databases: needs at least 4 open cards \(has 3\)/],
    ['too few multiple-choice cards', (d) => { d.cards.splice(d.cards.indexOf(choiceCard(d, 'algorithms')), 1); }, /topic algorithms: needs at least 2 multiple-choice cards \(has 1\)/],
    ['non-original provenance', (d) => { openCard(d).provenance.origin = 'adapted'; }, /provenance\.origin: must be original/],
    ['approval without a record', (d) => { openCard(d).review = { status: 'approved' }; }, /\.review: missing reviewer/],
    ['unsupported schema', (d) => { d.schemaVersion = 2; }, /deck\.schemaVersion: must be 1/],
    ['non-integer revision', (d) => { d.revision = 1.5; }, /deck\.revision: must be a positive integer/],
  ];
  for (const [name, mutate, expected] of cases) {
    for (const mode of ['fixtures', 'private']) {
      const deck = mode === 'private' ? await approve(fixtures()) : fixtures();
      mutate(deck);
      const errors = await problems(deck, mode);
      assert.ok(errors.some((line) => expected.test(line)), `${name} (${mode}): ${errors.join('; ')}`);
    }
  }
  assert.deepEqual(await problems(null), ['deck: must be an object']);
  assert.deepEqual(await problems([]), ['deck: must be an object']);
});

test('validation errors name fields without echoing card text', async () => {
  const deck = fixtures();
  const card = openCard(deck);
  card.prompt = { 'pt-BR': 'CONFIDENTIAL-PROMPT' };
  card.checklist[0].text = { 'pt-BR': 'CONFIDENTIAL-ITEM' };
  const errors = await problems(deck);
  assert.ok(errors.length >= 2);
  assert.ok(errors.every((line) => !line.includes('CONFIDENTIAL')));
});

test('a new revision keeps ids for typo edits but needs new ids for meaning changes', async () => {
  const bump = (mutate) => { const d = fixtures(); d.revision = 2; mutate(d); return d; };
  const replaceCard = (d) => { const card = openCard(d); const old = card.id; card.id = `${old}-v2`; return old; };

  assert.deepEqual(await revisionProblems(fixtures(), fixtures()), []);
  assert.deepEqual(await revisionProblems(fixtures(), bump((d) => { openCard(d).reference.en += ' '; })), []);
  assert.deepEqual(await revisionProblems(fixtures(), bump((d) => { d.archived.push(replaceCard(d)); })), []);

  const cases = [
    ['content change at the same revision', (d) => { d.revision = 1; openCard(d).reference.en += ' '; }, /deck\.revision: must increase/],
    ['different correct choice', (d) => { const c = choiceCard(d); c.answer = c.choices.find((x) => x.id !== c.answer).id; for (const x of c.choices) x.reason ??= { 'pt-BR': 'Motivo' }; }, /needs a new card id/],
    ['different required checklist', (d) => { openCard(d).checklist.find((item) => !item.required).required = true; }, /needs a new card id/],
    ['card type changed', (d) => { const open = openCard(d); const choice = choiceCard(d); [open.id, choice.id] = [choice.id, open.id]; }, /needs a new card id/],
    ['removed id not archived', (d) => { replaceCard(d); }, /a removed card must be listed in archived/],
  ];
  for (const [name, mutate, expected] of cases) {
    const errors = await revisionProblems(fixtures(), bump(mutate));
    assert.ok(errors.some((line) => expected.test(line)), `${name}: ${errors.join('; ')}`);
  }

  const lower = await revisionProblems(bump(() => {}), fixtures());
  assert.ok(lower.some((line) => /deck\.revision: must increase/.test(line)), lower.join('; '));

  const archivedBefore = bump((d) => { d.archived.push(replaceCard(d)); });
  const unarchived = bump((d) => { replaceCard(d); });
  unarchived.revision = 3;
  const errors = await revisionProblems(archivedBefore, unarchived);
  assert.ok(errors.some((line) => /deck\.archived: .* must stay archived/.test(line)), errors.join('; '));
});
