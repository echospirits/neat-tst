# Communications pilot — Echo Spirits review for v0.2

> Historical design/review record. This feature is retired in 0.4.0; the walkthrough below no longer applies to the current application. See [retirement validation](../releases/communications-retirement-validation.md).

Communications ships with v0.2 as an opt-in **Pilot**, initially enabled only for Echo Spirits. It is separate from Core CRM and Intelligence. Platform Administration → Organizations → Echo Spirits → Plan → Pilot shows the enrollment. Other existing and new organizations do not receive it automatically, including in TST. Wider enrollment requires a separate review decision and explicit Platform Admin change.

## Start with a demo in TST

1. Use your own Echo Spirits membership and exit Support View. Open **My Work → Communications** on desktop or **More → Communications** on mobile. The page is labelled Pilot.
2. Expand **Try fixture mode**, choose **Create demo connection**, then **Synchronize next page** under Demo mailbox. No email provider is contacted and nothing is sent. One synthetic email from `unmatched-demo@example.invalid` should appear in Needs review and Suggested contacts if that identity is not already a contact.
3. Expand **Suggested contacts → Why this suggestion?**. Check the demo subject, email address and time. Open **Review contact**; select a suitable test account and enter a clearly marked test name. The demo does not supply a real person's name or determine an account for you.
4. Confirm the approved contact details will be shared with Echo Spirits, then **Add reviewed contact**. Verify it appears in that account's existing Contacts and the suggestion disappears after refresh. Private mail evidence must remain private.
5. Re-synchronizing the demo must not create a duplicate contact. Test **Link to existing contact** or **Dismiss for me** with a different captured candidate when available. Dismissal should survive refresh.
6. Clean up the test: disconnect Demo mailbox and choose the history-deletion option. Deactivate the synthetic contact through Edit contact. This does not change real mailbox connections.

Demo mode checks CRM matching/review/persistence, not Google/Microsoft authorization, live delivery, provider history coverage, or automatic synchronization. The fixed demo address can already exist after another reviewer accepts it; an empty suggestion list in that case is expected. Do not treat a successful demo as proof that a live mailbox is working.

## Then review a real mailbox

Provider setup must be completed before Connect Google/Microsoft becomes available. Pilot enrollment alone does not authorize or activate a mailbox; each member connects their own account. No provider credentials or live connections were activated by this pilot change.

1. Connect your own mailbox, choose a small history window, and synchronize. Continue if more history is available. Check the connection's last-sync time and any reconnect/retry notice.
2. Use a known external restaurant conversation whose address is not already in tenant Contacts. Check sender/recipient addresses, subject, original-message link and time against the provider. Both inbound and sent activity should appear when available. Two-way conversations should rank above one-way volume.
3. Confirm that an unassigned or ambiguous restaurant requires a human account choice. Verify an approved name/email goes to the intended account, not a similarly named restaurant. Header names are editable hints; bodies/signatures/attachments are not read.
4. Ask a second Echo member to inspect their own Communications. They should not see your private mail or mail-derived suggestions. They should see an accepted shared contact. Business SMS evidence, when configured, is team-visible.
5. Verify an existing contact identity suppresses a duplicate suggestion; linking a new address preserves the contact's primary address. Creating/linking a contact must not send mail/texts, grant SMS consent, log a visit or change Pipeline/Worklist.
6. Account Contacts may have no Suggested contacts section until matching captured evidence exists. A lack of suggestions is not proof that sync failed: the addresses may already be contacts, internal/no-reply, outside the retained window, or lack account context.

Business SMS is a separate optional test using the organization's Twilio number and recorded opt-in consent. Personal phone SMS/iMessage is not captured. TST's mock SMS flow can exercise consent and replies without live sending; validate real Twilio registration, signatures, delivery and opt-outs separately before live use.

## Rollout decision

Record a pass/fail plus an example for connection/sync, account matching, contact creation/linking/dismissal, duplicate prevention, privacy and mobile/desktop usability. Report missing/wrong associations through in-app Support with the smallest necessary diagnostic detail; do not paste private message content into shared notes.

Keep Communications in Pilot until Echo approves those checks and any live-provider gaps are resolved. Disabling the Pilot hides the page/navigation/account tools and blocks OAuth, sync, sending and new suggestions; it preserves existing contacts/history and continues honoring verified SMS opt-outs and delivery receipts. Worklist calendar sync and normal Contacts/Log Visit/phone/email links remain Core workflows.
