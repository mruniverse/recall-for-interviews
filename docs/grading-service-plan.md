# M4 Draft — authenticated AI grading service

Status: draft for independent architecture/security review. **Do not implement or deploy this document yet.** This is a parent-authored draft, not an independent approval. The API, account provider, credentials, live model, price cap and production host are not selected. The mobile app still self-rates open answers. No paid provider call is implemented or allowed by this plan alone.

Last source check: 2026-11-27. The app is Expo 58.1.0 / React Native 0.88.1 / Node 26.9.0. Better Auth's docs showed 1.7.28 at retrieval time; its Expo integration guide says it targets SDK 55.[1][2] Compatibility with this app's SDK 58 is **unverified** and is the first spike gate. Re-read linked vendor docs when implementation begins.

## Product behavior

1. An account is optional for local study and deterministic multiple choice. Creating or signing into an account enables AI grading and (in a separate later increment) sync. No answer is transmitted until the user has accepted the localized, versioned AI-data disclosure.
2. Submit on an open card requires non-empty text. The UI shows the answer is being sent to an AI provider. The app sends only attempt ID, deck/card ID, deck revision, locale, answer and consent version; account identity comes from the verified session, never a body field.
3. Server resolves the card/rubric from its trusted, approved deck revision, builds the M3 prompt, calls the selected provider through an adapter, verifies output through `server/grading`, and returns a bounded structured grade and tips. The client cannot send or override score/rubric/model.
4. Only a verified grade is committed as an AI-rated attempt. Empty/“I don't know” is a local missed attempt without an AI call. Choice questions remain local. Offline submission is encrypted and pending; no self-rating fallback and no scheduling until a verified grade arrives. A pending request reserves its new-card budget slot.
5. On transient connectivity, retry the exact frozen payload and attempt ID. On a server/provider outcome whose billing is ambiguous, do not automatically call the model again. Show a localized pending/error state and reconcile through an operator-visible, auditable path.

## Candidate stack (review, then spike)

- Standalone Node TypeScript service using Fastify, Better Auth for first-party account/session routes, PostgreSQL, and the already-reviewed pure grading core. Fastify is a candidate because Better Auth documents a Fastify auth handler and session lookup API.[1] PostgreSQL schema generation/migration is documented by Better Auth.[5] This stack is not wired or tested.
- Better Auth Email OTP requires a delivery adapter (`sendVerificationOTP`); the docs specify an expiry and verification-attempt control.[3] Local development uses an isolated mail-catcher with synthetic addresses only; never print actual OTPs or use a real email service in tests.
- Expo native auth client may use Better Auth's Expo plugin with `expo-secure-store` for session cookies; the cited Expo guide documents that flow and its SDK 55 target.[2] SecureStore uses iOS Keychain / Android Keystore, with platform persistence caveats.[6] This app is SDK 58; prove deep-link callbacks, cookie persistence, upgrade behavior and sign-out in a disposable spike before selecting it. No session token in AsyncStorage/plain KV. If incompatible, re-review an alternate standard OAuth/OIDC native flow.
- iOS offers Sign in with Apple and email OTP; Android offers email OTP and Google sign-in. Better Auth requires provider credentials for social login.[4] Before enabling third-party social login on iOS, verify current App Review Guideline 4.8 applicability and provide the required equivalent option.[7] Provider credentials, email sender domain, Apple private relay configuration, app association/deep-link setup and review requirements are external prerequisites, not created here.
- Run auth and API on one service origin to avoid broad CORS. Build the auth URL from configured `PUBLIC_BASE_URL`, not an untrusted `Host` header. Allow only the exact deployed app origins/schemes; use HTTPS outside local development. Auth handler errors and API exceptions are redacted to a generic client error; never log request bodies, cookies, Authorization headers, OTPs, answers, provider payloads, parser exceptions or prompts.
- PostgreSQL must be dedicated to Recall: isolated container/managed database, private service network, no public database port, distinct credentials and encrypted backups. Do not reuse another project's running Postgres, Redis, volume, schema or credentials. Local 5432 is already occupied; select an isolated service address/network rather than attaching to it. Production deployment is a separate reviewed and explicitly approved action.

