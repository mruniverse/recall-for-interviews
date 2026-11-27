// Locale helpers for the public sample deck (fixtures/deck.json). Every display field of every card
// already carries English and Brazilian Portuguese text in the JSON, so localizing is a checked copy,
// never a lookup or a fallback. Technical terms, protocol names, code and identifiers stay literal.
// Safe for the app bundle: it imports only types from deck.ts.
import type { Card, LocalizedText } from './deck.ts';

export type FixtureLocale = 'en' | 'pt-BR';
/** English is the default; pt-BR is the only alternative. */
export const FIXTURE_LOCALES: readonly FixtureLocale[] = ['en', 'pt-BR'];

/** Ids of the 24 sample cards in fixtures/deck.json, sorted. */
const FIXTURE_IDS: readonly string[] = [
  'algo-bfs-shortest',
  'algo-hash-map',
  'algo-lower-bound',
  'algo-nested-search',
  'algo-quicksort-pivot',
  'algo-top-k',
  'db-atomicity',
  'db-composite-index',
  'db-index-prefix',
  'db-lost-update',
  'db-n-plus-one',
  'db-replica-lag',
  'net-connection-setup',
  'net-dns-ttl',
  'net-l4-l7',
  'net-push-updates',
  'net-rate-limit-status',
  'net-udp-realtime',
  'sd-backpressure',
  'sd-cache-aside',
  'sd-consistent-hashing',
  'sd-idempotency',
  'sd-partition-writes',
  'sd-rate-limit',
];

/** Ids of the fixture cards this module serves, sorted. */
export function translatedFixtureIds(): string[] {
  return [...FIXTURE_IDS];
}

/**
 * Returns a full copy of a fixture card for one locale. The copy keeps the same id, type, topic,
 * answer, required flags, item order and provenance, and every display field keeps both locales, so
 * progress keyed by card id survives a language switch. The input is not modified and the copy shares
 * no nested objects with it.
 * @param card A card from fixtures/deck.json.
 * @param locale The locale the caller will render.
 * @returns A deep copy of the card in the same Card shape.
 * @throws Error naming the card id and the field (never its text) when a display field has no text in
 *   that locale. There is no fallback to the other language.
 */
export function localizeFixtureCard<T extends Card>(card: T, locale: FixtureLocale): T {
  if (!FIXTURE_LOCALES.includes(locale)) throw new Error(`unsupported locale ${String(locale)}`);
  const require = (path: string, text: LocalizedText | undefined): void => {
    const value = text?.[locale];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`fixture card ${card.id}: ${path} is missing ${locale} text`);
    }
  };
  require('prompt', card.prompt);
  require('explanation', card.explanation);
  if (card.type === 'open') {
    require('reference', card.reference);
    for (const item of card.checklist) require(`checklist.${item.id}`, item.text);
  } else {
    for (const choice of card.choices) {
      require(`choices.${choice.id}`, choice.text);
      if (choice.reason !== undefined) require(`reasons.${choice.id}`, choice.reason);
    }
  }
  return JSON.parse(JSON.stringify(card)) as T;
}
