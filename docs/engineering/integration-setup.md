# Integration setup

## Communications retired

In `0.4.0`, mailbox OAuth/sync and imported appointments, business SMS and signed callbacks, contact suggestions, and reviewed communication AI are removed. Old routes have no handler, including `/settings/communications`, `/api/crm/mail/*`, `/api/crm/sms/*` and `/api/cron/communications`. These integrations cannot be enabled through configuration or retained feature rows.

No application or provider-side records are deleted. If old mailbox/SMS credentials or external webhook/scheduler registrations exist, they are retained but unused; provider-side revocation/secret removal is separate operator work. Keep shared `CALENDAR_TOKEN_ENCRYPTION_KEY`, Google Calendar configuration and `OPENAI_API_KEY` where used by retained calendar, Eventbrite, research or visit features. The `CRM_MAIL_*`, `CRM_GOOGLE_*`, `CRM_MICROSOFT_*`, `CRM_SMS_*`, `CRM_AI_ENABLED` and `CRM_AI_MODEL` configuration belongs to removed code. [Validation](../releases/communications-retirement-validation.md).

Existing Worklist calendar authorization and synchronization are independent and retained.

## Eventbrite

Organization Setup accepts an Eventbrite read token and organizer ID, verifies ownership through the provider's organizations endpoint, then imports bounded event pages. Encrypted tokens are never displayed. Manual sync stores a continuation cursor; errors retain it. Existing local event/staff/result edits are preserved, with updated provider snapshots available for review. No attendees or attendee PII are imported. Record confirmed attendance manually. A nonproduction mock connection supports acceptance. See [Eventbrite API](https://www.eventbrite.com/platform/new/api).

## Routes

Enable Google Routes API and a server-restricted key; configure `CRM_ROUTES_ENABLED=true` and `GOOGLE_ROUTES_API_KEY`. The server uses Compute Routes waypoint optimization, validates the returned index permutation, times out provider calls, and bounds requests to ten/member/hour. Users review the order before saving. Missing credentials/failures use explicitly labeled straight-line ordering without road duration or ETA. See [Google waypoint optimization](https://developers.google.com/maps/documentation/routes/opt-way).