## Server API contract to prototype

`POST /api/auth/*` is the auth library's catch-all. For protected routes, extract and validate the session using the server auth adapter. Fail closed on absent/expired session, revoked AI consent, unknown account, missing provider configuration or exhausted budget.

`POST /v1/grades` request (strict schema, bounded JSON body before parse):

- `attemptId`: stable UUID generated when the card is presented.
- `deckId`, `cardId`, `deckRevision`: exact IDs/revision.
- `locale`: `en` or `pt-BR`.
- `answer`: NFKC/Unicode-normalized per M3; max 1,000 code points after normalization and no silent truncation.
- `consentVersion`: version already accepted by this authenticated account. It is not itself proof of consent; the server checks the consent record.

Response is exactly the verified safe fields: `gradeId`, `attemptId`, final rating, per-point covered/not-covered plus downgrade reasons, localized hints, localized comparison, grader version, and interval/due date only after the client commits. Do not return raw model output, internal canary, prompt, exception or answer fragments beyond the M3-verified evidence needed by the UI. Rejection codes are mapped to generic localized user messages; no endpoint acts as a general chat proxy.

Consent: authenticated, versioned consent record is created only after explicit UI opt-in. Store account, text version, locale, timestamp and withdrawal timestamp. Every grade request checks active consent server-side before provider work. Decline leaves all local study/choice behavior available; withdrawal prevents future grading and exposes a deliberate choice for pending requests. Apple's guidelines explicitly require disclosure and permission before sharing personal data with third-party AI.[7] Consent UI is not a substitute for deletion, privacy disclosures or legal review.

## PostgreSQL state and idempotency

Suggested tables are subject to independent schema review:

- auth library's generated user/session/account/verification tables, kept separate from app-domain tables.
- `ai_consent(account_id, version, accepted_at, withdrawn_at)`.
- `grade_request(account_id, attempt_id, payload_hash, deck_id, card_id, deck_revision, locale, status, reservation_id, created_at, completed_at, grade_id, final_rating, grader_version, safe_feedback_json, error_class)`, unique `(account_id, attempt_id)`.
- `budget_reservation(id, account_id, attempt_id, estimated_max_cost, status, reserved_at, settled_at)` and versioned budget configuration.
- Do not persist raw answers, full prompts, raw provider output, cookies, OTPs or reference-answer copies in request logs. Persist only the normalized payload hash and safe grade necessary for idempotent response/account history; feedback is still derived personal data with documented retention/deletion. Avoid storing the quoted answer evidence if the UI can explain covered checklist points without retaining it.

Transaction outline: authenticate and validate schema/body; confirm consent and allowed deck revision; load rubric; normalize and hash canonical `{account,attemptId,deck/card/revision,locale,normalized-answer}`; begin DB transaction; lock or insert unique request; on same ID + same hash return completed safe grade, or return pending for in-flight; same ID + different hash is 409. Reserve worst-case provider cost under an atomic account/global cap before dispatch. Commit reservation/request state before the network call. Never hold a DB transaction over provider latency. A known pre-dispatch failure can release the reservation. A timeout/connection loss after dispatch is `unknown` and holds cost pending reconciliation; exactly-once provider billing cannot be promised. A completed grade is stored once and returned on retry. Concurrent identical submissions share the existing operation; a different account cannot read its state.

The actual maximum reservation must be computed from the selected provider/model's documented input/output price, hard token caps and currency before live calls. Missing budget, unknown price, cap reached or credentials absent means no outbound request. User has not selected vendor/model/amount yet; stop before real provider traffic and ask for approval then. For the candidate Anthropic API, the published standard retention is up to 30 days with exceptions; do not assume zero retention and re-check the exact API feature/agreement before using it.[8]

## Mobile persistence and migration

