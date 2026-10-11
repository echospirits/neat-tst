# ADR 0012: Extend the established account workflows

Accepted 2026-10-11. Supersedes ADR 0008's separate Deals aggregate and the standalone Activities UI in ADR 0002.

The owner rejected duplicate workflows. Pipeline already owns account sales status, purchase-driven transitions, history, and attention rules. Log Visit already owns account/contact selection, outcomes, photos, targeting, and Worklist follow-ups. These remain the canonical paths.

- `/deals` and legacy detail links redirect to `/pipeline`. Deal creation/stage server actions and the duplicate domain service are removed. Existing additive Deal tables remain dormant for reversible deployment; the verified shared TST database had zero Deal and DealStage rows before retirement. No table is dropped.
- `/activities` redirects to the known account's Activity section, or Log Visit if no account is supplied. There is one entry form. In-person capture creates LoggedVisit; completed phone/email/text/video/note capture creates AccountActivity. Nonphysical capture must never create a physical visit or VISIT_LOGGED event.
- Both capture modes use the existing follow-up, ownership, calendar, targeting, status, and contextual return path. Submission retries are serialized before dependent writes. Private conversation contents are omitted from shared task details and stage history.
- Forecast assumptions live on OrganizationAccountOverlay alongside the canonical status, with optimistic version checks and audit history. Next action continues to come from Worklist, not a new free-text queue.
- Contacts gain relationship fields, reviewed links and audited merges in the account Contacts section. Linking a person across accounts preserves separate account roles. A duplicate merge is limited to one account, archives the source, and preserves historical evidence.
- Relationship thresholds belong in Organization Setup. The existing Ohio intelligence engines remain authoritative for purchase/inventory recommendations. A relationship score does not replace them or infer missing sales as zero.

Before adding functionality, identify its existing route, authoritative record, mutation and side effects. Extend those first. A new entity or route needs a genuinely missing responsibility, not merely a new name for an existing one. Recipe and event work must likewise extend Recipe and EventShift rather than add competing models.

Validation: `crmDomain`, `crmHealthContacts`, existing status/navigation regressions, isolated PostgreSQL rehearsal and integrated browser acceptance. Detailed release evidence remains in the test report; application implementation and credential-dependent live acceptance are separate gates.
