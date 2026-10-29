# Production source download repair

Owner requested repairing automated Bailment PO/Invoice and Partner DC downloads on October 28, 2026. Production remains on 0.4.0; this fix is developed in TST 0.5.0-dev and must be selectively promoted under a separate production instruction.

## Confirmed failures

- Owner confirmed both source URLs and that Bailment has `From` and `To` fields visible immediately. Its date fields differ from the shared sales reports' `From date` / `To date` labels.
- TST diagnostic commit `e4e35cec2a0b46600e6de81499191ae42136d6cf`, Actions run `40807721874`, found Vendor loaded but the expected old date controls absent; no render-error banner was detected.
- In that same real source check, Partner DC's visible loading shell reported zero rows. Its CSV completed one second later with all 33 rows and no parse errors. The premature expected count caused the rejection.

## Correction and acceptance

- Report-specific date labels and accessible-label lookup; calendar dates are verified by normalized date value after entry/selection.
- Partner DC readiness requires a positive unfiltered total and matching displayed rows. Full CSV count validation is unchanged, so pagination, filtering and truncation still fail safely.
- Four actual Chromium fixture checks cover initial zero count, delayed tbody redraw, filtered/empty sources, truncated exports, and the distinct Bailment/shared-report date controls.
- Focused browser/import/authentication suite: 19 passed. Diagnostic baseline full suite: 883 passed. Diagnostic baseline optimized build and TypeScript passed; rerun affected checks for the final fix.
- TST hosted download validation is scoped to its repository/ref/environment, reads configuration and credentials inside a database-enforced read-only transaction, and then downloads/validates both sources without importing or refreshing. It shares the existing OHLQ concurrency lock. Private files are discarded and never uploaded.

## Live result

Final corrected source run pending. Do not treat the diagnostic checkpoint or fixture checks as a successful live import. No database migration, provider credential change, extra scheduled job, or production publication is part of this checkpoint.
