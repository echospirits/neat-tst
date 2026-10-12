# Reviewed contact suggestions

Contact suggestions extend account Contacts and Communications. They do not create a new contact directory or automatically add people.

## Where to review

This is part of the **Communications Pilot**, initially assigned only to Echo Spirits for v0.2. See the [pilot test guide](communications-pilot-review.md). Core CRM alone does not enable it, and TST's standard feature override does not enroll other tenants.

- On an account, open **Contacts → Suggested contacts**. Existing activity associations supply the account context.
- Open **My Work → Communications → Suggested contacts** on desktop, or **More → Communications** on mobile, for people whose account has not yet been established, or to review across accounts.
- Search suggestions by name, address/number, or proposed account. Open **Why this suggestion?** for up to three source records, then **Review contact**.
- Choose **Add contact** and confirm the name/account, **Link to existing contact** using the existing tenant contact search, or **Dismiss for me**.

Acceptance creates an ordinary tenant LocationContact or adds an email/phone alias without replacing existing details. Matching active contacts are reused; matching inactive contacts must be reviewed/reactivated instead of duplicated. Concurrent/repeated approvals do not create duplicate contacts. Contacts at other locations are shown as a warning, not automatically merged or transferred. Displayed supporting messages can be associated when unassigned or already at the selected account; messages already belonging elsewhere are not moved.

## Evidence and ranking

Suggestions are computed on read from the last 90 days of captured email metadata and business SMS. Up to 1,000 recent email records, 500 SMS records, and 10,000 active tenant contacts are considered; the highest-priority 200 suggestions are returned, with explicit coverage limits. Each email considers up to 100 participants. Two-way correspondence ranks above one-way volume; then frequency and recency rank candidates. These are observed interaction counts, not customer value, buyer authority or sales predictions.

Email participant addresses and aliases are checked against existing contacts. Explicit header display names are editable, unverified hints; missing/encoded names require manual entry. Internal tenant/member/mailbox addresses, configured internal domains and common no-reply/bounce addresses are excluded. Email domains do not establish a restaurant identity. A proposed account comes from an existing activity association; unknown/multiple accounts require human selection.

SMS uses normalized phone numbers from the connected business number. Personal phone SMS/iMessage is not read. Saving a contact never opts a number into messaging, sends a message, creates a visit, changes Pipeline status or creates a Worklist item.

## Privacy and review state

Mail-derived suggestions and their evidence belong to the mailbox owner, including when the underlying activity was shared. Another tenant member, tenant administrator or Platform Support View cannot browse private mailbox suggestions. Organization business SMS is shared. All source reads, contact lookups and writes remain tenant/state-scoped. The server rechecks current evidence, membership, account access and duplicate identities when accepting.

Platform admins with their own organization membership can connect their own mailbox and review their own suggestions. Exit Support View first, including when viewing your own organization through Support View. Platform privileges alone do not grant membership or access to another user's mailbox; an admin without an assigned organization cannot connect through Support View.

The confirmation explicitly shares only the approved contact details with the organization. Mail visibility is preserved; private subjects/bodies/source identifiers are not copied into shared contact notes or organization audit. Per-user dismissals and acceptance receipts are persisted using a hashed channel/identity key. Dismissals remain hidden across refresh/sync. Deleting or expiring source evidence removes the suggestion naturally; a stale review cannot create a contact from missing evidence.

## Activation and limits

This feature works on already captured metadata. Existing records can suggest an address without a name; display-name hints appear when provider metadata is next ingested. It does not expand access to full email bodies, signatures or attachments, does not infer job titles, and does not require AI. Live mailbox/SMS connections and automatic mail scheduling still require the configuration and acceptance in [integration setup](../engineering/integration-setup.md). No live provider was activated by this change.

## Implementation

- Domain: `lib/crm/contactSuggestions.ts`, `contactSuggestionRules.ts`, shared `contactCreation.ts`.
- UI: account `ContactSuggestions`, `ContactSuggestionList`; existing Communications, account picker and `/api/contacts` search.
- Additive migration: `20261012120000_contact_suggestions` adds bounded participant display-name JSON to AccountActivity and a per-tenant/user review-state table. No customer data backfill.
- Verification: `tests/contactSuggestions.test.ts`, provider tests, isolated `scripts/contact-suggestions-rehearsal.ts` and `scripts/contact-suggestions-browser.ts`.
