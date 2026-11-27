// Deck schema and validator. Runs in Node (tests and the Release build step), never in the app
// bundle: the app imports only the prepared output and these types.

/** Topic taxonomy. Each topic present in a deck needs at least four open and two multiple-choice cards. */
export const TOPICS = ['system-design', 'networking', 'databases', 'algorithms', 'cloud', 'tools'] as const;
export const LEVELS = ['junior', 'mid', 'senior'] as const;
export const ROUNDS = ['fundamentals', 'coding', 'system-design'] as const;
/** Kinds of evidence, in order of preference. */
export const SOURCE_KINDS = ['official-guide', 'book-course', 'candidate-reports'] as const;
/** `topic` shows a subject is assessed; only `question-pattern` supports that a question like the card is asked. */
export const EVIDENCE_SCOPES = ['topic', 'question-pattern'] as const;
/** What an independent human reviewer must confirm before a card ships. */
export const REVIEW_CHECKS = ['accuracy', 'trade-offs', 'rubric', 'source'] as const;
/** Card size limits; words are counted by `countWords`, per locale. */
export const LIMITS = {
  promptWords: { en: 25, 'pt-BR': 30 },
  referenceWords: { en: 60, 'pt-BR': 75 },
  choiceWords: { en: 12, 'pt-BR': 12 },
  choices: { min: 2, max: 4 },
  requiredItems: { min: 1, max: 3 },
} as const;

export type Topic = (typeof TOPICS)[number];
export type Level = (typeof LEVELS)[number];
export type Round = (typeof ROUNDS)[number];
export type DeckMode = 'fixtures' | 'private';
type Locale = 'en' | 'pt-BR';
/** Every display text exists in both locales. */
export type LocalizedText = Record<Locale, string>;
export type ChecklistItem = { id: string; required: boolean; text: LocalizedText };
export type Choice = { id: string; text: LocalizedText; reason?: LocalizedText };
export type Source = {
  kind: (typeof SOURCE_KINDS)[number];
  /** An HTTPS URL or a bibliographic citation. */
  locator: string;
  evidenceScope: (typeof EVIDENCE_SCOPES)[number];
  company?: string;
  role?: string;
};
/** `sources` may be empty only on an unreviewed draft. */
export type Provenance = { origin: 'original'; author: string; sources: Source[] };
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
  level: Level;
  round: Round;
  prompt: LocalizedText;
  explanation: LocalizedText;
  provenance: Provenance;
  review: Review;
};
export type OpenCard = CardBase & { type: 'open'; reference: LocalizedText; checklist: ChecklistItem[] };
export type ChoiceCard = CardBase & { type: 'multiple-choice'; choices: Choice[]; answer: string };
export type Card = OpenCard | ChoiceCard;
export type Deck = { schemaVersion: 2; deckId: string; revision: number; archived: string[]; cards: Card[] };
type LegacyCard = { id: string; topic: string } & (
  | { type: 'open'; checklist: { id: string; required: boolean }[] }
  | { type: 'multiple-choice'; answer: string }
);
/** The part of a schema-1 deck that a schema-2 revision is compared against. */
export type LegacyDeck = { schemaVersion: 1; deckId: string; revision: number; archived: string[]; cards: LegacyCard[] };
export type BundledCard = Omit<OpenCard, 'provenance' | 'review'> | Omit<ChoiceCard, 'provenance' | 'review'>;
/** What the app bundles: authorship, sources and review records stay out of the binary. */
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
type ValidateOptions = { mode: DeckMode; today?: string };

const LOCALES: readonly Locale[] = ['en', 'pt-BR'];
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLACEHOLDER = /^(?:tbd|todo|n\/?a|none|unknown|placeholder|example|sample|fixture|test|reviewer|-+)$/i;
// Self-identified automation; a guard against an AI worker recording an approval, not proof of a human.
const AUTOMATED = /(?<![\p{L}\p{N}])(?:ai|bot|gpt|llm|copilot|assistant|agent|automated)(?![\p{L}\p{N}])/iu;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
const oneOf = (list: readonly string[], value: unknown) => typeof value === 'string' && list.includes(value);
const isRevision = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 1;
const cardPath = (index: number, card: unknown) =>
  isObject(card) && typeof card.id === 'string' && ID.test(card.id) ? `card ${card.id}` : `cards[${index}]`;

/**
 * Counts words the way the content limits do: trim, then split on Unicode whitespace, so a code
 * identifier such as `user_id` or `Array.prototype.map` is one word.
 * @param text
 * @returns The number of whitespace-separated tokens; 0 for blank text.
 */
export function countWords(text: string): number {
  return text.split(/\p{White_Space}+/u).filter((token) => token !== '').length;
}

