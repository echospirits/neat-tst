# Unreleased — 0.4.0 release candidate

Owner-authorized Communications removal for Echo-only Neat, opened October 28, 2026. The owner subsequently explicitly authorized pushing this change to main. Validate the exact stable 0.4.0 candidate in TST before selective production promotion.

- Production baseline: `0.3.0`, main `438b1ae1` (release commit `191e4843`); no v0.3.0 tag exists in the verified remote.
- TST opening base: `1a293eab` (`0.3.0`). Its full tree matches production `438b1ae1`, although the release histories diverge.
- [Plan](0.4.0-plan.md), [pending release checklist](0.4.0-checklist.md), [validation](communications-retirement-validation.md).
- Scope: Communications retirement only; final candidate SHA/tree and delivery receipt are recorded in validation.

## Changes

### Initialize Impeccable product context

- Add root `PRODUCT.md` with the owner-confirmed Echo-only audience, field-sales purpose, canonical workflows, retirement constraints and existing accessibility requirements.
- Record the owner's comp-first preference in `.impeccable/config.json` and the existing App Router shell in `.impeccable/live/config.json`. Repository inspection found no CSP declaration; no application security policy was changed. The checksum-verified Impeccable engine is installed and the project design hook is enabled through the installed plugin's post-edit and Stop hooks; local hook consent remains gitignored. Live mode has not been exercised.
- Documentation and development-tool configuration only; no application, database, provider or deployment changes.

### Remove Communications and its supporting functionality

- Description and user-visible behavior: Remove Communications from desktop navigation and mobile More; remove mailbox OAuth/sync, imported appointments, matching/review, business SMS connections/sending/callbacks, suggested-contact review and the reviewed communication assistant/AI setting. Old URLs and endpoints have no route. Keep existing contacts, manual call/email/text logging, account timelines and briefing, Worklist/calendar sync, events and Pipeline workflows.
- Relevant TST commit(s): Commit titled `Retire Communications for Echo-only Neat`.
- Validation and known limits: See the linked validation record. Mock/fixture checks do not establish live provider acceptance. Stored history remains readable under existing authorization.
- Migration, backfill, environment/configuration and feature flags: No migration or backfill; schema and all historical migrations retained. Remove `COMMUNICATIONS` from the feature registry/packages and ignore/reject retained entitlement rows. Remove the unused Twilio dependency and Communications-only CSS/scripts/tests. No new environment variables. Mail/SMS/communication-AI variables are unused after deployment; shared Calendar/OpenAI credentials remain in use by other features.
- Release/recovery notes: Test in TST, then promote the exact tested state under the owner's main authorization. No database records, tokens, consent/opt-out history or provider-side accounts are deleted. Runtime code cannot sync/send/receive or discover contacts after retirement. Any separately configured external scheduler/webhook will receive a missing-route response. Historical provider grants and hosted secret cleanup, if needed, are separate operator work. Reverting code would restore old entry points and access to retained records; do not replay migrations.