- Add a durable encrypted outbox record bound to account (or explicit anonymous local profile), attempt ID, frozen normalized answer, locale, card/deck revision, consent version and attemptedAt. Use an encrypted database/key whose encryption key is in iOS Keychain / Android Keystore via an Expo-supported secure storage facility. Do not put sensitive answers in plain key-value storage. Verify native size limits and backup/uninstall behavior.
- Use an append-only migration after the actual current SQLite `user_version` (now 2; M1 migration 2 is already shipped). Never modify migration 1/2. Store source (`choice|ai|gave-up`), server grade ID and grader version. Existing legacy self-rated attempts retain a legacy marker; do not relabel as AI.
- State transitions: `answering → submitting → pending/offline or grade-verified → locally-committed → feedback`. Disable double-submit; retain frozen `attemptedAt` and payload across retry/relaunch; canceling an ungraded item asks first and never schedules. If commit fails after server completion, repeat same idempotent request to recover saved grade, then locally commit once.
- This increment does not implement cross-device schedule sync or anonymous-data migration unless separately approved. Never claim those from account sign-in alone.

## Authentication/deletion and future sync

Optional login must not block first local study. No profile name/phone/CPF requirement. Email OTP code creation, expiration, attempts and delivery are server-owned and rate-limited; responses must not enumerate whether an email account exists. Tests use synthetic mail capture, not a public dev bypass. Social identities cannot be silently merged by email; account linking needs explicit re-authentication.

Account deletion must revoke sessions, remove auth and grading records, delete associated consent/feedback/outbox server data, and revoke Apple tokens if applicable. Retention exceptions/legal access logs are documented before rollout; logs never contain submitted answers. Provide JSON export and a tested local account-switch/logout wipe without replaying a prior user's outbox under another account. Sync is a later design: use authenticated append-only attempts and an explicit deterministic conflict/replay policy; do not retrofit the local CAS schema into naive cross-device writes.

## Files and phase gates

M4a — service/API/auth prototype, no external credentials: `server/api/**`, `server/auth/**`, `server/db/**`, isolated service manifest and local environment template, `tests/server-auth/**`, `tests/server-grading/**`. Add a synthetic email adapter and a fake provider clearly labelled in code/tests as non-production. Do not edit `server/grading/**` without separate review. Root mobile API client/outbox files follow only after contracts review. Never add `.env`, credentials or actual answer datasets.

M4a exit: real local isolated PostgreSQL (not an in-memory fake), migration from empty and rollback/forward compatibility, Email OTP captured only in an isolated test mail sink, account/session authentication, generic non-enumerating errors, cross-account denial, duplicate and conflicting attempt IDs, concurrent budget reservations, provider-not-configured fail-closed, fake-provider grade passes M3 and persists safe response, retry after server completion does not call fake provider twice, unknown timeout does not blind-retry, payload max checked before JSON parse, request canary absent from DB/logs/traces, and explicit consent/withdrawal tests. Run integration tests against a disposable container/port. Test true concurrent requests and kill/restart between reservation, dispatch and completion.

M4b — SDK58 native auth spike + client consent/outbox integration. M4c — provider adapter only after a provider/model, key via secret store, retention review and explicit spend ceiling are approved. M4d — cross-device sync/deletion/export and Apple/Google identity credentials. Independent deep architecture/security review is required before M4a implementation and again before live paid grading. Build/dev environment is not external deployment authorization.

## External documentation checked (2026-11-27)

The eight sources below were retrieved on this date. OAuth credentials, OTP delivery, Expo SDK compatibility and retention specifics must be rechecked before implementation/use.

## Sources

[1] https://www.better-auth.com/docs/integrations/fastify
[2] https://www.better-auth.com/docs/integrations/expo
[3] https://www.better-auth.com/docs/plugins/email-otp
[4] https://www.better-auth.com/docs/concepts/oauth
[5] https://www.better-auth.com/docs/adapters/postgresql
[6] https://docs.expo.dev/versions/latest/sdk/securestore
[7] https://developer.apple.com/app-store/review/guidelines
[8] https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data
