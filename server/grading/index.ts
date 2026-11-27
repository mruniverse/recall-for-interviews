// Public surface of the provider-independent grading core. Not imported by the app.
export { GradingError, LIMITS } from './contract.ts';
export type {
  EvidenceDowngrade,
  GradeResult,
  GradingConfig,
  GradingErrorCode,
  GradingPrompt,
  GradingRequest,
  GradingRubric,
  Locale,
  ModelOutput,
  ModelPoint,
  PointResult,
  Rating,
  RubricPoint,
} from './contract.ts';
export { normalizeAnswer } from './normalize.ts';
export { SYSTEM_INSTRUCTIONS, buildGradingPrompt } from './prompt.ts';
export { verifyGrade } from './verify.ts';
