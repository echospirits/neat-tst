# Communication integration setup

For v0.2, connected mail/imported appointments, business SMS and contact suggestions require the **COMMUNICATIONS Pilot**, initially enrolled only for Echo Spirits. Core CRM, Intelligence and TST's standard-feature override do not enroll it. See [Echo pilot review](../product/communications-pilot-review.md) for demo and live acceptance steps. Provider configuration remains a separate prerequisite.

Status: application-side metadata adapters and fixtures; no live Google/Microsoft mailbox has been authorized or verified by this implementation. Existing Worklist calendar authorization is separate and unchanged.

## Environment configuration

Set hosted secrets privately. Never place them in release archives or logs.

| Variable | Purpose/default |
|---|---|
| `CRM_MAIL_ENABLED` | Explicit `true` permits real mailbox authorization and synchronization. Default unset/disabled. |
| `CRM_GOOGLE_CLIENT_ID`, `CRM_GOOGLE_CLIENT_SECRET` | Separate Google OAuth web client for mailbox and meeting reads. |
| `CRM_MICROSOFT_CLIENT_ID`, `CRM_MICROSOFT_CLIENT_SECRET` | Microsoft Entra application supporting the intended organization accounts. |
| `CALENDAR_TOKEN_ENCRYPTION_KEY` | Existing AES-256-GCM credential encryption facility; at least 32 characters. Keep stable or explicitly reauthorize after rotation. |
| `APP_BASE_URL`, `OAUTH_ENVIRONMENT` | Environment-bound callback origin and resource identity; must match the running environment. |
| `CRON_SECRET`, `CRON_JOBS_ENABLED` | Authenticated background synchronization endpoint; cron also requires `CRM_MAIL_ENABLED=true`. |

## Google Workspace

1. Enable Gmail and Google Calendar APIs in the intended Google Cloud project. Configure the consent screen, test users and authorized organization policy.
2. Register the exact callback `${APP_BASE_URL}/api/crm/mail/google/callback` on a web OAuth client.
3. Set the Google client variables and credential encryption key for this environment. Enable mailbox reads explicitly.
4. A normal organization member opens Communications and chooses Connect Google Workspace. State is hashed, user/tenant-bound, expires after ten minutes and is single-use. PKCE binds code exchange.
5. Grant `gmail.readonly` and `calendar.events.readonly`. The application requests metadata from Gmail and attendees/timestamps from the primary calendar. `gmail.readonly` permits a bounded historical query, which `gmail.metadata` does not support. No send scope is requested.
6. Synchronize and verify a known inbound message, outbound message, exact contact match, ambiguous match, source deletion, expired cursor and token refresh in a provider test account before live activation.

