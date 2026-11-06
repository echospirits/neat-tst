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
- Commit and TST deployment receipts: pending.

Browser acceptance uses isolated synthetic fixtures; it does not change real tasting data or claim live provider upload acceptance.
