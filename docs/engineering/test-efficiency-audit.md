# Test efficiency audit — October 29, 2026

## Scope and baseline

Owner requested a read-only development-file cleanup inventory and elimination of unnecessary tests. Current refs were fetched first: TST `b6f6795f`, production `5e498ee7`, both released 0.5.0 with identical trees. The primary checkout initially held older 0.4.0 files; the audit and changes use current TST. Historical refs and release records are preserved.

This is test/tooling maintenance only. Application version stays 0.5.0 and feature development remains frozen. No runtime source, dependency version, schema, migration, provider or hosted configuration changes. No existing cleanup candidates were deleted. Private machine paths and cleanup recommendations are in the separate local review document, not this release record.

## Removed coverage and its replacement

| Test area | Cases removed | Evidence and retained coverage |
| --- | ---: | --- |
| `opportunityIntelligence.test.ts` | 18 | Old V6/research detectors, ranker and historical rescorer have no runtime/script callers outside their legacy module. `lib/opportunityEngine.ts` delegates current work to `wholesaleAssessmentService`. Retained live `analyzeActivityToPurchases` coverage and all current assessment/acceptance/lifecycle/concurrency cases. |
| `opportunityAffinity.test.ts` | 3 | Outcome label/training/calibration helpers in `opportunityLearning` are unused by current runtime/scripts. Retained all ten active affinity/ledger cases used by current assessment and agency intelligence. |
| `opportunityPresentation.test.ts` | 2 | Historical score-chart parser is unused by current runtime/scripts. Retained actual Opportunities UI integration case and current assessment rendering/presentation coverage. |
| `multiTenantFoundation.test.ts` | 1 | Package-purchase helper test belongs to retired onboarding. Replaced remaining helper references with live `DEFAULT_FEATURE_KEYS` assertions, including Forecast default/pilot checks; removed the unused identifier-parser assertion while retaining A3A schema guards. |
| `accountSalesStatus.test.ts` | 1 | Core/Intelligence/Pipeline entitlement assertions duplicate retained default-feature tests and navigation gating. All status transition, idempotency, import and Pipeline behavior remains. |
| `accountResearchAutomation.test.ts` | 1 | Repeated five earlier priority assertions and never actually supplied the bottle volume claimed by its name. Original first-observation, identity, stale, pursuit and upcoming-work cases remain. |
| `accountStateAccess.test.ts` | 1 | Sliced-source settings-action harness duplicates stronger real-auth/whole-module tests in `echoAdministration.test.ts`. Moved its unique audit actor and setting assertions into the retained case. All state policy and denial cases remain. |
| `appVersion.test.ts` | 1 | Checked documentation/package command spelling, without application behavior. Retained version metadata and protected diagnostics checks. |
| **Total** | **28** | **898 → 870 tests; 75 → 74 suites.** |

Historical comparison implementations remain available in source but are no longer part of the maintained runtime contract; reactivating them would require fresh validation. Communications/mailbox/SMS/AI suites were already removed in 0.4.0. Their remaining absence/entitlement guards are intentional regressions. Calendar still serves Worklist and is retained. Recipe references in merge/data-preservation tests protect stored records and remain.

The audit retained distinct authentication, Echo/tenant/state isolation, idempotency, errors, provider readiness, missing-versus-zero, lifecycle, and record-preservation coverage. Similar-looking boundary cases were not removed just to reduce the count. Two reviewers checked the obsolete-callsite and retained-coverage decisions.

## Faster validation workflow

- `npm run test:focus -- tests/<name>.test.ts [tests/<another>.test.ts]` runs explicit files with the same setup and child process isolation as `npm test`. Missing arguments, nonexistent files and paths outside `tests/` fail before starting tests. Full-suite `npm test` is unchanged.
- AGENTS/testing/developer instructions now require affected tests while iterating and one full-suite check at delivery, plus the exact release-candidate gates. An import-only automatic selector would miss source-text/VM tests and was deliberately not introduced.
- Replaced a synthetic 2 ms timer per mocked assessment write with `setImmediate`. It still yields while the concurrency counter is active and still executes failure/finally logic. Focused observed bulk-case times changed from 2,856 to 324 ms (205 accounts) and 1,463 to 44 ms (partial failure). These are observations, not controlled benchmarks.
- TypeScript discovery excludes root `output`, `tmp`, `.codex-worktrees`, none of which contains tracked source. On this machine, inputs fell from 6,556 to 1,443, including one added runner: **5,114 scratch inputs excluded**. All maintained source/tests and Next types stay in scope; exclusions do not delete files.
- Removed stale integration instructions for deleted SMS/Recipe scripts and mailbox/AI acceptance. Retained database/browser scripts are scoped tools, not mandatory after every edit.

## Validation

- Before: **898/898**, 75 suites, zero failures/skips/cancellations; Node runner 61.08 s, shell wall 63.07 s.
- After: **870/870**, 74 suites, zero failures/skips/cancellations; Node runner 45.08 s, shell wall 46.16 s. Two local runs, not a controlled benchmark; warm caches and concurrent work can affect timings.
- Focused affected checks: 59/59 core/admin/forecast cases; 53/53 opportunity/assessment/agency cases; 18/18 fixture consumers after timer change. Representative new focus command: 10/10 targeting/status tests, Node runner 0.80 s.
- Focus command rejects no arguments, missing files and non-test/outside paths with exit 1. Both reviewers inspected child failure propagation and path validation.
- Initial root typecheck encountered six stale `.next/dev/types/validator.ts` imports for retired platform routes. Those generated files were preserved. Typecheck/build validation uses a fresh source export under ignored `output/test-efficiency/validation` with the existing dependency directory linked, no environment-secret copy, and no unrelated scratch inputs. Exported code/configuration matches the working candidate.
- Clean-export strict typecheck and optimized Next 16.3.8 build pass. The sandboxed build first failed because the existing Workflow compiler could not read parent directories; the same build succeeded with authorized filesystem access and no compiler/configuration workaround. Hash comparison found zero differences in candidate source/tests/scripts/Prisma/package/config files versus the export. `git diff --check` passes.

No fresh live database or browser acceptance is claimed for test-only maintenance. Current security/retirement/browser-readiness unit tests still run in the full suite. Schema/migration/runtime/dependency diffs are empty.
