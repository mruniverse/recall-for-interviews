import { GradingError, LIMITS } from './contract.ts';

// Format characters (zero-width, bidi, tags, BOM, soft hyphen) and controls except newline and tab.
const INVISIBLE = /(?![\n\t])[\p{Cf}\p{Cc}]/gu;

const strip = (text: string) => text.replace(/\r\n?/g, '\n').replace(INVISIBLE, '');

export const codePoints = (text: string) => [...text].length;

/**
 * Unicode cleanup shared by answers and quotes. Stripping before NFKC lets marks split by a removed
 * joiner compose; stripping again after NFKC keeps the result free of Cf/Cc in any Unicode version.
 * @param text
 * @returns NFKC text without format or control characters other than newline and tab.
 */
export const cleanText = (text: string) => strip(strip(text).normalize('NFKC'));

/** Form used to compare quotes with the answer: whitespace runs collapse to one space. */
export const matchForm = (text: string) => cleanText(text).replace(/\s+/gu, ' ').trim();

/** Lowercase letter/digit runs, used by the canary and prompt-overlap checks. */
export const foldWords = (text: string) =>
  cleanText(text).toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);

/**
 * Normalizes a submitted answer; never truncates it.
 * @param answer
 * @returns Trimmed NFKC text with newlines and tabs preserved.
 * @throws GradingError `answer-invalid` (not a well-formed string), `answer-too-long` (over 1,000
 *   code points before or after normalization) or `answer-empty`.
 */
export function normalizeAnswer(answer: unknown): string {
  if (typeof answer !== 'string') throw new GradingError('answer-invalid');
  if (answer.length > 2 * LIMITS.answerCodePoints) throw new GradingError('answer-too-long');
  if (!answer.isWellFormed()) throw new GradingError('answer-invalid');
  if (codePoints(answer) > LIMITS.answerCodePoints) throw new GradingError('answer-too-long');
  const text = cleanText(answer).trim();
  if (codePoints(text) > LIMITS.answerCodePoints) throw new GradingError('answer-too-long');
  if (text === '') throw new GradingError('answer-empty');
  return text;
}
