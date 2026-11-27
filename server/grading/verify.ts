import {
  GradingError,
  LIMITS,
  hasExactKeys,
  isRecord,
  type EvidenceDowngrade,
  type GradeResult,
  type GradingConfig,
  type GradingRequest,
  type GradingRubric,
  type ModelOutput,
  type PointResult,
  type Rating,
} from './contract.ts';
import { codePoints, foldWords, matchForm } from './normalize.ts';
import { SYSTEM_INSTRUCTIONS, prepareGrading } from './prompt.ts';

const RANK: Record<Rating, number> = { missed: 0, partial: 1, correct: 2 };
const OUTPUT_KEYS = ['rating', 'points', 'hints', 'comparison'] as const;
const POINT_KEYS = ['id', 'covered', 'evidence'] as const;

// Hints and comparison are single-line plain text.
const CONTROL = /[\p{Cc}\p{Cf}\p{Co}\p{Zl}\p{Zp}\p{Variation_Selector}]/u;
const MARKUP = [
  /[a-z][a-z0-9+.-]*:\/\//i, // scheme://
  /\bwww\./i,
  /\b(?:javascript|vbscript|data|file|mailto):\S/i,
  /<[a-z/!?]/i, // HTML tag, comment, doctype; "a < b" stays valid
  /&(?:[a-z][a-z0-9]*|#\d+|#x[0-9a-f]+);/i, // HTML entity
  /`/, // code span or fence
  /\*\*|__/, // strong emphasis
  /(?:^|[\s(])([*_])[^\s*_](?:[^*_]*[^\s*_])?\1(?=$|[\s).,;:!?])/, // *em* / _em_, not user_id or SELECT *
  /\[[^\]]*\]\(/, // [link](…) and ![image](…)
  /^\s*(?:#{1,6}\s|>|[-*+]\s|\d+[.)]\s)/, // heading, quote or list marker
];

const shingles = (words: string[]) =>
  words.slice(0, Math.max(0, words.length - LIMITS.overlapWords + 1)).map((_, i) =>
    words.slice(i, i + LIMITS.overlapWords).join(' '),
  );
const INSTRUCTION_SHINGLES = new Set(shingles(foldWords(SYSTEM_INSTRUCTIONS)));

/** JSON.parse keeps the last duplicate silently; scan the already-valid text for repeated keys. */
function hasDuplicateKey(text: string): boolean {
  const frames: (Set<string> | null)[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '{') frames.push(new Set());
    else if (char === '[') frames.push(null);
    else if (char === '}' || char === ']') frames.pop();
    else if (char === '"') {
      let end = i + 1;
      while (text[end] !== '"') end += text[end] === '\\' ? 2 : 1;
      let next = end + 1;
      while (text[next] === ' ' || text[next] === '\t' || text[next] === '\n' || text[next] === '\r') next += 1;
      const frame = frames[frames.length - 1];
      if (text[next] === ':' && frame) {
        const key = JSON.parse(text.slice(i, end + 1)) as string;
        if (frame.has(key)) return true;
        frame.add(key);
      }
      i = end;
    }
  }
  return false;
}

function parseOutput(raw: unknown, ids: string[]): ModelOutput {
  if (typeof raw !== 'string') throw new GradingError('output-not-json');
  // UTF-8 never uses fewer bytes than UTF-16 code units, so the cheap check is safe.
  if (raw.length > LIMITS.outputBytes || new TextEncoder().encode(raw).length > LIMITS.outputBytes) {
    throw new GradingError('output-too-large');
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new GradingError('output-not-json');
  }
  if (hasDuplicateKey(raw)) throw new GradingError('output-duplicate-key');
  const shapeOk =
    isRecord(value) &&
    hasExactKeys(value, OUTPUT_KEYS) &&
    typeof value.rating === 'string' &&
    Object.hasOwn(RANK, value.rating) &&
    Array.isArray(value.points) &&
    value.points.every(
      (point) =>
        isRecord(point) &&
        hasExactKeys(point, POINT_KEYS) &&
        typeof point.id === 'string' &&
        (point.covered === true ? typeof point.evidence === 'string' : point.covered === false && point.evidence === null),
    ) &&
    Array.isArray(value.hints) &&
    value.hints.length >= LIMITS.minHints &&
    value.hints.length <= LIMITS.maxHints &&
    value.hints.every((hint) => typeof hint === 'string') &&
    typeof value.comparison === 'string';
  if (!shapeOk) throw new GradingError('output-schema');
  const output = value as ModelOutput;
  const seen = new Set(output.points.map((point) => point.id));
  if (output.points.length !== ids.length || seen.size !== ids.length || !ids.every((id) => seen.has(id))) {
    throw new GradingError('output-point-ids');
  }
  return output;
}

function checkPlainText(text: string, maxCodePoints: number) {
  if (!text.isWellFormed() || CONTROL.test(text)) throw new GradingError('output-text-control');
  if (text.trim() === '' || codePoints(text) > maxCodePoints) throw new GradingError('output-text-length');
  const folded = text.normalize('NFKC');
  if (MARKUP.some((pattern) => pattern.test(folded))) throw new GradingError('output-text-markup');
}

function checkQuote(evidence: string, answer: string, uses: Map<string, number>): EvidenceDowngrade | null {
  const quote = matchForm(evidence);
  if (quote.split(' ').length < LIMITS.evidenceWords && codePoints(quote) < LIMITS.evidenceCodePoints) {
    return 'quote-too-short';
  }
  if (!evidence.isWellFormed() || !answer.includes(quote)) return 'quote-not-in-answer';
  if ((uses.get(quote) ?? 0) > 1) return 'quote-reused';
  return null;
}

/**
 * Validates an untrusted model output against the server rubric and bounds its rating by evidence.
 * A verified quote proves only that the text occurs in the answer, never that it is correct.
 * @param rubric
 * @param request
 * @param rawOutput Model text, expected to be exactly one JSON object.
 * @param config
 * @returns The bounded grade; unsupported quotes are downgraded to not covered with a reason.
 * @throws GradingError for invalid input/binding or any structurally invalid or leaking output.
 */
export function verifyGrade(
  rubric: GradingRubric,
  request: GradingRequest,
  rawOutput: string,
  config: GradingConfig,
): GradeResult {
  const answer = matchForm(prepareGrading(rubric, request, config));
  const output = parseOutput(rawOutput, rubric.points.map((point) => point.id));
  for (const hint of output.hints) checkPlainText(hint, LIMITS.hintCodePoints);
  checkPlainText(output.comparison, LIMITS.comparisonCodePoints);

  const prose = [...output.hints, output.comparison];
  const quotes = output.points.flatMap((point) => (point.covered ? [point.evidence] : []));
  if (foldWords([...prose, ...quotes].join(' ')).join('').includes(config.canary.toLowerCase())) {
    throw new GradingError('output-canary');
  }
  if (shingles(foldWords(prose.join(' '))).some((shingle) => INSTRUCTION_SHINGLES.has(shingle))) {
    throw new GradingError('output-prompt-overlap');
  }

  const uses = new Map<string, number>();
  for (const quote of quotes.map(matchForm)) uses.set(quote, (uses.get(quote) ?? 0) + 1);
  const points: PointResult[] = rubric.points.map(({ id }) => {
    const claim = output.points.find((point) => point.id === id)!;
    if (!claim.covered) return { id, covered: false, evidence: null, downgrade: null };
    const downgrade = checkQuote(claim.evidence, answer, uses);
    return downgrade
      ? { id, covered: false, evidence: null, downgrade }
      : { id, covered: true, evidence: matchForm(claim.evidence), downgrade: null };
  });

  const supported = points.filter((point) => point.covered).length;
  const evidenceBound: Rating = supported === points.length ? 'correct' : supported > 0 ? 'partial' : 'missed';
  const rating = RANK[output.rating] <= RANK[evidenceBound] ? output.rating : evidenceBound;
  return {
    rating,
    modelRating: output.rating,
    evidenceBound,
    downgraded: rating !== output.rating,
    points,
    hints: [...output.hints],
    comparison: output.comparison,
  };
}
