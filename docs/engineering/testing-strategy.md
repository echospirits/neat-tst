# Testing strategy

Reviewed October 29, 2026 against released 0.5.0, TST `b6f6795f`. See [test efficiency audit](test-efficiency-audit.md) for removals, retained coverage and measurements.

`npm test` runs the complete suite using node:test through tsx. `tests/setup.ts` disables external side effects. Add behavior tests for matching, deduplication, privacy, tenant scope, state transitions and provider retries. Use a disposable database for persistence verification and Playwright for browser behavior. Source-only assertions do not prove database or browser behavior.

## Editing loop and delivery gates

1. Run the affected files during editing: `npm run test:focus -- tests/accountTargeting.test.ts tests/accountSalesStatus.test.ts`. The command requires explicit existing files inside `tests/`; no arguments is an error, not an implicit full run. It uses the same setup and process isolation as the full suite and preserves failure exit codes.
2. Select related caller, authorization and lifecycle tests too. Use source references to find them. Many tests load files as text or use VM mocks, so an import-only dependency graph cannot safely choose all affected tests. No automatic changed-files coverage claim is made.
3. Once the change is complete, run the full suite once before TST delivery, plus typecheck/build for code or configuration changes. Rerun affected checks after small final corrections; repeat the full suite when shared behavior, setup, dependencies or broad coverage changes. Do not rerun the suite merely to update release prose.
4. Validate the exact frozen release candidate with the full suite and the release checklist. Persistence and mobile/desktop acceptance apply to changed behavior; test-only maintenance needs no new live database session or UI fixture run.

Keep assertions for distinct permission boundaries, missing versus zero data, errors, retries, idempotency, side effects and preserved historical records. Retired feature entry-point guards still matter. Delete stale implementation/formatting assertions and exact duplicates only after finding the current behavior and retaining any unique coverage.

`tsconfig.json` excludes generated/scratch `output/`, `tmp/` and `.codex-worktrees/` folders. Maintained `app/`, `lib/`, `scripts/`, `tests/`, Prisma sources and generated Next types remain in scope. Exclusion neither removes those folders nor makes their contents disposable.

## Implementation references

- `package.json`
- `tests/setup.ts`
- `scripts/test-focus.ts`
- `docs/releases/RELEASE_CHECKLIST.md`

## Validation and remaining work

Record the tested scope and any unavailable checks. Historical release test totals are evidence for those exact releases and are not updated when current test coverage changes.
