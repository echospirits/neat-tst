# In-app Support

Support is included in Core CRM and available to every authenticated role, including tasters. On desktop, find it directly below **Profile & preferences** in the sidebar user card; on mobile, find it under More (or in the taster tab bar). It is independent of Neat's sales Worklist, scheduling and calendar sync. It does not require the Intelligence add-on or a separate feature toggle.

## Reporting and reviewing

Choose **Support → New support ticket**, then select Bug / something broken, Data issue, Enhancement request or General question, add a short summary and description, and choose **Send ticket**. The new-ticket button is visible to every authenticated role, including Platform Admin. **Screenshot (optional)** is a visible file-upload field with a preview and Remove screenshot control.

Identity comes from the authenticated account. Tenant users, org admins and tasters keep their organization filled in automatically. Platform Admin can search and choose the ticket's organization directly on the form; a known home organization or Support View is preselected when available. No Support View is required to create a ticket. Platform Admin remains the reporter of tickets they create. The Platform dashboard also has a **New support ticket** link. Reports receive a ticket number; failed submissions retain the entered form and a stable request ID prevents duplicate saves on retry.

Users see their own organization's tickets that they reported. Organization admins can review all tickets in their organization, including reporter identity, original report, screenshot and public replies. They cannot answer on another user's behalf or see private platform notes. Platform admins see the global queue at `/support`, even without an organization Support View selected. The Platform dashboard shows active and urgent ticket counts. Live search, category/status filters and 30-ticket pages support a small review queue; urgent reports appear first, then oldest reports.

## Answering

Platform Admin writes a response and chooses Open, In progress, Waiting for reporter, Fix planned or Complete. An anticipated fix date is optional, except that Fix planned requires a date. Dates are explicitly estimates. Keep a pending fix in Fix planned; Complete indicates the answer or fix has been delivered. A response is required for an update, so a reporter always has an explanation. Optional urgency and private platform notes are behind disclosures. Public status/date changes and replies remain in the conversation history. Private notes stay visible only to platform admins.

The reporter sees the latest public response in a banner on their next authenticated visit, including a fresh login. Checks also refresh during navigation and when returning to the app. **Got it** acknowledges that exact reply revision on the server, across devices; it does not close the ticket or erase the conversation. An older acknowledgement cannot hide a newer response. Only one banner is shown at a time, with a link when more responses are waiting. The reporter can reply to a completed ticket to reopen it; a reply to Waiting for reporter returns it to Open.

## Diagnostic context and screenshots

The browser keeps at most 10 recent page paths from the last 30 minutes in session storage, isolated by user and organization. The user can review the paths and turn off inclusion before sending. Paths, browser family and viewport size are sent only with the report. Search parameters, fragments, authentication/token routes, typed values, page contents, click text, network bodies and automatic screen recordings are excluded. Storage being blocked does not prevent a report. If Platform Admin selects a different organization for the ticket, recent pages from the current organization are omitted.

An optional user-selected PNG, JPEG or WebP screenshot is resized and exported as JPEG in the browser, stripping file metadata. Only one image, no more than 600 KiB, is stored in a separate database table. Authorization uses the same ticket scope on every image request; responses are private/no-store with MIME hardening. Images have no public Blob URL. The reporter or Platform Admin can explicitly remove a screenshot after confirmation. Screenshot bytes remain until removal; there is no automatic retention job. Text and conversation history remain for support reference. This intentionally bounded first version avoids another storage service or replay provider; review retention and storage usage as adoption grows.

Screenshots respect `FILE_UPLOADS_ENABLED`; text-only reporting works when uploads are disabled. No new environment variable, secret, third-party provider, email delivery or provider activation is required. The database migration is additive and must precede deployment of support code. Ticket text and attachments are not logged by support error handlers.

## Authorization and concurrency

Server code derives identity and role from the session and derives the organization for every tenant reporter. Only Platform Admin can choose another existing organization when creating a ticket, with platform authority and target existence checked inside the locked write transaction. Forged reporter or organization fields cannot widen a tenant user's access. Platform Support View cookies never widen a tenant user's access. Organization membership and authority are rechecked inside writes. Ticket ownership is immutable after creation; a reporter who moves organizations loses access to old-organization tickets while the old organization's admin retains them. Private messages are filtered in database queries, before serialization. Same-origin checks protect mutation endpoints; request bodies, text lengths and image size/types are bounded. Report creation permits at most 10 new tickets per reporter per hour. Concurrent writes use actor row locks, request-ID uniqueness and ticket revisions; a conflict keeps unsent text and asks the admin to reload before resending.

## Research and deliberate scope

The design adapts a few established support patterns without adding a helpdesk product:

- [Intercom ticket forms](https://www.intercom.com/help/en/articles/7112463-how-to-create-a-customer-ticket): collect useful issue details at reporting time and keep the ticket ID, description and replies together.
- [Zendesk ticket lifecycle](https://support.zendesk.com/hc/en-us/articles/8263915942938-About-the-ticket-lifecycle-and-ticket-statuses): distinguish active work, awaiting the requester and a delivered resolution; support reopening when the issue remains.
- [Sentry replay privacy](https://www.sentry.help/en/articles/13964404-session-replay-faq-web): replay capture needs masking and scrubbing. Neat instead starts with reviewed page paths and a manually chosen screenshot, avoiding continuous recording and a new provider.

There are no promised response-time SLAs, email notifications, automatic session screenshots, multiple support-agent assignments or integration with the sales Worklist. Browser verification uses local fixture users and a fixture database, not temporary admin sessions in shared TST. Production promotion remains a separate authorized release task.
