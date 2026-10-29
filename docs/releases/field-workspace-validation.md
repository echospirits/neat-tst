# Field workspace validation

Status: local validation passes for 0.5.0-dev; TST publication and authenticated browser acceptance pending. No production promotion is authorized by this task.

## Scope

Shared desktop navigation, account tabs and compact briefing, contextual mobile account actions, Worklist hierarchy/filter labels/relative urgency, a concise empty personal schedule with separate unassigned work, and visit form density/persistent actions. No migration or hosted configuration change.

## Evidence

- Clean `npm ci` succeeds against the inherited 0.4.0 dependencies and version-only 0.5.0-dev lockfile changes. Local runtime: Node 24/npm 11. The Node 22 dependency workflow is verified separately after the push.
- Full suite: **877 tests passed, zero failures**. Includes new sparse/populated briefing, retained panel markup/default section, Eastern-day overdue age tests, existing tenant/canonical-action coverage and the unchanged all-role Edit authorization expectation rendered through More actions.
- `npm run typecheck` passes. `npm run build` passes with local development environment and all side-effect switches disabled, without live database credentials. The first build attempt collided with a test-held Windows Prisma DLL; the sequential retry passed.
- `git diff --check` passes. Impeccable mechanical detector ran once over changed UI files, returned `[]`, and exited 0. This does not establish WCAG conformance or browser behavior.
- React review: account panels remain mounted, role/feature selection stays server-owned, the client does not fetch protected account data, tab keyboard/hash history handlers clean up their listeners, and established canonical actions retain source/return context.

Authenticated TST browser observations, exact commit, dependency workflow/deployment status and health target are recorded after publication. No temporary admin session or live CRM save is needed for the read-only UI acceptance. No provider success may be inferred from unit mocks.