// A URL locator has no whitespace and must be HTTPS without credentials; anything with whitespace is
// read as a citation and must not embed a URL of another scheme.
function isLocator(value: unknown): boolean {
  if (!isText(value) || PLACEHOLDER.test(value.trim())) return false;
  const locator = value.trim();
  if (/\p{White_Space}/u.test(locator)) return !locator.includes('://');
  try {
    const url = new URL(locator);
    return url.protocol === 'https:' && url.hostname !== '' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

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

// Problems are reported by field path and never quote content.
function collector() {
  const errors: string[] = [];
  const problem = (path: string, message: string) => {
    errors.push(`${path}: ${message}`);
  };

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

  // Deck id, revision and archive are read the same way in either schema; archived ids join `seen`.
  function header(deck: Json, seen: Set<unknown>) {
    id('deck.deckId', deck.deckId);
    if (!isRevision(deck.revision)) problem('deck.revision', 'must be a positive integer');
    if (Array.isArray(deck.archived)) deck.archived.forEach((value, index) => id(`deck.archived[${index}]`, value, seen));
    else problem('deck.archived', 'must be an array');
  }

  return { errors, problem, shape, id, header };
}

/**
 * Hashes everything in a card except its review record, sources included.
 * @param card
 * @returns Lowercase SHA-256 hex; an approval is valid only while it matches this value.
 */
export async function cardContentHash(card: Card): Promise<string> {
  const { review: _review, ...content } = card;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(content)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Validates a parsed schema-2 deck. Fixtures and private decks share every rule; an unreviewed
 * draft may have no sources. Private mode additionally requires each card to carry a question-pattern
 * source and a documented, independent human approval of its current content.
 * @param input Parsed JSON.
 * @param options `today` (YYYY-MM-DD) bounds review dates; defaults to the local date.
 * @returns The same object typed as a Deck.
 * @throws DeckValidationError listing every problem by field path, without echoing card text.
 */
export async function validateDeck(input: unknown, options: ValidateOptions): Promise<Deck> {
  const { errors, problem, shape, id, header } = collector();
  const today = options.today ?? localToday();
  const seen = new Set<unknown>();
  const counts = new Map<unknown, { open: number; 'multiple-choice': number }>();

  // Absent required fields are reported by `shape`; this checks the ones that are present.
  function text(path: string, value: unknown, limits?: Record<Locale, number>) {
    if (value === undefined || !shape(path, value, [...LOCALES])) return;
    for (const locale of LOCALES) {
      const entry = value[locale];
      if (entry === undefined) continue;
      if (!isText(entry)) problem(`${path}.${locale}`, 'must be non-empty text');
      else if (limits && countWords(entry) > limits[locale]) {
        problem(`${path}.${locale}`, `has ${countWords(entry)} words; the limit is ${limits[locale]}`);
      }
    }
  }

  function checkOpen(path: string, card: Json) {
    text(`${path}.reference`, card.reference, LIMITS.referenceWords);
    if (!Array.isArray(card.checklist)) {
      problem(`${path}.checklist`, 'must be an array');
      return;
    }
    const { min, max } = LIMITS.requiredItems;
    const required = card.checklist.filter((item) => isObject(item) && item.required === true).length;
    if (required < min || required > max) problem(`${path}.checklist`, `needs ${min} to ${max} required items (has ${required})`);
    const itemIds = new Set<unknown>();
    card.checklist.forEach((item: unknown, index: number) => {
      const at = `${path}.checklist[${index}]`;
      if (!shape(at, item, ['id', 'required', 'text'])) return;
      id(`${at}.id`, item.id, itemIds);
      if (typeof item.required !== 'boolean') problem(`${at}.required`, 'must be true or false');
      text(`${at}.text`, item.text);
    });
  }

  function checkChoices(path: string, card: Json) {
    if (!Array.isArray(card.choices)) {
      problem(`${path}.choices`, 'must be an array');
      return;
    }
    const { min, max } = LIMITS.choices;
    if (card.choices.length < min || card.choices.length > max) {
      problem(`${path}.choices`, `needs ${min} to ${max} choices (has ${card.choices.length})`);
    }
    const choiceIds = new Set<unknown>();
    const texts = new Map(LOCALES.map((locale) => [locale, new Set<string>()]));
    card.choices.forEach((choice: unknown, index: number) => {
      const at = `${path}.choices[${index}]`;
      if (!shape(at, choice, ['id', 'text'], ['reason'])) return;
      id(`${at}.id`, choice.id, choiceIds);
      text(`${at}.text`, choice.text, LIMITS.choiceWords);
      for (const locale of LOCALES) {
        const entry = isObject(choice.text) ? choice.text[locale] : undefined;
        if (!isText(entry)) continue;
        const seenTexts = texts.get(locale)!;
        if (seenTexts.has(entry.trim().toLowerCase())) problem(`${at}.text.${locale}`, 'duplicates another choice');
        seenTexts.add(entry.trim().toLowerCase());
      }
      if (choice.id !== card.answer && choice.reason === undefined) problem(at, 'a distractor needs a reason');
      text(`${at}.reason`, choice.reason);
    });
    if (!choiceIds.has(card.answer)) problem(`${path}.answer`, 'must match a choice id');
  }

  function checkSources(path: string, value: unknown, needsPattern: boolean) {
    if (!Array.isArray(value)) {
      problem(path, 'must be an array');
      return;
    }
    value.forEach((source: unknown, index: number) => {
      const at = `${path}[${index}]`;
      if (!shape(at, source, ['kind', 'locator', 'evidenceScope'], ['company', 'role'])) return;
      if (!oneOf(SOURCE_KINDS, source.kind)) problem(`${at}.kind`, `must be one of ${SOURCE_KINDS.join(', ')}`);
      if (!oneOf(EVIDENCE_SCOPES, source.evidenceScope)) problem(`${at}.evidenceScope`, `must be one of ${EVIDENCE_SCOPES.join(', ')}`);
      if (!isLocator(source.locator)) problem(`${at}.locator`, 'must be an HTTPS URL or a bibliographic citation');
      for (const key of ['company', 'role']) {
        const label = source[key];
        if (label !== undefined && (!isText(label) || PLACEHOLDER.test(label.trim()))) problem(`${at}.${key}`, 'must be non-empty text when present');
      }
    });
    if (needsPattern && !value.some((source) => isObject(source) && source.evidenceScope === 'question-pattern')) {
      problem(path, 'needs a question-pattern source before approval or a private release; topic evidence alone is not enough');
    }
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
    else if (AUTOMATED.test(review.reviewer)) problem(`${at}.reviewer`, 'must be a human, not an automated reviewer');
    if (!isCivilDate(review.reviewedAt) || review.reviewedAt > today) problem(`${at}.reviewedAt`, 'must be a YYYY-MM-DD date not after today');
    const checks = Array.isArray(review.checks) ? review.checks : [];
    if (checks.length !== REVIEW_CHECKS.length || !REVIEW_CHECKS.every((check) => checks.includes(check))) {
      problem(`${at}.checks`, `must list ${REVIEW_CHECKS.join(', ')}`);
    }
    if (!isText(review.evidence) || PLACEHOLDER.test(review.evidence.trim())) problem(`${at}.evidence`, 'must point to the review record');
    if (review.contentHash !== hash) problem(`${at}.contentHash`, `does not match the current content (${hash}); review the card again`);
  }

  function checkCard(index: number, card: unknown, hash: string) {
    const path = cardPath(index, card);
    const type = isObject(card) ? card.type : undefined;
    const specific = type === 'open' ? ['reference', 'checklist'] : type === 'multiple-choice' ? ['choices', 'answer'] : [];
    const fields = ['id', 'topic', 'level', 'round', 'type', 'prompt', 'explanation', 'provenance', 'review', ...specific];
    if (!shape(path, card, fields)) return;
    id(`${path}.id`, card.id, seen);
    const typed = type === 'open' || type === 'multiple-choice';
    if (!typed) problem(`${path}.type`, 'must be open or multiple-choice');
    if (!oneOf(TOPICS, card.topic)) problem(`${path}.topic`, `must be one of ${TOPICS.join(', ')}`);
    else if (typed) {
      const count = counts.get(card.topic) ?? { open: 0, 'multiple-choice': 0 };
      count[type] += 1;
      counts.set(card.topic, count);
    }
    if (!oneOf(LEVELS, card.level)) problem(`${path}.level`, `must be one of ${LEVELS.join(', ')}`);
    if (!oneOf(ROUNDS, card.round)) problem(`${path}.round`, `must be one of ${ROUNDS.join(', ')}`);
    text(`${path}.prompt`, card.prompt, LIMITS.promptWords);
    text(`${path}.explanation`, card.explanation);
    if (shape(`${path}.provenance`, card.provenance, ['origin', 'author', 'sources'])) {
      if (card.provenance.origin !== 'original') problem(`${path}.provenance.origin`, 'must be original');
      if (!isText(card.provenance.author)) problem(`${path}.provenance.author`, 'must be non-empty text');
      const approved = isObject(card.review) && card.review.status === 'approved';
      checkSources(`${path}.provenance.sources`, card.provenance.sources, approved || options.mode === 'private');
    }
    if (type === 'open') checkOpen(path, card);
    if (type === 'multiple-choice') checkChoices(path, card);
    checkReview(path, card, hash);
  }

  if (!shape('deck', input, ['schemaVersion', 'deckId', 'revision', 'archived', 'cards'])) throw new DeckValidationError(errors);
  if (input.schemaVersion !== 2) problem('deck.schemaVersion', 'must be 2');
  header(input, seen);
  if (Array.isArray(input.cards)) {
    if (input.cards.length === 0) problem('deck.cards', 'needs at least one card');
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

// Reads only what `checkRevision` compares, and requires every one of those fields.
function legacyDeck(input: Json): LegacyDeck {
  const { errors, problem, id, header } = collector();
  const seen = new Set<unknown>();
  header(input, seen);
  if (!Array.isArray(input.cards)) problem('deck.cards', 'must be an array');
  else {
    input.cards.forEach((card: unknown, index: number) => {
      const path = cardPath(index, card);
      if (!isObject(card)) return problem(path, 'must be an object');
      id(`${path}.id`, card.id, seen);
      if (!isText(card.topic)) problem(`${path}.topic`, 'must be non-empty text');
      if (card.type === 'multiple-choice') {
        if (!isText(card.answer)) problem(`${path}.answer`, 'must be a choice id');
      } else if (card.type === 'open') {
        const items = Array.isArray(card.checklist) ? card.checklist : [null];
        if (!items.every((item) => isObject(item) && typeof item.id === 'string' && typeof item.required === 'boolean')) {
          problem(`${path}.checklist`, 'must list items with an id and a required flag');
        }
      } else {
        problem(`${path}.type`, 'must be open or multiple-choice');
      }
    });
  }
  if (errors.length > 0) throw new DeckValidationError(errors);
  return input as unknown as LegacyDeck;
}

/**
 * Reads the previously shipped deck that a candidate revision is compared against. A schema-2
 * baseline is validated in full; a schema-1 baseline is read for the fields `checkRevision` compares
 * (ids, archive, revision, topic, type, correct choice, required checklist ids), each of which must be
 * well formed. No other baseline is ignored or guessed at.
 * @param input Parsed JSON.
 * @param options Applied to a schema-2 baseline as in `validateDeck`.
 * @returns The baseline for `checkRevision`.
 * @throws DeckValidationError with every line prefixed `previous`, for a malformed baseline or any
 *   other schema version, which needs a reviewed migration before it can serve as a baseline.
 */
export async function parseBaseline(input: unknown, options: ValidateOptions): Promise<Deck | LegacyDeck> {
  try {
    if (isObject(input) && input.schemaVersion === 1) return legacyDeck(input);
    if (isObject(input) && input.schemaVersion !== 2) {
      throw new DeckValidationError(['deck.schemaVersion: only schema 1 or 2 can be compared; a reviewed migration is required first']);
    }
    return await validateDeck(input, options);
  } catch (error) {
    if (error instanceof DeckValidationError) throw new DeckValidationError(error.errors.map((line) => `previous ${line}`));
    throw error;
  }
}

const identity = (card: LegacyCard) =>
  card.type === 'open'
    ? `${card.topic}|open:${card.checklist.filter((item) => item.required).map((item) => item.id).sort().join(',')}`
    : `${card.topic}|multiple-choice:${card.answer}`;

/**
 * Compares a candidate revision with the deck already shipped. A kept id must keep its meaning; a
 * typo-only edit may keep it, though it still invalidates the card's approval through its content hash.
 * @param previous The shipped deck, from `parseBaseline`.
 * @param next The validated candidate revision.
 * @throws DeckValidationError when a kept id changes its topic, type, correct choice or required
 *   checklist items, a removed id is not archived, an archived id is dropped, or content (or the
 *   schema) changes without a higher revision.
 */
export function checkRevision(previous: Deck | LegacyDeck, next: Deck): void {
  const errors: string[] = [];
  const current = new Map(next.cards.map((card) => [card.id, card]));
  const archived = new Set(next.archived);
  if (previous.deckId !== next.deckId) errors.push('deck.deckId: must not change between revisions');
  for (const id of previous.archived) if (!archived.has(id)) errors.push(`deck.archived: ${id} must stay archived`);
  for (const old of previous.cards) {
    const card = current.get(old.id);
    if (!card && !archived.has(old.id)) errors.push(`card ${old.id}: a removed card must be listed in archived`);
    if (card && identity(card) !== identity(old)) {
      errors.push(`card ${old.id}: a different topic, type, correct choice or required checklist needs a new card id`);
    }
  }
  const content = (deck: Deck) => canonical([deck.cards.map(bundled), deck.archived]);
  const changed = previous.schemaVersion !== 2 || content(previous) !== content(next);
  if (next.revision < previous.revision || (next.revision === previous.revision && changed)) {
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
