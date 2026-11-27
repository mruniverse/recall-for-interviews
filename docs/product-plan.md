# Recall for Interviews — current product contract

This document replaces all earlier, superseded requirements. The name is provisional.

## 1. Purpose and evidence

A short daily recall habit for tech professionals preparing for international interviews: remember concepts, tools and small trade-offs, not solve long design exercises. Start with software engineering, iOS first using Expo/React Native and TypeScript; preserve an Android path. English is the default; choosing Brazilian Portuguese changes the entire experience, including questions, feedback, dates and accessibility labels. No mixed-language fallback. Localized variants share IDs and progress.

Retrieval practice improved delayed recall in the experiments of Roediger and Karpicke.[1] Cepeda et al. found that useful spacing depends on the desired retention interval.[2] The 1/7/30-day schedule below is a product hypothesis, not a proven interview-success formula. Official company guides support topic selection, not statistical question frequency.[3]

## 2. Scope, authority and current state

The user authorized development, a public GitHub portfolio repository, installation on their iPhone, and a first-party server calling a paid cloud AI for grading. No particular AI provider, hosting bill or spend cap was chosen by the user. Anthropic is a candidate, not a purchased service. Never use a personal chat subscription as the app's backend. Obtain a service credential via a secret store, never chat, and agree a spend cap before live paid requests. No key currently means no real AI-grade claim.

Keep the repository public until the user actually launches on the App Store; changing visibility later does not recall public copies. Code and sample content have no open-source license grant at this stage. Store publication, payments, public production rollout and external TestFlight invitations remain deferred. Local development, tests, read-only research and isolated non-production infrastructure preparation can proceed without re-asking. Do not modify another project's stack to host this app.

| Requirement | Module / screen | Current status and acceptance |
| --- | --- | --- |
| EN default / pt-BR complete | onboarding, settings, content | Implemented in prototype; selection persists without resetting progress. |
| Explicit Submit | study question | Implemented: selecting a choice does not submit. |
| Correct open answers with AI and tips, never self-rate | server grading + study | Not implemented; current prototype still self-rates and must not be called complete. |
| One new question daily by default, configurable | Today, settings, SQLite | M1 in progress: 1, 3, 5 or 10; due reviews shown separately. |
| Short, evidence-backed interview cards | content validation + source catalog | Samples exist; need shortening, sources and independent content review. Never advertise samples as company questions. |
| Account creation and cross-device progress | account + sync | Planned; not a working account screen yet. |
| Choose topics and question formats | study preferences + queue | Planned; short open / multiple choice first, other formats later. |
| Audio and English communication feedback | recorder + transcript + feedback | Later increment; separate technical correctness from communication. |
| Commercial product and portfolio | release + GitHub demo | Working prototype is public; polished UX, pilot and store gates remain. |

## 3. Learning, queue and daily settings

Schedule from the local civil date of submission: incorrect or partial resets streak and schedules tomorrow; first consecutive correct schedules +7 days; second and later consecutive correct schedule +30. A recovery after an error is a first correct. Dates are YYYY-MM-DD; use calendar arithmetic, not elapsed milliseconds. Changing timezone does not reinterpret saved dates. Midnight in the current timezone starts a new study day. The sync reconciliation exception is explicit in section 8.

New-card limit: default 1 per local day, selectable 1/3/5/10 and persisted. Count first completed attempts for the deck today; lowering below already used leaves zero new cards. Pending AI submissions also reserve their new-card slot until cancelled or resolved, so offline retries cannot bypass the budget. Due date ≤ today means due. Due reviews sort by date, then stable ID; new cards keep deck order. Due reviews are not removed by the daily new-card cap. Show them separately: one new card does not promise one total question if reviews accumulated. Users can end a session without being forced to finish every due review.

Snapshot the queue at Start; settings/foreground refresh must not add cards mid-session. Show completion, next review date, an empty-deck state and an all-caught-up state distinctly. No undo in this increment. No scheduling on reveal, navigation or an incomplete AI request.

Role and level preferences: software engineering first; topics system design, networking, databases, algorithms, cloud and tools; types short open answer / multiple choice. Topic/type filters apply to new cards only; existing due reviews remain visible and counted, with a settings explanation. Changing filters or intervals does not silently rewrite due dates. Custom recurrence, local reminders and separate mock exams follow the core release; mock exams do not change the daily queue.

## 4. Question origin, length and locales (M2)

