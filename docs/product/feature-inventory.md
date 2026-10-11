# CRM feature inventory

Updated 2026-10-11 for the integrated 0.2.3-dev TST work. Existing workflows are authoritative; ADR 0012 supersedes the separate Deals/Activities design. “Implemented” means application code and the listed local/isolated tests; it does not mean a live provider was authorized.

| Capability | Implementation and primary code | Persistence | Evidence / activation |
|---|---|---|---|
| Accounts, ownership, tags, notes, contacts, sales/inventory | Existing Agency/Wholesale pages, account overlays, OHLQ importers | Shared directory identities plus tenant overlays and tenant sales | Existing isolation/import tests; external IDs preserved |
| Account categories, parents, territory, teams, custom fields, documents | AccountProfile; crm/accountMetadata and accountConfiguration; Organization Setup | Overlay crmDetails/version, Organization.crmPreferences | crmAccountConfiguration tests and field-profile PostgreSQL rehearsal; document links retain provider access controls |
| People across accounts, duplicate merges, roles, aliases, preferences | Existing Contacts; crm/contacts; ContactRelationships | LocationContact personKey, aliases, authority, owner; inactive merged source retained | crmHealthContacts and CRM rehearsal; shared person is linked, per-account role remains local |
| Unified interaction entry | Existing Log Visit; visits/actions and LogVisitForm | LoggedVisit for physical evidence; AccountActivity for nonphysical communication | CRM browser/rehearsal; privacy, retry and physical-visit distinctions |
| Timeline and filters | Existing VisitActivityTable, ActivityTimelineFilter, crm/accountTimeline | Projections of visits, communication, completed Worklist, orders, Pipeline changes, events | Authorized server reads; filters operate on bounded loaded history |
| Google / Microsoft communications | crm/mail adapters, OAuth, sync; Communications settings | Encrypted MailboxConnection; owner-private AccountActivity and correction audit | crmMailAdapters plus PostgreSQL rehearsal; live OAuth/provider acceptance required |
| Business SMS | Existing account Contacts/Communications; crm/sms | Encrypted identity, SmsConsent/Event, SmsMessage, activity projection | crmSms tests, SMS rehearsal/browser; live Twilio number, consent, registration, signed callback required |
| Pipeline and account plans | Existing Pipeline/status panel; crm/pipeline and pipelineStages | Existing overlay status/history plus salesPlan/version; tenant stage configuration | Forecast/health tests, stage reopening/stale-write rehearsal; no separate Deals workflow |
| Relationship health / briefing | AccountBriefing; crm/health and briefing | Existing facts plus tenant thresholds | Explained agency/wholesale/chain recency, contact, purchase, overdue signals; missing evidence remains unknown |
| Next actions / recovery | Existing Wholesale Opportunities and Agency Intelligence, contextual actions, Worklist | Existing recommendation status, snooze, dismissal/feedback, conversion/event ledgers | Existing opportunity/intelligence suites; manual analytical tags preserved, no CFAO engine |
| Playbooks | Account Worklist / Organization Setup; crm/playbooks, contextualFollowUp | SalesPlaybook, PlaybookRun; canonical WorklistItem | DB concurrency/replay/cancellation test and browser start; no automated outbound messages |
| Guided/mobile visits | Existing Log Visit, visitGuides, VisitDraft, existing voice/photo tools | Guide prompt/answer snapshot; opt-in local draft with 24-hour expiry | crmField tests and browser; draft is not full offline synchronization |
| Territory / routes | Existing Pipeline filters, account maps, My Schedule RoutePlanner | Tenant territories/teams; Worklist routeOrder | Route unit/DB checks; Google Routes adapter, explicit manual/fallback review; no fabricated ETA |
| Recipe sales tools | Existing Recipe schema; /recipes, account recipe suggestions, approved public sheet | Recipe costing/version/approval; RecipeShare token hash/snapshot | Costing tests, DB and browser approval/privacy/revocation; no costs on public sheet |
| Events / staffing / Eventbrite | Existing EventShift and My Schedule; /events detail; linked Log Visit | Tenant-scoped EventShift, EventbriteConnection; existing visit/photo evidence | Event tests, DB conflict/isolation/replay, browser; Eventbrite fixture or live read token |
| Analytics and exports | Existing Analytics/OHLQ adapters, purchaseOutcomes, RelationshipReport | Existing sales coverage, visits, Worklist, overlays | Analytics + continuity tests; CSV export; dates and partial coverage disclosed |
| Reviewed communication AI | Account briefing; crm/ai and aiEvidence | Read-only retrieval; operational audit counts only, no stored generated prose | Mock and Responses fixture tests; DB private/tenant tests; live deployment configuration and tenant opt-in required |
| Tenant settings, access, branding, products, feature flags | Existing auth/organizations/featureRegistry/Organization Setup | Existing User.organizationId + role, tenant branding/products/features | Existing security/feature suites; no parallel membership/auth system |
| Support, imports, calendar, orders | Existing implementations retained | Existing source-of-truth models | Full regression suite; worklist side effects reuse canonical services |

## Deliberate limits

- Imported email is metadata. Original provider links provide authorized access to bodies and attachments. The assistant cannot extract commitments from bodies it has not ingested.
- Google primary calendar and Graph primary calendar/Inbox/Sent Items are supported. Custom folders, personal-device SMS capture and autonomous correspondence are outside the implemented integration scope.
- Shared directory schemas remain Agency and Wholesale. Custom categories, parent groups and fields extend their tenant profile; they do not create another directory or a second account identity. A user belongs to their existing organization; cross-organization identity switching was not required by the brief.
- Geographic territories use state/county/postal matching and explicit assignment. Teams and territories are organizational/reporting attributes, not new access-control roles.
- Daily sales support observed purchase days, bottles, retained-history repeat/lapse/continuity, and before/after comparisons. Transaction-level order averages and revenue forecast accuracy cannot be verified from bottle-only daily data. Existing direct-order records remain distinct.
- Health is an explained deterministic indicator, not a validated predictive model. No causation or performance outcome is inferred from activity volume.
- Live integrations, provider verification, production credentials/rotation and production promotion require separate activation. See integration-setup and the release validation report.
