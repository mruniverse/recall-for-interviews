# AI privacy preflight — documentation findings

Checked against the public pages on 2026-11-27 (UTC). This is a documentation check, not legal certification or proof that an account has any particular retention agreement. No API call or paid service was enabled.

## Apple disclosure and permission

The official App Review Guidelines explicitly require disclosure and permission before sharing personal data with third-party AI: “You must clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so.”[1]

Implementation consequence: a clear, localized opt-in before the first submitted answer leaves the device; declining must not trigger a background upload. Record the consent version and offer withdrawal. Consent UI alone does not prove server enforcement.

## Candidate provider retention

Anthropic's published commercial policy states: “For Anthropic API users, we automatically delete inputs and outputs on our backend within 30 days of receipt or generation, except:”. The page lists exceptions including longer-retention features, agreements such as zero data retention, usage-policy enforcement and legal obligations.[2]

The API documentation distinguishes different data-handling arrangements and notes that “Different APIs and features have different storage needs.” Do not assume a Messages request, Files API, or a zero-retention agreement have interchangeable retention behavior.[3]

Implementation consequence: do not promise deletion immediately after grading, zero retention, or a contractual exception that the maintainer has not obtained. Confirm the selected account, model, API feature and agreement before approving disclosure text and production traffic. Anthropic remains only a candidate until provider and cost settings are agreed.

## Remaining gates

- Select provider/model and approve a concrete spend cap before live paid requests.
- Review applicable legal basis, transfer mechanism, account deletion and export with qualified counsel as appropriate.
- Test consent denial/withdrawal, log redaction and pending-request cancellation in the real client/server path.
- Retest official documentation before marketplace submission; policy pages can change.

## Sources

[1] https://developer.apple.com/app-store/review/guidelines
[2] https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data
[3] https://platform.claude.com/docs/en/manage-claude/api-and-data-retention
