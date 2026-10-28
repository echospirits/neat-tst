# Production Forecasting validation

- TST base: `45ba0587dbbe1183a4716cf12497f11472f91b50`; package remains `0.2.3`.
- Scope: owner-requested TST feature only, no production/main promotion, version bump or release tag.
- Audit/source/model details: [implementation guide](../production-forecasting.md); resumable notes: root `production-forecasting-checkpoint.md`.
- Focused statistical/source/UI checks: 15 passing. Full suite: 895 passing, 0 failures. Typecheck and optimized production build passed. The temporary local route is absent from the build; the two forecast pages and cron route are present.
- Disposable Neon TST branch `br-orange-fire-av32qc1z`, parent `br-divine-forest-avwq2b3g` in project `dawn-frog-33352119` (`neat-crm-tst`). Additive migration rehearsed successfully. No production database was used.
- Database integration: exact import replay; changed-overlap rejection; portfolio ownership; configured Distillery Only overriding a submitted Bailment classification; disabled entitlement rejection; list/direct-product tenant isolation; composite cross-tenant foreign-key rejection; daily run replay; old snapshots preserved; completed 30-day actual demand evaluated correctly (90 forecast / 90 actual synthetic cases).
- Synthetic stable-history backtests: eight folds each for mean, weighted mean, exponential smoothing, seasonal naive and seasonal growth, WAPE 0. Intermittent candidate and uncertainty cases have separate unit fixtures; this is synthetic validation, not live Echo accuracy.
- Responsive review uses the actual components with synthetic fixtures in a temporary local route (removed before delivery). Desktop 1440×1000, tablet 1024×900 and mobile 390×844: dashboard table/cards and product detail; document width matches viewport. Live search/no-results/Clear filters and loading/empty/error/disabled/success presentations reviewed. Mobile filters collapsed to keep decisions visible. Optional details disclose model evidence and import setup.
- Local screenshot evidence is under ignored `output/playwright/forecast-*.png`. No shared TST administrator session was created. A temporary local Next favicon 404 was unrelated to this feature; the deprecated form-state warning was removed by reusing ActionForm.
- Query audit: summary pages do not select detail JSON or observations; detail loads one product plus ten prior snapshots. Source/model refresh uses bounded server-side observations and batched portfolio/source reads. Composite tenant indexes cover the principal paths.

## Final delivery receipt

- Migration applied and ledger-verified on neon-neat-tst, direct host ep-noisy-dew-avchokwr.c-11.us-east-1.aws.neon.tech, database neondb. SHA256: `013f61facef70ec93e99a03f69952340b57083e8ecf90a2c712d88600e921f70`. Existing historical migration ledger entries were not replayed or reconciled.
- Live entitlement query: Echo enabled; both other current organizations disabled. No source imports; 30 initial Echo snapshots, all numeric forecasts unavailable. Initial run: `cmvrfrqzp0001upxk2uuafvlr`.
- Production baseline ref before delivery: `origin/main` e05e4e86bd5816c420462319c36b638bfc97571e. No production write, tag or version bump.
- Feature commit: titled **Add pilot production demand forecasting**. Exact pushed SHA and deployment/health receipt are reported in the delivery message.
- Local validation cleanup: removed only the worktree's stale generated development type cache after removing the review route. Final build/checks use the clean delivered route set. No temporary route or secrets are staged.
