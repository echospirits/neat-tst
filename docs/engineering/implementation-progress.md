# Integrated CRM implementation progress

## Current state — 2026-10-11

The remaining application areas from the master brief have been implemented by extending canonical workflows. This is **0.2.3-dev for TST**, not production promotion. Historical v0.2.0/v0.2.1/v0.2.2 artifacts remain untouched. The owner correction is permanent in AGENTS.md and ADR 0012: Pipeline replaces the duplicate Deals surface; Log Visit replaces the duplicate Activities entry surface.

See the [complete feature inventory](../product/feature-inventory.md) for source locations, implemented scope and deliberate source-data limits. Source remains authoritative. No live provider success is inferred from a mock.

## Completed application work

- Canonical interaction logging, contacts/person links/merges/aliases, authorized timeline filters, transparent health, account briefing and versioned Pipeline plans/configurable stages.
- Google/Graph operational recovery, occurrence windows, completed-rescan deletion reconciliation, private matching, internal exclusions, retention and backoff.
- Reviewed two-way business SMS with consent/signed callbacks and uncertain-send handling; nonproduction mock.
- Canonical Worklist playbooks and transactional contextual follow-ups; guarded cancellation.
- Tenant account categories/parents/territories/teams/custom fields/documents; guided visits, opt-in local drafts and reviewed route ordering.
- Existing Recipe catalog/costing/approval/public sheets; existing EventShift operations/staff conflicts/Eventbrite and coverage-aware sales comparisons.
- Permission-aware reviewed AI adapter/mock, expanded existing Analytics continuity/execution/territory reports and CSV exports.
- Current TST Retail/Restaurants wording and state-access changes integrated. New event/playbook references and signed callbacks participate in that state policy.
- Source documentation, activation instructions, migration/recovery guidance and regression scripts updated.

## Validation / release work in progress

Current merged automated suite: **847 passing tests, 75 suites, no failures/skips**. Additive migrations and isolated DB rehearsals pass. Final merged typecheck, optimized build and all three responsive browser scripts pass. Shared-TST migration/deployment receipt is being completed; exact results live in [v0.2-test-report](../releases/v0.2-test-report.md). Do not replace pending receipt fields with assumed success.

## External activation and source limits

- Live Google/Microsoft OAuth, Twilio registration/delivery, Eventbrite access, road routing and AI credentials/model quality require provider acceptance and explicit environment configuration. The application and mocks are implemented. No new live OpenAI key was provisioned.
- Personal-device SMS capture, full mailbox bodies/attachments, arbitrary Graph folders and full offline synchronization are not claimed. Original-message links and opt-in local text drafts provide bounded alternatives.
- Daily bottles cannot establish transaction order counts or observed revenue forecast accuracy. Reports label retained-history purchase-day observations and unknown coverage honestly.
- Six dependency package findings remain; see security review. Production credential remediation and production promotion remain separate tasks.

## Exact finishing steps

1. Complete merged optimized-build and three browser scripts against the isolated TST child; inspect mobile/desktop screenshots and repair failures.
2. Refresh refs, preserve concurrent release entries, apply/register only the nine reviewed new migrations to verified shared TST after a recovery snapshot.
3. Commit/push to staging/tst only; wait for exact-SHA Vercel READY and health test/neon-neat-tst. Record receipt and final security/test evidence.
4. Stop the local acceptance server. No main push/merge, production tag, live provider activation or shared-TST fixture account.
