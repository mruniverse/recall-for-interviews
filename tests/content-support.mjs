// Synthetic schema-2 decks for the content tests (not a test file itself). Every card is short,
// bilingual and inside each limit, so a test changes exactly one thing. The sources and approvals
// here are fabricated test data; no real deck carries them.
import assert from 'node:assert/strict';
import { cardContentHash, DeckValidationError, validateDeck } from '../src/content/deck.ts';

export const TODAY = '2026-11-26';

export const PATTERN_SOURCE = {
  kind: 'candidate-reports',
  locator: 'https://example.org/interview-reports/rate-limiting',
  evidenceScope: 'question-pattern',
  company: 'Example Corp',
  role: 'Software Engineer',
};
export const TOPIC_SOURCE = { kind: 'official-guide', locator: 'https://example.org/prep/topics', evidenceScope: 'topic' };

/** `n` copies of `word` separated by single spaces. */
export const words = (n, word = 'word') => Array.from({ length: n }, () => word).join(' ');

const draft = () => ({ provenance: { origin: 'original', author: 'Author A', sources: [] }, review: { status: 'unreviewed' } });

export const openCard = (topic, n) => ({
  id: `${topic}-open-${n}`,
  topic,
  level: 'mid',
  round: 'fundamentals',
  type: 'open',
  prompt: { en: 'Why would a service put a cache in front of its database?', 'pt-BR': 'Por que um serviço colocaria um cache na frente do banco de dados?' },
  reference: {
    en: 'Repeated reads are served from memory, which cuts latency and database load, at the cost of possibly stale data.',
    'pt-BR': 'Leituras repetidas são atendidas pela memória, o que reduz a latência e a carga do banco, ao custo de dados possivelmente desatualizados.',
  },
  checklist: [
    { id: 'skip-database', required: true, text: { en: 'Explains that repeated reads skip the database.', 'pt-BR': 'Explica que leituras repetidas evitam o banco.' } },
    { id: 'staleness', required: false, text: { en: 'Names stale data as the cost.', 'pt-BR': 'Cita dados desatualizados como custo.' } },
  ],
  explanation: { en: 'A cache trades freshness for speed.', 'pt-BR': 'Um cache troca atualização por velocidade.' },
  ...draft(),
});

export const choiceCard = (topic, n) => ({
  id: `${topic}-choice-${n}`,
  topic,
  level: 'junior',
  round: 'fundamentals',
  type: 'multiple-choice',
  prompt: { en: 'Which status code tells a client it exceeded a rate limit?', 'pt-BR': 'Qual código de status avisa um cliente que excedeu um limite de taxa?' },
  choices: [
    { id: 'a', text: { en: '403 Forbidden', 'pt-BR': '403 Forbidden' }, reason: { en: '403 means missing permission.', 'pt-BR': '403 indica falta de permissão.' } },
    { id: 'b', text: { en: '429 Too Many Requests', 'pt-BR': '429 Too Many Requests' } },
    { id: 'c', text: { en: '503 Service Unavailable', 'pt-BR': '503 Service Unavailable' }, reason: { en: '503 means the server is down.', 'pt-BR': '503 indica servidor indisponível.' } },
  ],
  answer: 'b',
  explanation: { en: '429 asks the client to slow down.', 'pt-BR': '429 pede que o cliente desacelere.' },
  ...draft(),
});

/** A valid unreviewed deck with four open and two multiple-choice cards per topic. */
export function sampleDeck(topics = ['networking', 'cloud']) {
  const cards = topics.flatMap((topic) => [
    ...[1, 2, 3, 4].map((n) => openCard(topic, n)),
    ...[1, 2].map((n) => choiceCard(topic, n)),
  ]);
  return { schemaVersion: 2, deckId: 'synthetic-deck', revision: 1, archived: [], cards };
}

/** Adds a question-pattern source where a card has none, then a synthetic approval of its content. */
export async function approve(deck) {
  for (const card of deck.cards) {
    if (card.provenance.sources.length === 0) card.provenance.sources = [structuredClone(PATTERN_SOURCE)];
    card.review = {
      status: 'approved',
      reviewer: 'Reviewer B',
      reviewedAt: '2026-11-20',
      checks: ['accuracy', 'trade-offs', 'rubric', 'source'],
      evidence: 'review-log.md#2026-11-20',
      contentHash: await cardContentHash(card),
    };
  }
  return deck;
}

/** The same deck in schema 1: no level, round or sources. */
export function asSchemaOne(deck) {
  const v1 = structuredClone(deck);
  v1.schemaVersion = 1;
  for (const card of v1.cards) {
    delete card.level;
    delete card.round;
    delete card.provenance.sources;
  }
  return v1;
}

/** @returns The validation problems, or [] when the deck is valid. */
export async function problems(input, mode = 'fixtures') {
  try {
    await validateDeck(input, { mode, today: TODAY });
    return [];
  } catch (error) {
    assert.ok(error instanceof DeckValidationError, error);
    return error.errors;
  }
}
