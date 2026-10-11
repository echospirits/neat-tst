# Communication integration setup

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

- Each invocation processes one bounded provider page. The UI offers continuation; `/api/cron/communications` processes up to two eligible connections. The route is implemented but is not automatically scheduled by this release. Configure an authenticated scheduler after provider acceptance and choose a cadence/capacity matching mailbox volume. No webhook subscription is registered.
- A database lease excludes concurrent writers. Activity writes, retention cleanup and cursor advancement share a transaction. Provider HTTP failures preserve the prior checkpoint and store a safe error category. Transient failures are retried on the next invocation; there is no adaptive exponential retry scheduler yet.
- Gmail history expiration restarts a bounded snapshot. Graph tracks Inbox and Sent Items, not arbitrary custom folders. Graph's provider-side restrictions on filtered delta volume still apply. Expired cursors recover recent metadata; a complete historical deletion reconciliation after cursor expiry remains a gap.
- Default history is 30 days; retention is 90 days. Users can configure history 1–90 and retention 7–365 with history no larger than retention. Metadata older than retention is removed on the next successful sync. Disconnected accounts retain metadata until explicitly deleted; no standalone retention sweeper is installed yet.
- New records are owner-private. The owner can associate/correct and explicitly share an activity. Internal exclusion uses exact organization-user email addresses; aliases and verified internal domains are not configured yet. Domain matching alone never automatically assigns an account.
- Bodies, attachment references, original-message links, AI summaries, sent drafts and SMS are not implemented by this increment. No live mail or SMS can be sent from these features.
- Disconnect immediately disables ingestion and destroys stored tokens. Optional history deletion removes imported metadata and its correction audit. Provider-side consent must also be revoked in Google/Microsoft account settings if desired.

## Mock mode

In development/TST, Communications → Try fixture mode creates a visibly marked MOCK connection. Synchronization creates a synthetic unmatched email for association review. Repeated ingestion uses the same source key; choosing Create demo connection resets the fixture cursor for repeat testing. Production rejects demo creation and fixture synchronization.
