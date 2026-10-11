# Opportunity management

## Three distinct records

Existing SalesOpportunity is generated analytical guidance; existing account Pipeline is account sales status. New `Deal` is a rep-owned pursuit with estimated value and configurable stages. These records are deliberately not merged: a pursuit, a recommendation, and verified purchasing evidence have different lifecycles.

## Implemented Deals workflow

An organization admin explicitly initializes the nine-stage beverage default and can rename/reorder/change probabilities or add stages. Reads never create stage records. Deals supports known-account creation or live account search, title, USD revenue estimate, volume, probability, expected close, target-product text, next action, competitors, objections and notes.

The board groups by tenant stage; title search narrows results. Empty stages collapse on mobile. The current list caps at 250 and labels the cap. The open forecast sums recorded revenue and revenue multiplied by probability/100. Missing estimates are counted separately from zero; paused/won/lost records are excluded. This is an estimate, not recognized revenue.

The owner or organization administrator can change stage/status. Loss or reopening requires a reason. Version checks reject stale updates before history is written. Each transition records actor, time, prior/new stage and outcome. A stage move applies configured stage probability. Winning does not create a sale, prove placement, or complete tasks.

Deal details retain account/timeline links and canonical follow-up/visit actions. Worklist owns task scheduling and lifecycle.

## Incomplete scope

Full-detail editing/reassignment, multiple contacts, direct activity/deal joins, persisted forecast snapshots, conversion/aging reports and drag-and-drop are not implemented. Product fields are free-text estimates, not verified SKU placement. Existing account pipeline and Ohio recommendations remain intact.

Code: `lib/crm/deals.ts`, `app/deals`, `app/crm/actions.ts`. Evidence: domain tests, isolated PostgreSQL rehearsal and browser creation/outcome acceptance.
