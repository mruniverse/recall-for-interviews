# Product plan — Recall for Interviews (working title)

## Product thesis

Help engineers recall a concept without cues and explain it clearly under interview conditions. Start with Brazilian software engineers applying abroad; choose interview language independently of job location and interface language. Default international practice to English with optional Portuguese explanations. Local roles and other tech disciplines stay on the roadmap.

## Evidence and limits

Roediger and Karpicke observed better delayed recall after retrieval practice than restudy in experiments with prose passages.[1] Cepeda et al. observed that the best review gap depended on the time until the retention test.[2] Therefore ask for an answer before showing feedback and space later attempts; the initial 1/7/30-day policy is a product hypothesis, not an optimal schedule established by science. These studies do not prove better interview outcomes. Amazon's public prep guide covers coding and system design; use it for topic selection, not as evidence of question frequency or permission to copy questions.[3]

## Phases and acceptance

| Phase | Experience | Exit gate |
| --- | --- | --- |
| 1 — iOS core | Onboarding → Today → question → explanation → next review. Original Software Engineering deck: system design, networking, databases and algorithms. Written answers get a reference answer, checklist and self-rating; multiple choice gets exact grading and explanations. | A physical iPhone completes the flow offline, including relaunch with saved progress. Tests cover repeated misses, progression, calendar/DST, duplicate submissions and no due cards. |
| 2 — Personalization | Topic and question-type filters, daily target, custom recurrence, optional local reminders, and short mixed-question mock sessions with a recap. | Filtering/reminders do not silently reschedule cards. Invalid intervals are rejected, settings preview future due dates, and mock sessions do not change the review queue. |
| 3 — Spoken practice | Optional English or Portuguese recording, replay, delete, transcript where supported. Separate technical correctness (rubric) from communication (clarity, structure and word choice). | Denied microphone, failed transcription and low confidence preserve text/self-review. Recordings stay on-device by default; any future external processing needs opt-in, retention and deletion policy. Compare feedback with human ratings before enabling automated grading; do not penalize accent. |
| 4 — Release | TestFlight pilot; Android compatibility and release follow iOS validation. Payments and App Store submission are separate decisions after product validation. | Measure whether users return for due reviews and can answer an unseen follow-up, not only card accuracy. Capture an English demo of the real app for the portfolio. No App Store submission or visibility change in this initial scope. |

## Scheduler contract (proposed)

New card + correct → 7 calendar days; second and later consecutive correct → 30 days. Any miss → tomorrow, reset streak; partial counts as miss. Due dates are saved local civil dates using the device's timezone at the attempt; a timezone change does not reinterpret stored dates. Queue overdue cards oldest-first before new cards. Save review history and next-due state in one SQLite transaction with a unique attempt ID. Configured intervals are bounded positive days, strictly ascending, applied to future attempts only; never silently rewrite existing due dates. No scheduler update before a rating, on back navigation, or during mock practice.

## UX direction

Prefer a dedicated, one-question study screen over a dashboard-first quiz grid: fewer context switches and more room for reasoning; topic browsing remains a secondary tab. Today shows due count, track, and one primary action: Start review. Study keeps progress above the prompt and one primary action below the answer. Feedback preserves the user's answer alongside a short explanation and explicit next review date. No timers or auto-advance in daily review. Design for Dynamic Type, VoiceOver reading/focus order, non-color-only status, light/dark contrast and reduced motion. Validate low-fidelity screens for onboarding, review, feedback and empty queue before implementing UI.

## Technical direction and boundaries

Recommend Expo / React Native and TypeScript with SQLite, offline-first and no account required for the first version. Keep a pure scheduler independent of UI/storage, versioned original deck content, and per-attempt history. Before application code: review architecture and product scope independently, then validate an Expo dev build on iPhone. Initial implementation scope: `app/`, `src/{study,scheduler,storage,content}/`, `tests/` and Expo project configuration. No backend, paid model, account sync, question scraping, or billing in the first increment. Public repo until actual App Store launch; making it private later does not recall public copies.

## Sources

[1] https://pubmed.ncbi.nlm.nih.gov/16507066
[2] https://pubmed.ncbi.nlm.nih.gov/19076480
[3] https://atoz.amazon/en-us/jobs/hiring-process/interview-prep/software-development-topics
