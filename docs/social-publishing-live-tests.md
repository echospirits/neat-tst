# Social Publishing live-test runbook

This checklist prepares later administrator actions. Building/testing the pilot does not authorize a public post, collaborator invitation or modification of existing social content. Use genuine upcoming content approved for the exact destinations. Simulated checks and read-only discovery are separate from live evidence.

## Before any public write

- Verify the current TST commit, `APP_ENV=test`, `/api/health` database target `neon-neat-tst`, Echo tenant entitlement and the explicit tester allowlist. Confirm no production application or database is targeted.
- Complete provider configuration/review and inspect actual discovered account IDs, names, handles and Page/location relationships. Confirm LinkedIn is Echo Spirits Distilling Co.'s company Page. Keep a group without a platform when no real destination exists.
- Configure private social media storage, token encryption and dispatch media access; confirm the intended provider can fetch only the needed media.
- Confirm durable Workflow dispatch operates in the TST project, plus its authenticated daily recovery endpoint, and observe at least one simulated scheduled run with the browser closed. Confirm server restart does not lose it.
- Set an explicit live authorization-window timestamp, Echo organization ID and exact Neat destination IDs. Enable the environment live switch only in TST and deliberately enable the current tenant live control in Connections, then approve specific content after both activation timestamps. Neither control alone may publish queued simulations.
- Inspect native Meta cross-post settings and identify any duplicate-producing automation before the first Instagram/Facebook send.

## First photo on each relevant provider

1. Select one actual destination and a genuine upcoming photo post. Prepare destination-specific copy, link and immutable media; for Google use venue-focused content consistent with regulated-products rules. Keep Instagram and Facebook independent.
2. Submit as a contributor, verify contributor cannot approve/publish via direct endpoint/action, then inspect the approximate preview as administrator.
3. Record explicit authorization for this exact copy/media/destination/timing and use **Approve and publish now**. A login/account-list success is insufficient.
4. Inspect the actual public result in the provider UI: correct destination/author, text, image, link and duplication. Record the actual URL, external ID, provider status, date, API/login route, reviewer and evidence in the capability record. A returned accepted/upload ID alone is not confirmed public.
5. Where processing/moderation continues, wait for its final result and record accepted, processing, rejected or confirmed public as exposed. If the outcome is uncertain, reconcile/inspect; do not click resend blindly.
6. Reauthorize/reconnect failures through the setup guide; repeat only the still-pending/failed destination. Preserve successful delivery evidence.

Confirm access/mapping for remaining brand accounts with read-only discovery rather than creating placeholder posts everywhere.

## Representative format checks

Use a separate exact approved content item for each applicable format. Record an explicit not-applicable/blocked result rather than assuming every account supports every feature.

| Provider | Representative checks | Actual result to inspect |
|---|---|---|
| Instagram | Single image; carousel with ordered media; finished Reel; plain image/video Story for an eligible professional account | Correct order/crop, caption, Reel/Story surface, processing/public state and account eligibility. |
| Facebook | Photo/text; link; finished video/Reel where implemented | Page author, destination-specific copy/link preview, processed video and no duplicate Instagram cross-post. |
| Google Business Profile | Photo update; event with explicit dates/time and button/link | Correct real location, venue-focused content, event details, action URL and moderation visibility. Native video support does not prove API support. |
| LinkedIn company Page | Text/link; single image; organic multi-image; finished video | `urn:li:organization` author, image order, link, video processing and actual company Page appearance. Member-profile posting does not pass. |

Optional Instagram audio and collaborator invitation require separate exact authorization, documentation/account eligibility checks and an available track/collaborator. Inspect attached audio on the actual Reel; record catalog/access limits. Inspect invitation receipt and acceptance before recording collaboration verified. Do not infer that audio crosses to Facebook. User tags, location tags, stickers and Story interactions each need their own supported-format check; route unavailable features through manual finishing.

## Durable scheduled delivery

1. Choose genuine content and a future `America/New_York` time. Verify UTC/offset and daylight-saving interpretation in the reviewed revision.
2. Use **Approve and schedule**. Close the browser, sign out, and exercise a safe application restart/redeployment before its due time if the owner permits.
3. Observe worker claim/attempt evidence and the actual remote result. Record planned/started/accepted/public timestamps and scheduling delay. A provider upload response alone does not pass.
4. In simulation, test cancel-before-send, revised-content invalidation, duplicate cron invocations and a job over 15 minutes late. Confirm no irreversible provider send. Do not simulate an outage with real approved public posts.
5. With live disabled, confirm previously live-mode pending items cannot send. Re-enabling must not bulk-publish stale work; review/reapprove instead.

## Manual finishing

Open **Finish an approved social post** in Worklist, then follow the protected Social link to download reviewed media, copy its exact platform caption and read the native-app instructions. The team-visible task and any calendar copy contain only generic text and the protected link. Record the completing user/time and post URL before marking **Manually confirmed**. Do not label it provider-verified. Do not promise a remote editable Instagram draft.

## Evidence record and stop condition

For every row record provider, actual destination ID/name, format/feature, implementation status, live-test status, API version/login route, date, evidence/post URL and limitation. Use the categories **Implemented, not live-tested**, **Verified on the connected account**, **Blocked by configuration/permission/review**, **Unsupported with documented evidence**, **Requires manual completion** and **Deferred from this pilot**.

Stop on wrong author/destination, duplicate/ambiguous publication, access-scope mismatch or unexpected public result. **Pause the tenant live control in Connections first**, then disable the environment live switch, retain identifiers/audit, and resolve uncertainty before another send. The current database control also blocks pending Workflow runs pinned to an older deployment's environment; changing a new deployment variable alone does not pause such a run. Do not delete remote content or send collaborator invitations without explicit authorization. When the session ends, pause live publication and preserve the final capability/evidence record.
