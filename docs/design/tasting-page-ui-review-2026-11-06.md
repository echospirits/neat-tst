# Tastings main-page UI/UX refinement

November 6, 2026. Owner-requested Impeccable refinement of the established Neat interface, TST only, base `d674f9b8`, application version **0.7.2 retained**. This is a scoped implementation and evidence record under [UI/UX Guidelines](../UI-UX-GUIDELINES.md), not a new visual identity or a complete accessibility certification.

## Primary task and required facts

Find and compare tasting commitments, recognize the next assignment or approval bottleneck, and change its workflow status or log the assigned same-day Visit without losing scope. Keep Agency name/number, date/time, taster, current editable status and material execution exceptions visible. History also needs comparable retail bottle observations, unknown values and source freshness. These working facts require no disclosure; long provenance and detail remain available in the existing record.

## Four material findings and response

Two independent bounded reviews agreed on these four P2 findings. The changes address the main browse surface; embedded My Schedule and Agency summaries retain their existing presentation.

| Finding and task impact | Guideline | Implemented response |
| --- | --- | --- |
| Repeated section chrome, repeated All tastings links and large action rows delayed useful records and spread four Upcoming records over a long page. | §§4, 6, 7: first-viewport working data, less repetition, restrained row actions | One compact page header/toolbar, one browse representation and compact status-group count bands. Rare Import/Settings move to Manage; secondary row actions move to More. |
| Desktop repeated records lacked shared comparison headers; History retail quantities were buried in repeated prose instead of an aligned numeric column. | §§4–5: aligned semantic comparisons, stable columns, units and tabular values | One semantic table with When, Agency, Taster, Status, optional History retail bottles on tasting date, and Actions. Status groups use separate table bodies. History values align right with tabular numerals; unknown and source-through dates remain visible. Mobile reflows to compact facts with inline status. |
| Search lacked an explicit clear path, date-order choice and honest shown-count context. Capped results could not be interpreted as a complete total. | §§5–6: visible scope, sorting, counts and concise local labels | Visible Find Agency, Date order, Clear search and shown counts. Ordering is applied in the server query before pagination; Workflow retains status grouping. The 100-row browse continuation and 250-row calendar cap are stated without inventing dataset totals. |
| Switching views or calendar periods could drop Agency search scope. | §§6–7: preserve deep links, filters, history and return context | One navigation helper carries query/order/calendar state across view tabs, Previous/Next, paging and detail return links. Search changes and Clear search reset paging. |

Source reviewed: `app/tastings/page.tsx`, `TastingBrowse.tsx`, `TastingMenu.tsx`, `tastings.css`, `lib/tastings/navigation.ts` and the existing server query. Native details/summary menus close on Escape, outside pointer and focus departure; Escape restores focus to the trigger. Working facts and status editing remain outside More. Upcoming keeps the full static status in its group band beside inline selection; History shows a static status pill plus Change status so its current state remains readable.

## Matched before/after evidence

Before evidence is saved in `output/playwright/tasting-ux/before/metrics.json` with eight valid captures. Its six isolated synthetic tastings are unchanged for matched after captures: four Upcoming and two History, including long identity text. Functional tests restore the original six states. No real sales/provider writes or shared-TST mutations occur. The baseline recorded zero status mutation posts and zero browser errors. All eight captures had no horizontal page overflow. The old baseline server is stopped; the capture-runner compatibility correction was confined to QA and introduced no product change.

“Complete” means the measurement found the Agency identity/number, taster, time and status within the first viewport. First-row Y is measured in CSS pixels from the page top. The completed aggregate is `output/playwright/tasting-ux/after/metrics.json`. It identifies seven fresh confirmation views, including both enlarged-text cases, and three retained first-inspection views. Their provenance is explicit below; retained measurements are not claimed to be freshly confirmed or pixel-identical.

| Matched capture | Before first-row Y | Before complete records | Before page height | After Y / complete / height | After provenance |
| --- | ---: | ---: | ---: | --- | --- |
| Admin Upcoming, desktop light, 1440 × 900 | 546 | 2 of 4 | 1,340 | 511 / 3 of 4 / 991 | Final confirmation |
| Admin Upcoming, desktop dark, 1440 × 900 | 546 | 2 of 4 | 1,340 | 511 / 3 of 4 / 991 | Final confirmation |
| Admin Upcoming, mobile light, 390 × 844 | 448 | 1 of 4 | 1,957 | 392 / 2 of 4 / 1,336 | Final confirmation |
| Admin Upcoming, mobile dark, 390 × 844 | 448 | 1 of 4 | 1,957 | 392 / 2 of 4 / 1,336 | Retained first inspection |
| Admin History, desktop light, 1440 × 900 | 546 | 2 of 2 | 914 | 489 / 2 of 2 / 900 | Final confirmation |
| Admin History, mobile light, 390 × 844 | 448 | 1 of 2 | 1,195 | 354 / 1 of 2 / 978 | Retained first inspection |
| Admin Upcoming, 320 × 844 reflow | 550 | 1 of 4 | 2,120 | 571 / 1 of 4 / 1,723 | Final confirmation |
| Assigned taster Upcoming, mobile light, 390 × 844 | 376 | 1 of 4 | 1,884 | 358 / 2 of 4 / 1,302 | Retained first inspection |