Prefer verified questions or close patterns from real international interviews. Distinguish topic evidence from evidence that a particular question was asked. Sources, in order: official company prep examples, attributable published preparation material, and multiple independent public candidate reports. Never claim frequency from a single report or an official list of topics. Do not scrape restricted sites, copy paid banks, use NDA material, or present company branding as affiliation. Cards are original concise adaptations, not verbatim copies.

Schema v2 source record: kind (`official-guide`, `book-course`, `candidate-reports`), locator (HTTPS URL or bibliographic citation), evidence scope (`topic` or `question-pattern`), optional company/role, level (`junior|mid|senior`) and round (`fundamentals|coding|system-design`). Draft fixtures may have no source, explicitly marked unverified. Private release cards require at least one source supporting the question pattern, plus independent human approval of technical accuracy, trade-offs, rubric and source relevance, bound to the current content hash. An AI worker cannot mark a human approval. Research catalog records only findings actually read, dates, evidence scope and short attributable excerpts; absence of a concrete example is not fabricated as a real question.

Both locales must cover all displayed fields. Count words by trimming then splitting Unicode whitespace; code identifiers count as one whitespace token. Prompt ≤25 English / ≤30 Portuguese words and one focused question; reference answer ≤60 English / ≤75 Portuguese words; 2–4 choices each ≤12 words; 1–3 required checklist items for an open answer. No multi-part system-design exercises. Shortness beyond the minimum evidence span defined in section 5 never reduces the technical grade; answer coverage does. Single-token facts (for example an HTTP status code or index name) use multiple choice instead of open grading. Each required point in an open card asks for a brief explanation capable of satisfying that span. Use a new card ID when changing the learning objective, correct choice or required checklist meaning; archive old IDs and preserve history. Typo-only edits may retain IDs but invalidate content approvals. Increase the deck revision for content changes.

Public fixtures remain clearly labeled unreviewed demo material, not the commercial deck. Private build input stays outside the checkout (check realpaths to reject symlink bypass), mode is explicit `fixtures|private`, missing/invalid private input fails closed, generated output is ignored. Each included topic requires at least four open and two choice items; adding a taxonomy topic does not require populating it in every deck. Fixture iPhone tests may use fixture mode; no private-release eligibility is implied.

M2 starts only after M1's changes are integrated on main and the combined tests/typecheck pass; no simultaneous ownership of study tests. Allowed files: `src/content/**`, `scripts/prepare-deck.mjs`, content tests; additionally only the schema-version acceptance in `src/study/content.ts`, fixture-ID/order expectations in `tests/study-*.mjs`, and bilingual topic labels in `src/study/copy.ts` if the taxonomy expands. No unrelated controller/UI behavior changes. Preserve existing IDs only where meaning is unchanged, preserve locale completeness and app compatibility. Test limits in each locale, empty/invalid sources, topic versus question evidence, no fake approval, revision/archive rules and both pipeline modes.

## 5. Grading contract and security core (M3, local first)

Open answers use AI feedback; there is no self-rating fallback. Non-empty text is required for Submit; empty Submit stays on the question with a localized validation message. Explicit “I don't know” records `missed` locally without a provider request. Multiple choice stays deterministic and local. Audio answers come later; a mental answer cannot be evaluated by the app.

The first-party HTTPS service owns the rubric and provider configuration. Client sends attempt ID, deck/card IDs, deck revision, locale and answer only. Account comes from verified authentication, never a client-supplied account ID. The service loads the accepted deck revision itself. Unknown card/revision or invalid body returns 4xx before spending anything. The model has no tools, memory, browsing, code execution or other users' data. The answer is untrusted data in a separate user message, not concatenated into system instructions. Prompt separation helps but is not a security boundary. Prompt and reference answer are treated as public.

Input: hard body-size limit before JSON parsing; NFKC normalization, removal of zero-width and bidi controls and other control characters (preserve newline/tab as whitespace), at most 1,000 Unicode code points after normalization. Do not silently truncate an answer. The UI also applies a compatible limit and displays validation. Error messages never echo answers or raw provider errors.

M3 is a provider-independent pure TypeScript module under `server/grading/`, not an HTTP endpoint and not imported into the app. It may be implemented and tested with explicitly synthetic model outputs; those tests do not prove live AI accuracy. No paid calls, auth, secrets or deployment in M3.

