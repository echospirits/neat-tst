# Pipeline and account plans

The existing Pipeline is the sales progression workflow. Legacy `/deals` links redirect to it. Dormant Deal tables are retained for reversible compatibility; no new Deal records or separate deal screens are used.

Canonical account sales status remains on OrganizationAccountOverlay with existing status history. Optional organization-configured detailed stages map to those statuses; a nine-stage beverage template is available. Board and list views remain, with an optional detailed-stage board, search, territory and team filters. Changing a detailed stage uses the canonical status service. A paused/lost or automatically changed account cannot display a stale incompatible detailed stage; selecting the old stage can explicitly reopen it.

Account plan stores objectives, target products, competitors, objections, placement evidence, estimated bottles, estimated USD, probability and close date. Optimistic versions prevent silent overwrites. Owner/contact relationships remain the existing account owner and Contacts; next actions are canonical Worklist items. Both status changes and detailed stage changes appear in the account timeline.

Open forecast excludes Purchasing, Nurture and Lost. Missing estimated values remain missing; a valued account without probability contributes no weighted estimate and is disclosed. A plan or placement commitment is not verified product placement or purchase evidence. Existing buying-state history distinguishes first/repeat observations independently of the planning stage.

Wholesale Opportunities and Agency Intelligence continue to generate explainable recommendations and own their snooze/dismiss/feedback/resolve lifecycle. A Pipeline account is not a duplicate of their product-specific analytical evidence.
