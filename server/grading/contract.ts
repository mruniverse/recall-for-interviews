// Grading contract shared by the prompt builder and the verifier. Server-only: the app never
// imports anything under server/.

export type Locale = 'en' | 'pt-BR';
export type Rating = 'correct' | 'partial' | 'missed';

/** One required checklist point; `text` is public rubric data, not a secret. */
export type RubricPoint = { id: string; text: string };

/** Loaded by the service from the accepted deck revision, never from the client. */
export type GradingRubric = {
  deckId: string;
  cardId: string;
  revision: number;
  locale: Locale;
  question: string;
  reference: string;
  points: RubricPoint[];
};

/** Exactly what the client may send; any other field is rejected. */
export type GradingRequest = {
  attemptId: string;
  deckId: string;
  cardId: string;
  revision: number;
  locale: Locale;
  answer: string;
};

/** Deployment settings. `canary` is a random marker placed in the system prompt to detect leaks. */
export type GradingConfig = { canary: string };

export type ModelPoint =
  | { id: string; covered: true; evidence: string }
  | { id: string; covered: false; evidence: null };

/** The only accepted model output shape. */
export type ModelOutput = { rating: Rating; points: ModelPoint[]; hints: string[]; comparison: string };

/** Why a point the model marked covered was not accepted. */
export type EvidenceDowngrade = 'quote-too-short' | 'quote-not-in-answer' | 'quote-reused';

/**
 * `covered` only means the model claimed the point and its quote was found in the answer; it does
 * not establish that the answer is semantically correct.
 */
export type PointResult = {
  id: string;
  covered: boolean;
  evidence: string | null;
  downgrade: EvidenceDowngrade | null;
};

export type GradeResult = {
  /** The lower of `modelRating` and `evidenceBound`. */
  rating: Rating;
  modelRating: Rating;
  /** All points supported = correct, some = partial, none = missed. */
  evidenceBound: Rating;
  /** True when `rating` is below `modelRating`; `points[].downgrade` says which quotes failed. */
  downgraded: boolean;
  points: PointResult[];
  hints: string[];
  comparison: string;
};

export type GradingPrompt = { system: string; user: string };

export const LIMITS = Object.freeze({
  answerCodePoints: 1000,
  outputBytes: 16 * 1024,
  hintCodePoints: 240,
  comparisonCodePoints: 600,
  minHints: 2,
  maxHints: 3,
  minPoints: 1,
  maxPoints: 3,
  evidenceWords: 3,
  evidenceCodePoints: 12,
  overlapWords: 8,
} as const);

export type GradingErrorCode =
  | 'config-invalid'
  | 'rubric-invalid'
  | 'request-invalid'
  | 'request-mismatch'
  | 'answer-invalid'
  | 'answer-empty'
  | 'answer-too-long'
  | 'output-too-large'
  | 'output-not-json'
  | 'output-duplicate-key'
  | 'output-schema'
  | 'output-point-ids'
  | 'output-text-length'
  | 'output-text-control'
  | 'output-text-markup'
  | 'output-canary'
  | 'output-prompt-overlap';

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Own enumerable keys equal `keys` exactly, so `__proto__` or any extra field fails. */
export const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

/** Carries only a fixed code: never the answer, the raw output or a parser message. */
export class GradingError extends Error {
  code: GradingErrorCode;

  constructor(code: GradingErrorCode) {
    super(`grading rejected: ${code}`);
    this.name = 'GradingError';
    this.code = code;
  }
}
