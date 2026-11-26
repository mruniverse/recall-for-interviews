// Deck schema and validator. Runs in Node (tests and the Release build step), never in the app
// bundle: the app imports only the prepared output and these types.

/** Launch topics; each needs at least four open and two multiple-choice cards. */
export const TOPICS = ['system-design', 'networking', 'databases', 'algorithms'] as const;
/** What an independent reviewer must confirm before a card ships. */
export const REVIEW_CHECKS = ['accuracy', 'trade-offs', 'rubric'] as const;

export type Topic = (typeof TOPICS)[number];
export type DeckMode = 'fixtures' | 'private';
export type LocalizedText = { en?: string; 'pt-BR'?: string };
export type ChecklistItem = { id: string; required: boolean; text: LocalizedText };
export type Choice = { id: string; text: LocalizedText; reason?: LocalizedText };
export type Review =
  | { status: 'unreviewed' }
  | {
      status: 'approved';
      reviewer: string;
      reviewedAt: string;
      checks: string[];
      evidence: string;
      contentHash: string;
    };
type CardBase = {
  id: string;
  topic: Topic;
  prompt: LocalizedText;
  explanation: LocalizedText;
  provenance: { origin: 'original'; author: string };
  review: Review;
};
export type OpenCard = CardBase & { type: 'open'; reference: LocalizedText; checklist: ChecklistItem[] };
export type ChoiceCard = CardBase & { type: 'multiple-choice'; choices: Choice[]; answer: string };
export type Card = OpenCard | ChoiceCard;
export type Deck = { schemaVersion: 1; deckId: string; revision: number; archived: string[]; cards: Card[] };
export type BundledCard = Omit<OpenCard, 'provenance' | 'review'> | Omit<ChoiceCard, 'provenance' | 'review'>;
/** What the app bundles: authorship and review records stay out of the binary. */
export type BundledDeck = Omit<Deck, 'cards'> & { mode: DeckMode; cards: BundledCard[] };

export class DeckValidationError extends Error {
  errors: string[];

  constructor(errors: string[]) {
    super(`invalid deck (${errors.length} problem${errors.length === 1 ? '' : 's'})`);
    this.name = 'DeckValidationError';
    this.errors = errors;
  }
}

type Json = Record<string, unknown>;
type Locale = 'en' | 'pt-BR';

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLACEHOLDER = /^(?:tbd|todo|n\/?a|none|unknown|placeholder|example|sample|fixture|test|reviewer|-+)$/i;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

function isCivilDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value);
}

function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function bundled(card: Card): BundledCard {
  const { provenance: _provenance, review: _review, ...content } = card;
  return content;
}

/**
 * Hashes everything in a card except its review record.
 * @param card
 * @returns Lowercase SHA-256 hex; an approval is valid only while it matches this value.
 */
