// Study-side view of the public fixture deck: a light shape guard (the full validator runs in tests
// and needs WebCrypto) and per-locale localization that fails closed instead of mixing languages.
import type { Card, Deck, LocalizedText, Topic } from '../content/deck.ts';
import type { StudyLocale } from './copy.ts';

/** Contract of `localizeFixtureCard`: same card shape, display fields filled for `locale`. */
export type CardLocalizer = (card: Card, locale: StudyLocale) => Card;

export class StudyContentError extends Error {
  name = 'StudyContentError';
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * @param input Parsed `src/content/fixtures/deck.json`.
 * @returns The deck, typed after checking the fields the study flow relies on.
 * @throws StudyContentError when the deck is not a schema-2 deck of open and multiple-choice cards.
 */
export function parseFixtureDeck(input: unknown): Deck {
  if (!isObject(input) || input.schemaVersion !== 2 || typeof input.deckId !== 'string') {
    throw new StudyContentError('Unsupported deck');
  }
  if (!Number.isSafeInteger(input.revision) || (input.revision as number) < 1 || !Array.isArray(input.cards)) {
    throw new StudyContentError('Unsupported deck');
  }
  for (const card of input.cards) {
    if (!isObject(card) || typeof card.id !== 'string' || (card.type !== 'open' && card.type !== 'multiple-choice')) {
      throw new StudyContentError('Unsupported card');
    }
  }
  return input as unknown as Deck;
}

/**
 * @param deck
 * @returns Topics in deck order, each once.
 */
export function deckTopics(deck: Deck): Topic[] {
  return [...new Set(deck.cards.map((card) => card.topic))];
}

/**
 * Reads the text for exactly `locale`; there is no fallback to another language.
 * @param value A display field of a localized card.
 * @param locale
 * @throws StudyContentError when the field has no text in `locale`.
 */
export function textIn(value: LocalizedText | undefined, locale: StudyLocale): string {
  const text = value?.[locale];
  if (typeof text !== 'string' || text.trim() === '') throw new StudyContentError(`Missing ${locale} text`);
  return text;
}

// What scheduling and grading depend on must survive localization untouched.
const identity = (card: Card) =>
  JSON.stringify(
    card.type === 'open'
      ? [card.id, card.topic, card.type, card.checklist.map((item) => [item.id, item.required])]
      : [card.id, card.topic, card.type, card.answer, card.choices.map((choice) => choice.id)],
  );

/**
 * Localizes every card up front so a missing translation is found before any card is shown.
 * @param deck
 * @param locale
 * @param localize
 * @returns Localized cards by ID.
 * @throws StudyContentError when a card misses a display field in `locale` or localization changed
 *   its ID, type, topic, correct choice or checklist.
 */
export function localizeDeck(deck: Deck, locale: StudyLocale, localize: CardLocalizer): Map<string, Card> {
  const cards = new Map<string, Card>();
  for (const source of deck.cards) {
    const card = localize(source, locale);
    if (identity(card) !== identity(source)) throw new StudyContentError(`Localization changed card ${source.id}`);
    textIn(card.prompt, locale);
    textIn(card.explanation, locale);
    if (card.type === 'open') {
      textIn(card.reference, locale);
      for (const item of card.checklist) textIn(item.text, locale);
    } else {
      for (const choice of card.choices) {
        textIn(choice.text, locale);
        if (choice.id !== card.answer) textIn(choice.reason, locale);
      }
    }
    cards.set(card.id, card);
  }
  return cards;
}
