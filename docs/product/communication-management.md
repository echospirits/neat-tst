# Communication management

## Shipped workflow

Communications is under More/settings. A normal organization member can configure one Google and one Microsoft mailbox, or try a visibly marked MOCK connection in development/TST. Support View cannot read or connect another user's mailbox.

Real authorization requires explicit environment configuration. The app requests read-only email/calendar scopes, never send permission. Imported metadata is owner-private. The owner reviews unmatched/ambiguous messages, chooses an account with live search, and may explicitly share the entry with the team. Corrections are audited and survive provider replay. Earlier imported entries are paginated.

Settings expose history window, retention and exact-user-address internal-message exclusion. Sync shows a page checkpoint/error and can continue. Disconnect clears tokens immediately; optionally delete history. Pending OAuth callbacks are invalidated on disconnect. Fixture mode creates an unmatched synthetic email and uses the same ingestion/review services.

Account Activities also logs SMS, calls and email performed outside the application. This is completed-activity capture, not message transmission.

## Provider coverage and limits

Gmail supports bounded metadata history and history-ID changes; Graph supports Inbox/Sent deltas. Both read primary-calendar metadata and exclude private/confidential/cancelled meetings. Ambiguous or absent exact-contact matches stay in review; email domains never establish account identity.

Live providers have not been authorized/tested in this implementation. Attachments, original-message links, aliases, advanced matching, communication AI and integrated SMS are incomplete. No personal-phone capture or unsupported messaging-platform capture is claimed.

See [activation and operational limitations](../engineering/integration-setup.md), [privacy](../architecture/security-privacy.md) and [test evidence](../releases/v0.2-test-report.md).
