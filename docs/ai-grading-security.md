# AI grading: implemented controls and release gates

Status: the repository contains a provider-independent grading core under `server/grading/`. It is not a hosted service, does not call a live AI model, and is not connected to open-answer grading in the mobile app yet. Synthetic tests do not establish real model accuracy.

## Implemented in the core

- Answer normalization with bounded Unicode input, malformed-surrogate rejection, and removal of specified control/format characters. Answers are not truncated.
- Server-owned question/rubric binding before building a model payload. The answer goes in the user message, not in system instructions.
- Strict model-output schema, duplicate JSON key and point-ID checks, text/output length limits, and generic internal error messages that contain no submitted answer.
- Evidence verification: a quote must occur in the normalized answer and satisfy the minimum span; unsupported or reused evidence is downgraded.
- Rating cap: the final rating cannot exceed either the model rating or the required-point evidence bound.
- Plain-text feedback filtering and configurable canary/system-instruction overlap checks as defense in depth.
- A test of the current import graph keeps the grading core outside the mobile application. Provider credentials do not belong in mobile code.

## What this does NOT prove

A substring match proves that text is present, not that the text answers a question. For example, if a hypothetical model incorrectly cites an instruction override as support for a technical point, the verifier may accept that evidence. The model still needs semantic evaluation against human-labeled answers and adversarial inputs. Do not market this core as injection-proof or as proof that the app already grades answers.

Canary and overlap filters are best-effort signals, not secrecy guarantees. System instructions and reference answers are not secrets. Unicode confusables, paraphrases and translations are not comprehensively detected. The only intended deployment secret in this core is a canary configured by the service; test markers are synthetic.

The conservative text filter can reject legitimate technical notation, including some generic types, Python dunder names and exponent operators. Before live use, measure these false rejections and avoid automatic blind retries that could incur repeated cost. The client must receive a generic grading-unavailable message, not internal rejection codes that expose filter behavior.

Very short facts such as `429` or `B-tree` do not meet the current evidence span. Use multiple choice for single-term facts; open cards require a brief explanation. Feedback remains entirely in the selected language.

## Still required before any real grading pilot

- Reviewed HTTPS endpoint with authenticated ownership, consent enforcement and safe request-body limits before parsing.
- Persistent idempotency and crash/retry handling; no acceptance of a client-selected AI rating.
- Atomic cost reservations, per-account/card limits, a separately configured provider spend cap, and a safely supplied service credential.
- Durable encrypted pending answers, cancellation and account isolation; no answers, prompts, credentials or raw provider exceptions in logs/traces.
- Current provider retention disclosure, explicit third-party-AI opt-in, withdrawal and deletion/export behavior.
- Deterministic endpoint tests for malicious inputs and cross-account access, plus repeated adversarial runs against the actual selected model.
- Held-out bilingual human evaluation and native device/accessibility tests defined in the product plan.

The authoritative contracts and acceptance criteria are in [the product plan](product-plan.md). Official policy findings are recorded separately in [the privacy preflight](research/ai-privacy-preflight.md).
