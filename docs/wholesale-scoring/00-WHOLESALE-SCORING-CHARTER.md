# Wholesale commercial opportunity charter

Implemented for 0.2.0-dev. Model: `WHOLESALE_COMMERCIAL_V1`; calibration: `COMMERCIAL_2026_10_V1`. The authoritative owner request supersedes the former product-candidate attention model.

## Purpose and scope

“How strong is the commercial opportunity at this location for this tenant’s actual portfolio, based on meaningful product-level purchasing volume and price compatibility?”

This applies only to wholesale accounts and intelligence. Retail-agency calculations and workflows are unchanged. A linked wholesale summary on an agency page uses wholesale stars.

| Integer | Meaning |
| --- | --- |
| 0 | Commercially unsuitable, or too little meaningful compatible purchasing for proactive selling |
| 1 | Limited commercial opportunity |
| 2 | Modest commercial opportunity |
| 3 | Solid commercial opportunity |
| 4 | Strong commercial opportunity |
| 5 | Exceptional commercial opportunity |
| null | Unrated: essential evidence unavailable, pending computation, or ineligible |

`rating` is an integer or null; `state` is READY, UNRATED or INELIGIBLE, with `ratingReason`. Source-error and pending-refresh status are separate from the commercial result. A failed source preserves the previous valid assessment rather than manufacturing zero. A closed/ineligible account has no current commercial rating. A known eligible account with complete source coverage and no purchases can legitimately receive zero.

Stars are commercial tiers, not conversion probabilities, forecasts, measured consumption, attainable revenue, profit or promises that a salesperson can win business.

## Excluded factors

Contacts, buyer accessibility, relationships, friendliness, responses, meetings, samples, tastings, visits, worklist counts, assigned rep, local/corporate buying authority, targeting, snooze, dismissal and do-not-pursue controls have no effect. Focus/Opportunistic/Maintenance roles and strategic priorities have no effect. Outcome observations remain shadow data; conversion or relationship learning does not enter this model.

Explicit market inclusion/exclusion, inactive/discontinued products and catalog eligibility remain meaningful. Current stock and distillery-only routing are execution context. Identical relevant portfolios/prices receive identical ratings regardless of relationship. Tenant and local-brand purchases count at their actual quantity/price with no relationship bonus, displacement block or “already captured” subtraction.

## Commercial evidence versus pursuit

Current assessments exist independently of SalesOpportunity. Calculation creates no pursuit, tasting, reactivation, nurture or service task. Current model output has an empty product-candidate array and account-level reasons. Existing user-selected historical targets, accepted pursuits, notes, task links and detection evidence remain intact.

Snooze/dismissal/suppression determine actionable discovery visibility, not grade. Zero and unrated remain searchable/filterable. Manual tasks and ordinary customer service remain available. Explicit account-level user acceptance, where offered, is distinct from automatic scoring and does not select a product.

The live evaluator is `lib/wholesaleAssessment.ts`; normalized inputs are in `lib/wholesaleAssessmentInputs.ts`. The legacy 0–100 model is replaced, not cosmetically remapped. The legacy numeric storage field holds only the integer tier for schema compatibility; nullable `rating` is authoritative. Old scores remain audit history only.

See [data rules](01-EVIDENCE-AND-DATA-RULES.md), [sales formula](02-SALES-BACKED-ACCOUNT-VALUE.md), [research rubric](03-RESEARCH-BASED-ACCOUNT-VALUE.md), [pursuit controls](04-TARGETING-AND-SALESPERSON-CONTROL.md) and [calibration](05-CALIBRATION-AND-ACCEPTANCE-CASES.md).
