# Activity engine

## Implemented model

`lib/crm/activity.ts` extends existing `AccountActivity`; it does not create a competing visit/task database. Manual entries support calls, email, external SMS, virtual meetings, internal notes, customer interaction, samples, tastings, training, presentations, menu placement and merchandising. Integrated messages/meetings use provider source identities. `sourceKey` is unique within the tenant.

Every read includes the effective organization and `TEAM OR createdByUserId=current user`. Organization and platform administrators do not receive a private-correspondence bypass. New imports are PRIVATE. Legacy initiated actions retain TEAM visibility and remain labelled as initiated, not completed contact.

`readTimeline` merges authorized activities, physical LoggedVisit rows and completed WorklistItem rows. Each source is bounded to 51 rows before a 50-row merged page. Timestamp plus prefixed source ID cursors preserve ties. Account links retain directory identity and contextual return paths. Legacy source rows remain authoritative.

Corrections require the owner, validate tenant contact/account association, and write ActivityAudit in the same transaction. Provider replay updates metadata while retaining manually corrected associations/visibility. Manual submissions use owner-scoped UUID keys so retries do not duplicate entries.

## Meaning and limitations

Physical visits are recorded through the established Log Visit workflow. Imported calendar invitations are not proof of attendance and do not advance meaningful-interaction timestamps. Manual meaningful flags exclude internal notes. Last contact, meaningful interaction, physical visit and follow-up are computed separately in `lib/crm/briefing.ts`.

The timeline is not yet a complete projection of purchase/order/status/legacy-note history. Contact and owner/source predicates exist in the service; the shipped filter UI is activity type. Deal/task scalar metadata is reserved but not fully wired through activity forms. No bodies/attachments are ingested.

## Validation

`tests/crmDomain.test.ts`, `scripts/crm-rehearsal.ts`, and `scripts/crm-browser-acceptance.ts` cover validation, replay, privacy, tenant isolation, corrections, equal-time cursor predicates, real persistence and responsive entry. See [report](../releases/v0.2-test-report.md).
