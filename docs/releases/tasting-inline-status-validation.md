# Main-page tasting status editing

November 6, 2026. Owner-requested TST-only refinement on base `de75c36e3483a8d2de4ffb7e187bdb775b6d681c`. Version 0.7.2 retained; no production/main or tag change.

## Behavior

- Main Calendar, Workflow / Upcoming and History show inline status dropdowns when the signed-in user has a permitted transition. Shared Agency/My Schedule summaries retain their previous behavior.
- Simple choices save immediately through the existing `transitionTastingAction`; edit/cancellation explanations and optional denial reasons stay beside the dropdown. Calendar controls sit outside record links and preserve readable status labels in narrow columns.
- Role/tenant/feature gates, prerequisite milestones, optimistic versions and persisted history remain in the existing service. No manual completion, prerequisite skipping, terminal reopening or delegated taster approval is added.
- Successful changes refresh the same URL/filter scope and use the existing persistent action notice, now with an opaque semantic surface and a short confirmation. Failed saves keep prior saved status and entered comments. Saving disables repeat submissions.
- No schema/migration, dependency, version, configuration, entitlement or provider change.

## Verification

- Focused workflow/caller/integration/inline component checks: **37 passed**.
- Completed full suite: **1,113 tests / 76 suites passed**, zero failures/skips (51,324 ms).
- Strict typecheck and final optimized build: passed. The final build includes TypeScript validation; local Prisma engines were reused and the existing bundler required the permitted sandbox escape.
- Eight new tests execute role/state choices and actual component handlers, including autosave, exact ID/version/action, persistent confirmation, required comments, rejected-save retention and duplicate-save protection.
- Real-browser acceptance: **five persisted-flow groups passed, zero browser errors**, using isolated synthetic fixtures. Assigned-taster approval, required Needs Edit comment, failed-save recovery, Agency/State progression with exact history counts, and calendar cancellation/terminal behavior all passed. URL and filters remain in place.
- Mobile **390 × 844** and desktop **1440 × 900**, light/dark, 44px controls and no horizontal overflow verified. Calendar controls are outside record links. Evidence: `output/playwright/tasting-inline/acceptance.json` and seven screenshots in that directory.
- Independent scoped source and screenshot review passed. Final recaptures resolved the confirmation readability issue with no observed regression. One design scan retained only the existing unchanged 1.25rem advisory.
- Application commit on `neat-tst/tst`: **`e794d970312ce46f93b9b492def67bff5299d016`**. Published tree `24a479bc8f6596a73f794f11b7e8413f8dd74f0d` exactly matches tested local commit `589c79d3`. Connected GitHub delivery used a non-forced ref update leased to the verified base.
- Vercel deployment **`dpl_9aC4uzwLhnfgttqf9x1Vb5WGHjRE` READY**, exact application SHA, canonical `https://neat-tst.vercel.app` assigned. Canonical `/api/health` returned **HTTP 200**, `ok: true`, `database: connected`, `databaseTarget: neon-neat-tst`, `environment: test`. GitHub's Vercel status is successful.
- Production/main remains `0f027ae7d90b5eb8444ad5cfbdc93ca7c90648e9`; no production push/merge, tag, migration or hosted configuration change. Documentation-only delivery receipts follow the tested application commit.

Browser acceptance uses isolated synthetic fixtures; it does not change real tasting data or claim signed-in shared-TST browser or live provider upload acceptance. The local acceptance server was stopped after review. Existing scratch/review files remain unstaged.