The baseline had zero clear-search and date-order controls. After checks verified their presence, shown counts, fixture facts and shared comparison headers. All recorded views have no horizontal page scrolling; bounded source-paint contrast checks reported zero failures. At 320px, the first record now starts 21px lower than baseline because Date order wraps to remain legible; one complete record still fits and total page height falls by 397px. This is an explicit legibility tradeoff.

Two invalid Loading/hidden-content enlarged-text captures were replaced within the same read-only confirmation with fresh, active, visible, hydrated pages; no product changes, functional reruns or submitted actions were involved. Both the original descendant-font doubling method and separately labelled root-font 200% method render all four records and four status controls, preserve actual 32px order text through viewport/full capture, fit the selected text and have no horizontal overflow or browser errors. Their first-record Y values are 793/821, with zero complete first-viewport records: enlarged text requires vertical scrolling. This is bounded reflow evidence, not a claim that all working data fits above the fold or that full WCAG conformance is established.

The first bounded inspection found the four main P2 issues addressed, then identified three finishing corrections. Final independent review cleared all three: More's accessible name includes its visible word, desktop More stays on one 44px line in a 104px column, and Date order uses sufficient character sizing/wrapping without shrinking enlarged text. Native menus also open above the bottom navigation when needed; bounds, Escape and focus return passed. No further source change was required.

All seven functional groups passed across the recorded initial and continuation runs: menu keyboard/dismissal behavior, actual sorting and reload/Back/return context, calendar/view scope, History zero versus missing, dirty Clear search, default History descending order, latest-response/newer-typing handling, state restoration, same-day Visit prefill, and pending/error/required-reason behavior. Clear search had exposed stale uncontrolled values; the Tastings-only `urlValues` opt-in now reconciles controls with the validated URL while retaining newer typing, leaving other callers' default behavior unchanged. Its four new behavioral tests and final shared-boundary full checks pass. The aggregate preserves group provenance rather than claiming one uninterrupted run.

## Action steps and deliberate tradeoff

Counts below are control activations; text entry is separate. Browser checks confirm the retained two-activation detail round trip and the extra secondary menu opening.

| Task | Before | After / retained contract | Tradeoff/evidence |
| --- | --- | --- | --- |
| Change ordinary inline workflow status | Open select + choose value: 2 | Same 2 | Existing status control and all twelve-value authorization/evidence rules retained. Required reasons still add text entry and Save. |
| Open a tasting and return to filtered browse | 2 activations, 0 disclosures | Same 2, observed | Query/view/order preserved on explicit return and browser Back. |
| Assigned same-day Log Tasting Visit or Directions | 1 direct activation | Same 1 | Both stay exposed for this field task. |
| Open Agency or Directions for other days | 1 direct activation | More + destination: 2 | Open Agency's extra menu opening/destination was observed; identity, time, taster and editable status remain visible. |
| Import schedule or Tasting settings | 1 direct activation | Manage + destination: 2 | Explicit +1 menu opening for infrequent administrator work. |

## Validation and remaining work

| Check | Current receipt |
| --- | --- |
| Final strict typecheck | Passed |
| Final completed full suite | 1,143 tests / 76 suites passed; zero failures/skips, 40,081.7407 ms |
| Final optimized build | Passed |
| Final affected checks | 24 passed, including four new shared-filter behavioral checks; not added to the full-suite total |
| Main-page and earlier focused coverage | Six new page tests included in the suite; earlier 28 focused checks overlap and are not summed |
| Captures and bounded final confirmation | Seven fresh confirmation views, including both repaired text methods; three retained first-inspection views explicitly labelled |
| Functional browser acceptance | All seven groups passed across actual initial/continuation runs; original fixture states restored |
| Independent final source/visual review | CLEAR; three finishing corrections resolved, no further changes |
| Exact tested commit/tree, TST delivery and deployment health | Pending |

The single design-detector pass reported the existing `tastings.css` 1.25rem metric tier, already described in DESIGN.md prose. It is not a new defect or token; no rescan or system-document refresh is needed. Existing shared theme, typography and components remain the visual authority. DESIGN.md and its known pre-existing sidecar drift are preserved. No shipping raster is added.

All twelve-status policy, approval/history/Visit evidence, tenant/assignment scope and canonical workflow semantics remain unchanged. This refinement adds no database migration, dependency, hosted configuration, version, release tag or main change. Local synthetic evidence does not establish signed-in shared-TST acceptance, live photo-provider success, full WCAG conformance or human acceptance.
