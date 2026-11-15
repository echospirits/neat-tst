# OHLQ runner compatibility recovery — November 15, 2026

The November 14–15 failures stopped during Chromium dependency installation, before imports. GitHub's `ubuntu-latest` selected Ubuntu 26.04; the locked Playwright 1.60.0 explicitly rejects Chromium on that platform. Production's last successful imported sales date was November 13, while TST retained November 12. A forecast generated on November 15 from November 13 data is not evidence of a fresh source load.

## Scoped correction

Pin the existing browser-dependent workflows to `ubuntu-24.04`: annual sales sync, manual forecast refresh, production source download validation and historical forecast verification in both repositories, plus the existing TST-only warehouse inventory verification. This changes five TST workflows and four main workflows; the TST-only workflow is not introduced into main. Preserve every job guard, environment, secret reference, permission, concurrency group, action pin and import command. Non-browser workflows are unchanged.

TST is verified first, then only this correction is promoted to main. Preserve existing versions (TST 0.10.0-dev, main 0.10.1), application/dependency/schema/UI files, hosted configuration, historical release refs and unrelated TST pilots. No dependency upgrade or new application release is included.

## Evidence and recovery

- Production failures: [November 14 sync](https://github.com/echospirits/ohlq-field-crm/actions/runs/43620339957), [manual forecast refresh](https://github.com/echospirits/ohlq-field-crm/actions/runs/43621729924), and [November 15 sync](https://github.com/echospirits/ohlq-field-crm/actions/runs/43711565600). All fail at browser installation on Ubuntu 26.04, not at an OHLQ import.
- Baselines: TST `a1b127908b69bebf1858d0c7bf8b779bf173aef4`; main `9d665105c2788a0c4d16a1b3b562778cd18eb3d1`.
- Verify affected workflow isolation/security tests, exact-candidate clean installation, a real TST source refresh and persisted results before production promotion. Then recover TST sales for November 13–14 and production sales for November 14, checking actual steps and stored report dates.
- Pending delivery receipts will distinguish installed-browser checks, real imports, retained observations and any remaining provider/data warning. No skipped schedule slot is treated as an import success.

Rollback is limited to these runner-label changes. No database rollback is required.
