# Wholesale commercial opportunity intelligence

The authoritative specification for `0.2.0-dev` is the [scoring charter](wholesale-scoring/00-WHOLESALE-SCORING-CHARTER.md), [data rules](wholesale-scoring/01-EVIDENCE-AND-DATA-RULES.md), [sales model](wholesale-scoring/02-SALES-BACKED-ACCOUNT-VALUE.md), [research rubric](wholesale-scoring/03-RESEARCH-BASED-ACCOUNT-VALUE.md), [pursuit controls](wholesale-scoring/04-TARGETING-AND-SALESPERSON-CONTROL.md), and [calibration cases](wholesale-scoring/05-CALIBRATION-AND-ACCEPTANCE-CASES.md).

`WHOLESALE_COMMERCIAL_V1` replaces the active numeric wholesale model. Its integer 0–5 rating answers whether this account represents meaningful commercial business for the tenant's included portfolio at compatible prices. Null means unrated. A separate persisted assessment status and reason distinguish insufficient evidence, ineligibility, pending changes and failed refreshes. Retail-agency intelligence is outside this change.

## Superseded guidance

The former 0–100 attention score, capture/develop/deepen candidate selection, buyer-access feasibility, chain caps, strategic multipliers, local-incumbent blocks, incomplete-90-day ceilings, evidence-mode-first ranking and default SKU pitches are superseded. They must not determine current commercial stars. [The V1 design](wholesale-assessment-v1-design.md) and [0.14 validation](releases/0.14.0-wholesale-assessment-validation.md) remain historical records only. Historical product targets and accepted pursuits remain intact.

## Operation

`lib/wholesaleAssessment.ts` owns the rules; `wholesaleAssessmentInputs.ts` prepares catalog and saved-research inputs. `wholesaleAssessmentCoverage.ts` derives represented periods from certified daily source metadata. `wholesaleAssessmentService.ts` batches every applicable account for each enabled active tenant, including accounts without purchases or pursuits. Recalculation does not request research or update research timestamps.

Current assessments exist independently of pursuits. The shared star component is read-only. Default actionable discovery emphasizes 3–5 stars and respects snooze, dismissal and account eligibility; explicit filters retain access to zero and unrated accounts. Explicit user acceptance may create an account-level commercial follow-up. Scoring itself creates no pursuits or tasks. Existing manual tasks and customer service continue.

The additive migration `20261011010000_wholesale_commercial_stars` adds nullable integer ratings, status/reason, skipped run counts and versioned audit snapshots. It first preserves existing current assessments as historical snapshots without mapping their old scores to stars. Run monitoring distinguishes expected, evaluated, persisted, skipped/ineligible and failed counts. Failed current imports preserve the last valid rating with a source-error status. The existing lease, same-date correction and retry protections remain.

With an explicitly verified TST environment loaded:

```powershell
# Read-only preview. Account evidence output is private and must not be committed.
npm run recalculate:opportunities -- --output output/commercial-preview.json
# Persist existing saved inputs only; no portal import or research.
npm run recalculate:opportunities -- --apply
# Bounded tenant/account preview or recovery.
npm run recalculate:opportunities -- --organization ORGANIZATION_ID --account ACCOUNT_ID
```

The command refuses production and exits unsuccessfully for incomplete or source-blocked refreshes. Review [environment isolation](environment-isolation.md) before operations. Do not reset, schema-push, or replay historical migrations to deliver this additive change.

## Rollback and validation

Retain the additive schema, ledger and snapshots. A forward correction and idempotent score-only sweep is preferred. If rolling back application code, pause assessment writers first: an older writer can overwrite current commercial JSON even though it ignores the new columns. Restart only a consistent model/version. No production promotion or stable release tag is authorized by this feature.

Implementation, migration, recalculation, comparison and responsive evidence are recorded in the [v0.2 validation record](releases/0.2.0-validation.md). Initial boundaries are implementation heuristics subject to a separately versioned calibration review, not consultant-validated weights, probabilities or revenue forecasts.