Contract exports: `normalizeAnswer`, typed rubric/request/model-output/result, `verifyGrade` and a server-owned prompt builder. Rubric has 1–3 unique required point IDs. Model output is exactly `{rating, points, hints, comparison}`: rating is `correct|partial|missed`; points lists every required point exactly once as `{id, covered, evidence}`; evidence is a string when covered and null otherwise; hints has 2–3 strings; comparison is one string. Reject unknown fields, unknown/duplicate/missing point IDs, wrong types and oversized output (16 KiB). Each hint ≤240 code points; comparison ≤600. Hints/comparison are plain text: reject URLs, markdown or HTML, control tricks, a configured canary token and verbatim system-prompt overlap (8 normalized consecutive words). The prompt template separates fixed system instructions from rubric data so legitimate rubric terminology is not treated as a secret. Request/rubric binding and validation happen before building any provider payload.

A covered-point quote must occur in the normalized submitted answer; use the same normalization for quotes. It must have ≥3 whitespace words OR ≥12 code points, and no duplicate quote across points. Shorter technical answers are allowed but may be marked not covered; live quality testing must measure this limitation. A structurally invalid output is rejected; unsupported evidence is downgraded to not covered. Derived rating: all required verified = correct; some = partial; none = missed. Final rating is the lower of derived and model rating. Thus the model can lower but not raise the server-derived bound. A verified substring still does not establish semantic correctness: this is measured by the quality gate, never described as an injection-proof guarantee. No keyword-based punishment for answers mentioning SQL injection or system prompts.

M3 acceptance: pure tests for valid EN/PT outputs; Unicode/bidi normalization; all input/output limits; duplicate/unknown/missing IDs; fabricated/reused/short evidence; model correct without evidence; malformed JSON/object types; links/HTML/markdown; canary and prompt-overlap leakage; unchanged input objects; no disclosure in thrown errors. Synthetic attacks must either reject the output or never result in correct without verified support. Mutations must prove rating/evidence/schema protections are tested. No claims about a real model or full endpoint security from this suite.

## 6. Grading UI, persistence and failure paths (after M3 review)

Generate attempt ID at question presentation. Submit freezes answer, locale and attemptedAt (the submission instant) for every retry. Show correcting, corrected, failed and pending-offline states. Once verified, save a grade exactly once and show covered/missed points, 2–3 hints, comparison and next due date. Disable Submit during request/commit. Only the trusted grading adapter returns open-answer ratings; UI has no rating controls.

Offline or transient failure: persist a pending request locally; allow skip without scheduling, retry or cancel with confirmation. Pending requests reserve a new-card slot, survive force quit and are distinct from saved attempts. Retry uses the same ID and frozen payload. Online provider failures read “Couldn't grade — try again”, not a false offline claim. A definite rejection exposes no model output and does not schedule. Persist pending answer text encrypted at rest (platform secure-key storage); delete after success/cancel. Never put pending answers in telemetry. Anonymous unsubmitted drafts are disposable with an entry warning; submitted pending requests are not disposable.

The schema migration after M1 adds attempt source (`choice|ai|gave-up`), grade ID and grader version, plus the durable pending outbox. Allocate the next `user_version` from the actual migrated schema, not hardcoded migration 2. Legacy self-rated attempts retain an explicit legacy source; do not relabel them as AI grades. Never overwrite history.

Native SQLite: dedicated connection, set foreign_keys/busy_timeout/journal_mode before BEGIN; serialized access and BEGIN IMMEDIATE, idempotency + SQL compare-and-swap. Whole-operation bounded lock retry, same request ID. Node tests execute the same SQL with Expo-like defaults and asynchronous interleaving; native two-connection contention tests remain a separate gate.

## 7. Accounts, hosted service and cost controls (contracts to finalize before production work)

Optional account at onboarding/settings; local study and choice grading work anonymously. Account is required for paid AI grading or sync. Sign in with Apple / email one-time code; Google on Android. Use verified provider tokens and secure session storage (Keychain/Keystore), not plain KV. OTP expires, has request and verification limits, and does not enumerate emails; register Apple's private relay sender. No automatic account merging. Collect only email and study data, not name, phone or CPF. In-app deletion revokes Apple tokens where applicable, removes server/account-local data and supports JSON export.

Candidate hosting: isolated TypeScript API + Postgres on the existing VPS; no deployment authorized just by this recommendation. The server cannot be stateless: persist accounts, grades, budgets, idempotency and sync events. Separate projects/secrets/network roles; daily encrypted off-site backups and a restore test before rollout. The reviewed private deck artifact is deployed to the service with an explicit list of accepted revisions. Production infrastructure, identity issuer, session/OTP mechanisms, retention/deletion and exact budget defaults need a concrete reviewed contract before this module is implemented; they do not block M1–M3.