Gmail read scopes can require provider verification and restricted-scope review for public use. The current implementation does not claim provider verification. See [Google scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [synchronization](https://developers.google.com/workspace/gmail/api/guides/sync), and [OAuth web flow](https://developers.google.com/identity/protocols/oauth2/web-server).

## Microsoft 365

1. Register a Microsoft Entra application with the intended tenant audience and web redirect `${APP_BASE_URL}/api/crm/mail/microsoft/callback`.
2. Configure delegated `User.Read`, `Mail.ReadBasic`, `Calendars.Read` and `offline_access`. No mail-send/application-wide mailbox permissions are requested.
3. Set the Microsoft client variables and authorize through Communications as the mailbox owner. Organization policy may require administrator consent.
4. Test Inbox and Sent Items deltas separately. The primary calendar uses a fixed delta window from the historical cutoff through 90 days ahead, refreshed as that horizon approaches. Only allowlisted Graph-origin `/v1.0/me/` continuation URLs receive tokens.
5. Verify refresh, pagination, deletion, reconnect and private/confidential exclusions with a test mailbox before activation.

See [Graph message delta](https://learn.microsoft.com/en-us/graph/delta-query-messages) and [Microsoft authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow).

## Sync operations and limitations

- Each invocation processes a bounded page. `/api/cron/communications` processes two eligible connections and a bounded retention sweep; activate an authenticated scheduler after provider acceptance. This release does not enable hosted cron or provider reads. UI continuation also remains available.
- Leases and a final authorization check bind writes, retention and checkpoint advancement in one transaction. Safe error categories drive exponential backoff (30 seconds up to one hour). RECONNECT connections are excluded from background retries until reauthorized.
- Full Gmail/Graph rescans retain one stable scan boundary; only a completed snapshot removes absent records in its history window. Graph waits for Inbox AND Sent before mail absence reconciliation. Older out-of-window records survive until retention. Failed or partial scans never sweep absence. Gmail label changes also re-read metadata to remove trash/spam.
- Google uses recurring occurrences (`singleEvents=true`) in a historical cutoff to 90-day-ahead window. Incremental sync never combines syncToken with time bounds. Google and Graph rebuild near the end of the horizon. Invitations do not establish completed contact. Graph covers Inbox/Sent and primary calendar, not arbitrary folders.
- Defaults: history 30 days, retention 90. History 1–90 and retention 7–365 are configurable, with history <= retention. The bounded daily sweep also expires metadata from disconnected mailboxes when the scheduler runs.
- Imported records are owner-private. Exact email aliases and configured internal domains supplement organization-user exclusions. Domain resemblance never automatically assigns an account. Owner corrections survive replay and may support unchanged-participant thread matching.
- Bodies and attachment bytes are not copied. Authorized original-message links provide access in the provider. Disconnect destroys tokens; optional history deletion also removes correction audit. Revoke provider-side consent in the provider account if required.

## Business SMS

1. Configure `APP_BASE_URL` with this environment's HTTPS origin and the existing credential encryption key. Set `CRM_SMS_ENABLED=true` and `SMS_ENVIRONMENT` equal to the app's actual environment only when activation is authorized.
2. An organization administrator enters the Twilio account SID, auth token and owned E.164 sending number in Communications. The adapter verifies the number belongs to the account; the administrator confirms completed business messaging registration. This confirmation is not a substitute for carrier approval.
3. Configure inbound SMS webhook at `${APP_BASE_URL}/api/crm/sms/<connectionId>`. Outbound sends supply their signed delivery callback URL. Use Twilio request signing; the route rejects invalid signatures and oversized requests.
4. Record consent/evidence for each recipient before sending. Every send requires a human review checkbox. The application includes organization identification and opt-out wording. Inbound STOP updates the ledger, including when ordinary sending is disabled. Unknown sends require manual provider reconciliation and are never automatically retried.
5. Verify send, delivery, inbound reply, duplicate webhook, STOP and disabled-connection STOP with test recipients before activation. Personal phone texts are manually logged through Log Visit.

In nonproduction, choose the mock sender and simulate replies from the account SMS panel. Mock messages never reach Twilio. See [Twilio request security](https://www.twilio.com/docs/usage/security) and [message callbacks](https://www.twilio.com/docs/messaging/guides/track-outbound-message-status).

## Eventbrite

Organization Setup accepts an Eventbrite read token and organizer ID, verifies ownership through the provider's organizations endpoint, then imports bounded event pages. Encrypted tokens are never displayed. Manual sync stores a continuation cursor; errors retain it. Existing local event/staff/result edits are preserved, with updated provider snapshots available for review. No attendees or attendee PII are imported. Record confirmed attendance manually. A nonproduction mock connection supports acceptance. See [Eventbrite API](https://www.eventbrite.com/platform/new/api).

## Routes

Enable Google Routes API and a server-restricted key; configure `CRM_ROUTES_ENABLED=true` and `GOOGLE_ROUTES_API_KEY`. The server uses Compute Routes waypoint optimization, validates the returned index permutation, times out provider calls, and bounds requests to ten/member/hour. Users review the order before saving. Missing credentials/failures use explicitly labeled straight-line ordering without road duration or ETA. See [Google waypoint optimization](https://developers.google.com/maps/documentation/routes/opt-way).

## Reviewed AI

Set `CRM_AI_ENABLED=true`, `OPENAI_API_KEY` and an approved `CRM_AI_MODEL` privately. Then enable optional AI in Organization Setup. A member must acknowledge each request and separately opt in to including their own private correspondence. Without all configuration, local mock excerpts/drafts are used. The Responses adapter has strict schema/source-ID validation, no tools, `store:false`, bounded evidence, timeouts and a 20/member/hour limit. Review provider processing/retention terms before enabling it. No live key or model request was created in this implementation.

## Mail fixture mode

In development/TST, Communications → Try fixture mode creates a visibly marked MOCK connection. Repeated ingestion uses the same source key; creating the demo connection again resets the fixture cursor. Production rejects demo creation and synchronization. Fixtures establish application behavior, not live provider acceptance.

## Contact suggestions from captured communications

After capture, Contacts and Communications compute tenant-specific, human-reviewed suggestions from participant addresses/header display names and business SMS numbers. Two-way and repeated correspondence ranks first; account proposals use existing activity associations. No additional provider scopes, AI key, full-body ingestion or autonomous contact creation is enabled. Accepted details are shared tenant contacts while mail evidence stays owner-private. See [contact suggestions](../product/contact-suggestions.md) for review, duplicates, dismissal and coverage limits.