export async function cardContentHash(card: Card): Promise<string> {
  const { review: _review, ...content } = card;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(content)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Validates a parsed deck. Fixtures and private decks share every rule; private mode additionally
 * requires each card to carry a documented, independent approval of its current content.
 * @param input Parsed JSON.
 * @param options `today` (YYYY-MM-DD) bounds review dates; defaults to the local date.
 * @returns The same object typed as a Deck.
 * @throws DeckValidationError listing every problem by field path, without echoing card text.
 */
export async function validateDeck(input: unknown, options: { mode: DeckMode; today?: string }): Promise<Deck> {
  const errors: string[] = [];
  const problem = (path: string, message: string) => errors.push(`${path}: ${message}`);
  const today = options.today ?? localToday();
  const seen = new Set<unknown>();
  const counts = new Map(TOPICS.map((topic) => [topic as unknown, { open: 0, 'multiple-choice': 0 }]));

  function shape(path: string, value: unknown, required: string[], optional: string[] = []): value is Json {
    if (!isObject(value)) {
      problem(path, 'must be an object');
      return false;
    }
    for (const key of required) if (!Object.hasOwn(value, key)) problem(path, `missing ${key}`);
    for (const key of Object.keys(value)) {
      if (!required.includes(key) && !optional.includes(key)) problem(path, `unknown field ${key}`);
    }
    return true;
  }

  function id(path: string, value: unknown, unique?: Set<unknown>) {
    if (typeof value !== 'string' || value.length > 64 || !ID.test(value)) problem(path, 'must be a kebab-case id');
    if (unique?.has(value)) problem(path, 'duplicates another id');
    unique?.add(value);
  }

  // Absent required fields are reported by `shape`; this checks the ones that are present.
  function text(path: string, value: unknown, locales: Locale[]) {
    if (value === undefined || !shape(path, value, [], ['en', 'pt-BR'])) return;
    if (Object.keys(value).length === 0) problem(path, 'needs at least one locale');
    for (const [locale, entry] of Object.entries(value)) if (!isText(entry)) problem(`${path}.${locale}`, 'must be non-empty text');
    for (const locale of locales) if (!Object.hasOwn(value, locale)) problem(path, `missing ${locale}`);
  }

  function checkOpen(path: string, card: Json) {
    text(`${path}.reference`, card.reference, ['en']);
    if (!Array.isArray(card.checklist)) {
      problem(`${path}.checklist`, 'must be an array');
      return;
    }
    if (!card.checklist.some((item) => isObject(item) && item.required === true)) {
      problem(`${path}.checklist`, 'needs at least one required item');
    }
    const itemIds = new Set<unknown>();
    card.checklist.forEach((item: unknown, index: number) => {
      const at = `${path}.checklist[${index}]`;
      if (!shape(at, item, ['id', 'required', 'text'])) return;
      id(`${at}.id`, item.id, itemIds);
      if (typeof item.required !== 'boolean') problem(`${at}.required`, 'must be true or false');
      text(`${at}.text`, item.text, item.required === true ? ['en'] : []);
    });
  }

  function checkChoices(path: string, card: Json) {
    if (!Array.isArray(card.choices) || card.choices.length < 2) {
      problem(`${path}.choices`, 'needs at least two choices');
      return;
    }
    const choiceIds = new Set<unknown>();
    const texts = new Set<string>();
    card.choices.forEach((choice: unknown, index: number) => {
      const at = `${path}.choices[${index}]`;
      if (!shape(at, choice, ['id', 'text'], ['reason'])) return;
      id(`${at}.id`, choice.id, choiceIds);
      text(`${at}.text`, choice.text, ['en']);
      const en = isObject(choice.text) && isText(choice.text.en) ? choice.text.en.trim().toLowerCase() : undefined;
      if (en !== undefined && texts.has(en)) problem(`${at}.text.en`, 'duplicates another choice');
      if (en !== undefined) texts.add(en);
      const distractor = choice.id !== card.answer;
      if (distractor && choice.reason === undefined) problem(at, 'a distractor needs a pt-BR reason');
      text(`${at}.reason`, choice.reason, distractor ? ['pt-BR'] : []);
    });
    if (!choiceIds.has(card.answer)) problem(`${path}.answer`, 'must match a choice id');
  }

  function checkReview(path: string, card: Json, hash: string) {
    const at = `${path}.review`;
    const review = card.review;
    if (isObject(review) && review.status === 'unreviewed') {
      shape(at, review, ['status']);
      if (options.mode === 'private') problem(at, `must be approved for a private release (content ${hash})`);
      return;
    }
    if (!shape(at, review, ['status', 'reviewer', 'reviewedAt', 'checks', 'evidence', 'contentHash'])) return;
    if (review.status !== 'approved') {
      problem(`${at}.status`, 'must be unreviewed or approved');
      return;
    }
    const author = isObject(card.provenance) && isText(card.provenance.author) ? card.provenance.author.trim().toLowerCase() : '';
    if (!isText(review.reviewer) || PLACEHOLDER.test(review.reviewer.trim())) problem(`${at}.reviewer`, 'must name the reviewer');
    else if (review.reviewer.trim().toLowerCase() === author) problem(`${at}.reviewer`, 'must be someone other than the author');
    if (!isCivilDate(review.reviewedAt) || review.reviewedAt > today) problem(`${at}.reviewedAt`, 'must be a YYYY-MM-DD date not after today');
    const checks = Array.isArray(review.checks) ? review.checks : [];
    if (checks.length !== REVIEW_CHECKS.length || !REVIEW_CHECKS.every((check) => checks.includes(check))) {
      problem(`${at}.checks`, `must list ${REVIEW_CHECKS.join(', ')}`);
    }
    if (!isText(review.evidence) || PLACEHOLDER.test(review.evidence.trim())) problem(`${at}.evidence`, 'must point to the review record');
    if (review.contentHash !== hash) problem(`${at}.contentHash`, `does not match the current content (${hash}); review the card again`);
  }

  function checkCard(index: number, card: unknown, hash: string) {
    const path = isObject(card) && typeof card.id === 'string' && ID.test(card.id) ? `card ${card.id}` : `cards[${index}]`;
    const type = isObject(card) ? card.type : undefined;
    const specific = type === 'open' ? ['reference', 'checklist'] : type === 'multiple-choice' ? ['choices', 'answer'] : [];
    if (!shape(path, card, ['id', 'topic', 'type', 'prompt', 'explanation', 'provenance', 'review', ...specific])) return;
    id(`${path}.id`, card.id, seen);
    const count = counts.get(card.topic);
    if (!count) problem(`${path}.topic`, `must be one of ${TOPICS.join(', ')}`);
    if (type === 'open' || type === 'multiple-choice') {
      if (count) count[type] += 1;
    } else {
      problem(`${path}.type`, 'must be open or multiple-choice');
    }
    text(`${path}.prompt`, card.prompt, ['en']);
    text(`${path}.explanation`, card.explanation, ['pt-BR']);
    if (shape(`${path}.provenance`, card.provenance, ['origin', 'author'])) {
      if (card.provenance.origin !== 'original') problem(`${path}.provenance.origin`, 'must be original');
      if (!isText(card.provenance.author)) problem(`${path}.provenance.author`, 'must be non-empty text');
    }
    if (type === 'open') checkOpen(path, card);
    if (type === 'multiple-choice') checkChoices(path, card);
    checkReview(path, card, hash);
  }

  if (!shape('deck', input, ['schemaVersion', 'deckId', 'revision', 'archived', 'cards'])) throw new DeckValidationError(errors);
  if (input.schemaVersion !== 1) problem('deck.schemaVersion', 'must be 1');
  id('deck.deckId', input.deckId);
  if (!Number.isSafeInteger(input.revision) || (input.revision as number) < 1) problem('deck.revision', 'must be a positive integer');
  if (Array.isArray(input.archived)) input.archived.forEach((value, index) => id(`deck.archived[${index}]`, value, seen));
  else problem('deck.archived', 'must be an array');
  if (Array.isArray(input.cards)) {
    const hashes = await Promise.all(input.cards.map((card) => (isObject(card) ? cardContentHash(card as Card) : '')));
    input.cards.forEach((card, index) => checkCard(index, card, hashes[index]));
  } else {
    problem('deck.cards', 'must be an array');
  }
  for (const [topic, count] of counts) {
    if (count.open < 4) problem(`topic ${topic}`, `needs at least 4 open cards (has ${count.open})`);
    if (count['multiple-choice'] < 2) problem(`topic ${topic}`, `needs at least 2 multiple-choice cards (has ${count['multiple-choice']})`);
  }
  if (errors.length > 0) throw new DeckValidationError(errors);
  return input as unknown as Deck;
}

const identity = (card: Card) =>
  card.type === 'open'
    ? `open:${card.checklist.filter((item) => item.required).map((item) => item.id).sort().join(',')}`
    : `multiple-choice:${card.answer}`;

/**
 * Compares two validated revisions of one deck.
 * @param previous The revision already shipped.
 * @param next The candidate revision.
 * @throws DeckValidationError when a kept id changes its type, correct choice or required checklist
 *   items, a removed id is not archived, an archived id is dropped, or content changes without a
 *   higher revision.
 */
export function checkRevision(previous: Deck, next: Deck): void {
  const errors: string[] = [];
  const current = new Map(next.cards.map((card) => [card.id, card]));
  const archived = new Set(next.archived);
  if (previous.deckId !== next.deckId) errors.push('deck.deckId: must not change between revisions');
  for (const id of previous.archived) if (!archived.has(id)) errors.push(`deck.archived: ${id} must stay archived`);
  for (const old of previous.cards) {
    const card = current.get(old.id);
    if (!card && !archived.has(old.id)) errors.push(`card ${old.id}: a removed card must be listed in archived`);
    if (card && identity(card) !== identity(old)) {
      errors.push(`card ${old.id}: a different type, correct choice or required checklist needs a new card id`);
    }
  }
  const content = (deck: Deck) => canonical([deck.cards.map(bundled), deck.archived]);
  if (next.revision < previous.revision || (next.revision === previous.revision && content(next) !== content(previous))) {
    errors.push('deck.revision: must increase when content changes');
  }
  if (errors.length > 0) throw new DeckValidationError(errors);
}

/**
 * @param deck A validated deck.
 * @param mode
 * @returns The app-facing deck, without provenance or review records.
 */
export function toBundle(deck: Deck, mode: DeckMode): BundledDeck {
  const { schemaVersion, deckId, revision, archived } = deck;
  return { schemaVersion, deckId, revision, mode, archived, cards: deck.cards.map(bundled) };
}