Idempotency binds (account, attempt ID) to canonical payload hash. Mismatch = 409; simultaneous identical requests share one provider operation. Provider timeouts may have incurred cost: reserve maximum input/output cost before dispatch, never retry a possibly billed request automatically without accounting. Persist safe terminal outcomes and bounded transient retry semantics with leases/crash recovery specified before implementing the endpoint. No fake exactly-once provider guarantee across crashes.

Controls before external testers: authenticated identity, per-account/day and account+card/day limits, atomic global budget reservations, independent provider workspace spend cap and alerts. IP limits only for OTP/signup to avoid blocking shared mobile IPs. Limits return an explicit retry/limit message, preserve pending work and never fabricate a grade. App Attest/Play Integrity are defense in depth with capabilities and development fallback explicitly reviewed; never claim attestation alone prevents abuse. A cap/config/credential missing fails closed for paid grading. Final provider/model and spending amount require maintainer approval.

## 8. Sync (contract required before implementation)

Server-authoritative append-only attempt log. Partition local stores by account. Anonymous-to-account import needs explicit confirmation once; logout/account switch closes and clears that account's local data after safely resolving pending work. Never submit an old user's pending answer under a new account. Preferences merge last-writer-wins per field using server revisions. Server grades are immutable records bound to account, attempt, deck/card and revision; verify that record on sync, never accept a client rating for an AI attempt.

Concurrent offline attempts require a deterministic replay/conflict policy beyond the current local CAS. Proposed order is (validated attemptedAt, attempt ID); server bounds clocks and protects against forged timestamps. Replay may legitimately change due dates; explain reconciliation rather than promise dates never change. Cross-device new-card budgets and outbox ownership also need a reviewed contract. Until then, no claim of working cross-device sync.

## 9. Privacy, live evaluation and release gates

Explicit opt-in before sending answers to a named third-party AI; declining leaves local choice study available. Withdrawal disables new sends and resolves/deletes pending requests explicitly. Consent text must state real provider retention, transfer destinations and deletion limits; no zero-retention promise without a contractual basis. Policy/legal/store review covers LGPD bases and international transfer, Marco Civil log duties, App Store privacy disclosures and Google Data Safety. App/SDK/server logs use an allowlist of identifiers, timings and outcomes, never answers, auth tokens, raw provider exceptions or prompt bodies. Canary tests inspect actual logs/traces. Do not present unverified legal interpretations as compliance certification.

Before a live grading pilot: read current official provider API/retention documentation and Apple review rules; configure secret and approved spend cap, verify separate test infrastructure, test account isolation, payload size before parse, redaction, concurrent budgets, idempotency conflict and failure recovery. Inspect compiled mobile bundle for provider credentials/endpoints. No live answer is sent before explicit consent.

Deterministic CI uses malicious synthetic outputs to verify controls, not recorded model output as a substitute for live safety. Live adversarial cases (English/Portuguese overrides, role-play, fake JSON, Unicode tricks, extraction attempts) run ≥5 times each on changes to model, prompt, schema or deck. Non-answers must not be correct. A canary + overlap filter is defense in depth, not an assertion that prompts cannot leak.

Quality before external testers: at least 150 synthetic or consented answers stratified by language and correct/partial/missed, labeled by two human reviewers, with a held-out set. Agreement ≥85%; false-correct on partial/missed ≤5%. Evaluate correct vs not-correct because partial schedules like missed; report denominators. Grammar/accent cannot lower the technical grade. Human judgments are not invented by AI. Keep this evaluation set outside the public repo.

Validate low-fidelity onboarding → first question → Submit → feedback → next review and empty/failed states with three target users before production styling; use new participants after redesign. Accessibility gates: VoiceOver end-to-end, per-locale accessibilityLanguage, AX5 without clipped actions, contrast in both appearances, non-color statuses and Reduce Motion. Release device gates: native SQLite contention/idempotency, offline local choice and durable pending request, force quit/relaunch and consent-language persistence; online trusted grading; Android smoke. A compiled bundle is not device acceptance.

Payments, TestFlight invitations, store publication and final brand selection remain separate decisions. Audio later: record/replay/delete, explicitly consent to external transcription, technical and communication rubrics separate, no penalty for accent. Product pilot tests retention and unseen short follow-ups plus willingness to pay; no interview/job guarantee. Public English README/demo must distinguish working paths, fixtures and blocked integrations.

## Sources

[1] https://pubmed.ncbi.nlm.nih.gov/16507066
[2] https://pubmed.ncbi.nlm.nih.gov/19076480
[3] https://atoz.amazon/en-us/jobs/hiring-process/interview-prep/software-development-topics
