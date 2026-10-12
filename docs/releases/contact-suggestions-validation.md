# Contact suggestions — TST validation (2026-10-12)

## Scope

Tenant-specific reviewed suggestions in existing account Contacts and Communications. Two-way/repeated captured correspondence ranks first. Approval uses normal contact persistence/search, preserves aliases and privacy, and does not send messages or grant SMS consent. See [operator guide](../product/contact-suggestions.md).

## Verified checks

- Full suite: **852 tests, 76 suites, zero failures/skips**, 28.82 seconds.
- Targeted credential-pattern scan of 31 staged feature files found no hits (not a comprehensive secret audit).
- TypeScript, optimized Next.js build, Prisma validation and `git diff --check` passed.
- Generated schema diff matches the one additive migration; no unrelated schema change.
- Isolated PostgreSQL `br-frosty-mouse-avfw4xvc`: tenant/member/private-owner isolation, header names, internal/no-reply filtering, two-way counts, required confirmation, simultaneous/repeated acceptance, preserved primary email plus alias, persistent dismissal, source-deletion rejection, SMS acceptance without consent/visit side effects, preserved private activity and sanitized tenant audit passed.
- Additional isolated checks: inactive identity blocks a new duplicate; invalid account and foreign-tenant existing-contact selections are rejected; removing a previously approved alias allows a fresh explicit review.
- Optimized-build browser: **390×844 and 1440×900**; existing Contacts/Communications integration, prefilled account/name, missing-name validation, reviewed contact persistence after refresh, live existing-contact search/alias acceptance, empty search, zero page errors and no horizontal page overflow passed. Mobile/desktop screenshots inspected; review spacing and checkbox/selector labeling corrected.
- Manual/import/API contact creation now shares persistence and serialization with suggestion approval. Existing contact/import regressions pass.
- Scripts: `scripts/contact-suggestions-rehearsal.ts`, `contact-suggestions-edge-rehearsal.ts`, `contact-suggestions-browser.ts`; output fixtures/screenshots ignored. No shared-TST authenticated fixture session was created. Local browser server stopped.
- Existing six dependency audit findings from the integrated release remain; this change adds no dependencies. No live provider acceptance is claimed.

## TST database receipt

- Project `dawn-frog-33352119`, branch `br-divine-forest-avwq2b3g`, database neondb; private loader verified TST host, APP_ENV=test and DATABASE_TARGET_ID=neon-neat-tst.
- Recovery snapshot branch `br-calm-mode-av064t66` (`pre-contact-suggestions-20261012`), parent LSN `2/9F1BFC30`, without compute.
- Applied and registered only `20261012120000_contact_suggestions`; historical ledger gaps untouched. Applied ledger count **44 → 45**.
- SHA-256 source/ledger match: `6f8848ff6fc2d872a2f5b8c8d3bcfdcfb61d6a980b0075d2fd6bb90b0adb671f`.
- Contacts **611 → 611**, identity/name fingerprint unchanged: `d52bcb6527d872597316ef2ca4a39892`. Activities remain 2; review rows, synthetic CRM organizations, mailbox connections and SMS connections remain 0.
- Recovery is a forward repair or operator-reviewed snapshot restore; do not drop records to roll back. Disable/unexpose suggestion UI if needed while preserving accepted contacts and review receipts.

## Deployment

Baseline staging/tst `8cc02bb2c28d0d088c43fb559d93be4173b41e28`. Tested application commit `c6686b8d14dd047ea331ab2b1dd917e69fbc748f` (feature checkpoint `27883a3651a0fea902143ea82b565ae9524410f6`) is pushed to staging/tst.

Vercel deployment `dpl_73LmNmDFzXunAKDpmXRkUcijEdKX` is **READY** for that exact application SHA. [TST](https://neat-tst.vercel.app) · [immutable application deployment](https://neat-kgc8dcaik-joe-1533s-projects.vercel.app).

Health verified `ok=true`, `database=connected`, `databaseTarget=neon-neat-tst`, `environment=test`. Signed-out Communications requires login and contact search returns 401. Vercel's production target label belongs to the separate neat-tst project. This documentation-only receipt follows the tested application commit without runtime changes. Production/main remains `af1f396726e3b15e1167f5af2aa6ba426cae9bf9`; no production push, schema/configuration mutation, credential provisioning or live message.
