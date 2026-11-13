# Social Publishing pilot

This TST-only pilot evaluates preparing, reviewing and scheduling posts from Neat. Open **Social Publishing** at `/social`. Production activation and public test posts require a later explicit owner action. The first implementation retains the existing `0.10.0-dev` TST cycle and Production Supplies work.

The application separates tenant access, brand-group membership, provider authorization, editorial approval and destination delivery. Logging in to a provider or discovering a Page does **not** verify publishing. Simulated results never count as live evidence.

## Initial access and setup

1. Both additive social migrations are applied to verified shared TST following isolated rehearsal; see [schema receipts](releases/social-publishing-validation.md#shared-tst-schema-delivery). Future deployments must verify their exact checksums/foreign keys and existing-record preservation. Never point a local default `.env` at production.
2. Enable tenant entitlement `SOCIAL_PUBLISHING` for the existing Echo tenant `org_echo_spirits`. It is disabled by default and excluded from broad TST feature enablement. Do not enable another tenant or replace tenancy with brand groups.
3. Set `SOCIAL_PILOT_USER_IDS` to the comma-separated existing Neat user IDs of the intended testers, including administrators. An administrator role alone does not bypass enrollment. Support View is excluded.
4. In Connections, an enrolled tenant administrator uses **Create initial brand groups**. Repeating this action preserves the same three labels: Echo Spirits Distilling Co.; Echo Spirits on the Vine; The Bar at Echo Spirits. It creates no real social accounts and grants no contributor access.
5. Assign each contributor to the groups they may prepare. Contributors do not receive provider credentials or approval/publication authority.
6. Complete each provider application below, authorize as an administrator, inspect discovered identities and select only actual destinations. Assign each selected destination to its correct group. LinkedIn in this pilot is Echo Spirits Distilling Co.'s company Page; no personal-profile or invented per-venue Page is needed.

Connection states distinguish missing configuration, access/review pending, authorization needed, reconnection required, connected and connected/publishing unverified. Keep optional providers blocked independently rather than holding the whole pilot.

If consent returns access-review-required with no destinations, inspect the safe server events `social_oauth_grants` and `social_oauth_discovery`: each provider is independently `EMPTY`, `FOUND` or `FAILED`, with a count and a bounded error code on failure. A separate `social_oauth_callback_failed` event covers callback failures. Permission names are filtered to a fixed allowlist; successful permission consent alone does not prove Page tasks or access to selected assets. Logs exclude tokens, state, provider response bodies, account/user IDs, exception messages and URLs. No unmatched user token is retained when discovery finds no destination. Use [the discovery validation/source record](releases/social-publishing-discovery-validation.md) before changing scopes; additional permissions require a separate owner decision.

### Explicit Echo enrollment

There is no current administrator screen for changing `OrganizationFeature`. Use this tenant-scoped Prisma operator snippet after the two selected migrations are verified. Save it temporarily as ignored `tmp/social-pilot-enrollment.ts` in the tested checkout. It uses the same audited TST identity guard as the migration driver and reads only the explicit `.env.social.tst.local` file; it cannot target production.

```typescript
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { socialMigrationConfiguration } from '../scripts/social-publishing-migration';

async function main() {
  const target = socialMigrationConfiguration([
    '--env-file=.env.social.tst.local',
    '--expected-host=ep-noisy-dew-avchokwr-pooler.c-11.us-east-1.aws.neon.tech',
    '--expected-target=neon-neat-tst',
  ], readFileSync('.env.social.tst.local', 'utf8'));
  const db = new PrismaClient({ datasourceUrl: target.direct.toString() });
  try {
    const organizationId = 'org_echo_spirits';
    await db.organization.findFirstOrThrow({ where: {
      id: organizationId, active: true,
      accountStatus: { notIn: ['SUSPENDED', 'CANCELLED'] },
    } });
    console.table(await db.user.findMany({ where: {
      organizationId, isActive: true,
      role: { in: ['ADMIN', 'PLATFORM_ADMIN', 'USER'] },
    }, select: { id: true, name: true, role: true }, orderBy: { name: 'asc' } }));
    if (process.argv.includes('--enable-feature')) {
      await db.organizationFeature.upsert({
        where: { organizationId_featureKey: {
          organizationId, featureKey: 'SOCIAL_PUBLISHING',
        } },
        create: { organizationId, featureKey: 'SOCIAL_PUBLISHING', enabled: true },
        update: { enabled: true },
      });
    }
    console.log({ socialPublishingEnabled: Boolean(await db.organizationFeature.findFirst({
      where: { organizationId, featureKey: 'SOCIAL_PUBLISHING', enabled: true },
      select: { id: true },
    })) });
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error('Enrollment failed; verify the explicit TST identity.'); process.exitCode = 1; });
```

Run `npx tsx tmp/social-pilot-enrollment.ts` to inspect existing active staff IDs without changing enrollment. The owner selects the exact administrator and contributor IDs to test; **do not select Tasters or copy the whole roster**. Run with `--enable-feature` only when the owner is ready to enroll Echo; this upserts one feature for one tenant and creates no users, group memberships or provider connections.

In Vercel, open the existing **neat-tst** project → **Settings → Environment Variables**. Add `SOCIAL_PILOT_USER_IDS` with only those selected IDs, comma-separated. For canonical `https://neat-tst.vercel.app`, select that project's **Production deployment target**; Neat's own `APP_ENV` must remain `test`. Configure Preview separately only if intentionally testing it. Redeploy the approved TST commit to capture the variable. Do not modify the separate **ohlq-field-crm** production project. Then sign in as an enrolled administrator, create the initial group labels and assign contributors to individual groups. Feature enrollment, tester selection, group access and live publication remain separate steps. No enrollment was performed during code/schema delivery.

## Selected migration procedure

The two additive migrations are `20261112170000_social_publishing_pilot` and `20261112180000_social_workflow_dispatch`. The second adds only a persisted Workflow run ID. No existing data removal or backfill is required. Use the selected-migration driver so historical pending/drifted migrations are not replayed accidentally. It defaults to read-only and rejects production.

Prepare an ignored `.env.social.tst.local` using the verified TST database credential and these existing identity fields: `APP_ENV=test`, `DATABASE_ENVIRONMENT=test`, `DATABASE_TARGET_ID=neon-neat-tst`, `EXPECTED_DATABASE_HOST=ep-noisy-dew-avchokwr-pooler.c-11.us-east-1.aws.neon.tech`. The credential's actual host must match; an optional `DIRECT_URL` must match the same database/user/credential at its unpooled host. Never paste a secret into a committed file or a shell command.

Read-only preflight, from the exact tested checkout:

```powershell
npx tsx scripts/social-publishing-migration.ts --env-file=.env.social.tst.local --expected-host=ep-noisy-dew-avchokwr-pooler.c-11.us-east-1.aws.neon.tech --expected-target=neon-neat-tst
```

After isolated rehearsal and exact-change validation, append `--apply` and the following exact argument to apply only these migrations, then repeat the read-only command:

```text
--checksums=0c2d2112f280c563da8e9f00538959e91884758ba42a8bd34d81153e3dcbb160,6a250d31328b0876254477ccad876e072b80223633f6116ff8cf7ea0739bfee8
```

Checksums use LF-normalized SQL so Windows line endings do not change the reviewed identity. The driver validates the migration's own ledger entries, tenant/unique foreign keys, dispatch column, protected record counts and an unchanged fingerprint of unrelated migration history. It refuses partial/differing migration records and reconciles no drift. For a separately verified child branch, use the same driver with `--rehearsal`, target `social-rehearsal`, `development` identity fields and that child's explicitly verified host; known production, shared-TST and previous-QA hosts are rejected in rehearsal mode. Do not use generic `migrate deploy` to repair unrelated history.

## Environment and callback configuration

Use `.env.example` as the key inventory. Configure secrets only in the selected **TST Vercel project**, its intended deployment environment or an ignored local rehearsal env file. The inherited local `.vercel/project.json` can identify the production project: verify project identity before any CLI link/deploy/env operation. This feature is delivered through `echospirits/neat-tst` branch `tst`; no production push is authorized.

| Variable | Purpose / owner action |
|---|---|
| `APP_ENV`, `DATABASE_ENVIRONMENT`, `DATABASE_TARGET_ID`, `EXPECTED_DATABASE_HOST`, `DATABASE_URL` | Existing fail-closed environment/database identity. TST uses `APP_ENV=test`; verify `/api/health` identifies `neon-neat-tst` before tenant activation. |
| `APP_BASE_URL` | Existing application origin and Social fallback. Preserve its current value when Calendar or another integration depends on a legacy alias. |
| `SOCIAL_BASE_URL` | Optional Social-only signed-in origin for OAuth callbacks/return redirects and dispatch media URLs. Takes precedence over `APP_BASE_URL`, normalizes to an origin, and requires HTTPS except loopback in local development. Invalid nonempty configuration blocks the operation rather than falling back. |
| `SOCIAL_PILOT_USER_IDS` | Explicit tester User IDs, including administrators. Empty means no pilot users. |
| `SOCIAL_TOKEN_ENCRYPTION_KEY` | Optional dedicated Social token encryption secret, at least 32 characters after trimming. Nonblank invalid values fail closed. New Social ciphertext uses version `s1`; this key affects no Calendar token. Keep it stable. |
| `CALENDAR_TOKEN_ENCRYPTION_KEY` | Existing unchanged Calendar facility. Used for new Social writes only when the dedicated Social key is absent/blank, with the same trimmed 32-character minimum. Retained `v1` Social ciphertext always requires its original Calendar key, even after adding a Social override. Do not rotate or replace it to activate Social. |
| `SOCIAL_META_APP_ID`, `SOCIAL_META_APP_SECRET`, `SOCIAL_META_GRAPH_VERSION` | Neat-owned Meta application; pinned Graph version defaults to `v26.0`. |
| `SOCIAL_META_CONFIG_ID`, `SOCIAL_META_TOKEN_TYPE` | Optional Facebook Login for Business route. Set the numeric configuration ID and `USER` only after verifying that matching configuration's User access token selection and required permissions. Empty ID preserves legacy scope-based login. Unknown/system-user configurations are blocked before state/provider operations. |
| `SOCIAL_GOOGLE_CLIENT_ID`, `SOCIAL_GOOGLE_CLIENT_SECRET` | Dedicated Google web OAuth client for Business Profile; Gmail/Calendar consent is insufficient. |
| `SOCIAL_LINKEDIN_CLIENT_ID`, `SOCIAL_LINKEDIN_CLIENT_SECRET`, `SOCIAL_LINKEDIN_VERSION` | Neat-owned LinkedIn application with organization access. REST version defaults to `202609`; monitor supported-version retirement. |
| `SOCIAL_META_ACCESS_STATUS`, `SOCIAL_GOOGLE_ACCESS_STATUS`, `SOCIAL_LINKEDIN_ACCESS_STATUS` | Owner-declared application review/access state, default `PENDING`; this never substitutes for connected-account live evidence. Use the values accepted by the provider configuration helper. |
| `SOCIAL_BLOB_READ_WRITE_TOKEN` | Credential for a **private** Vercel Blob store used for social media; do not reuse a public visit-photo bucket. |
| `SOCIAL_MEDIA_SIGNING_SECRET` | Stable server-only random secret, at least 32 characters, for narrowly scoped dispatch media links. |
| `CRON_SECRET`, `SOCIAL_JOBS_ENABLED` | Existing bearer cron authentication and dedicated opt-in for durable social execution/recovery. Jobs default disabled. |
| `FILE_UPLOADS_ENABLED`, `BLOB_ENVIRONMENT` | Existing upload/environment guard must permit the intended environment before real private media uploads. |
| `SOCIAL_LIVE_PUBLISHING_ENABLED` | Defaults `false`; this alone cannot authorize or convert a delivery to live. |
| `SOCIAL_LIVE_ENVIRONMENT` | Must equal the running `APP_ENV`, and pilot live execution requires `test`. |
| `SOCIAL_LIVE_ORGANIZATION_ID` | Must be the exact existing Echo tenant ID. |
| `SOCIAL_LIVE_DESTINATION_IDS` | Explicit comma-separated Neat destination record IDs allowed for this live test. Handles/external IDs are insufficient. |
| `SOCIAL_LIVE_NOT_BEFORE` | Valid ISO UTC authorization-window timestamp; live approval must be at or after it. |

Derive callback URLs from the configured Social origin: nonblank `SOCIAL_BASE_URL`, otherwise `APP_BASE_URL`. Sign in at that same origin before starting consent so the original Neat administrator session is available on return. A Social override does not change application/Calendar settings, legacy aliases, cookies or OAuth state/session binding. For canonical TST, set `SOCIAL_BASE_URL=https://neat-tst.vercel.app` and register these exact URLs:

- Meta Facebook Login: `https://neat-tst.vercel.app/api/social/oauth/meta/callback`.
- Google: `https://neat-tst.vercel.app/api/social/oauth/google/callback`.
- LinkedIn: `https://neat-tst.vercel.app/api/social/oauth/linkedin/callback`.

For an independent Social key, generate a strong random secret through the approved secret-management channel and save it as sensitive `SOCIAL_TOKEN_ENCRYPTION_KEY` only in the intended TST project/environment, then deploy the tested source. Readiness exposes the selected variable name and a configured boolean, never the value. Missing/short Calendar configuration does not block new Social connections when a valid dedicated key is selected. An invalid nonblank dedicated key cannot silently fall back. Preserve Calendar's value exactly.

Ciphertext compatibility is versioned: dedicated `s1` records decrypt only with the stable Social key, while retained `v1` records continue through the unchanged Calendar helper and original Calendar key. Adding the override does not bulk-reencrypt existing records; reconnecting or refreshing credentials writes the selected new version. This release provides no key ring or automatic key rotation/migration. Changing/removing a key can make its stored tokens and in-flight OAuth states unreadable and require controlled reconnection. Plan any rotation separately; never rotate Calendar to repair Social setup. [Scoped validation](releases/social-publishing-crypto-validation.md).

For another explicitly configured deployment replace only `https://neat-tst.vercel.app` with the selected Social origin. Register the full path with each developer application and keep it byte-for-byte consistent with the server's redirect URI. Administrators start consent through `/api/social/oauth/meta/start`, `/api/social/oauth/google/start` or `/api/social/oauth/linkedin/start`; Meta discovery returns Facebook and Instagram destinations independently. See the [Social-only origin validation record](releases/social-publishing-origin-validation.md) for the scoped compatibility change.

Read-only inspection of the verified TST Vercel project's variable metadata found **no `SOCIAL_*` variables configured** on November 12, 2026. Existing `CRON_SECRET` and `CALENDAR_TOKEN_ENCRYPTION_KEY` are present; only key/type/target metadata was inspected. Existing Google Calendar/client and ordinary Blob configuration elsewhere in local worktrees is not Business Profile approval or evidence of social authorization. No social discovery or publication is claimed from those credentials.

## Provider owner actions

The [provider implementation and source record](social-publishing-providers.md) is the detailed authority for current endpoints, supported formats and limitations. The following checklist keeps external setup concrete.

### Public policy and deletion-instructions prerequisites

The repository currently has no public `/privacy` page or Meta data-deletion endpoint. The authenticated `/social/setup` page is an operator guide and cannot serve as a public application privacy policy. Before submitting an application for review, the owner must choose the actual retention/deletion policy and contact, approve the policy text, and publish it at an unauthenticated HTTPS URL on a domain they control. Register that exact public URL in each developer application. Meta also needs an owner-approved public data-deletion instructions URL or a correctly implemented callback matching its configured choice; neither is created by this pilot.

Use these **implemented data-handling facts** to prepare review material, without inventing legal or retention promises:

- Social destinations, drafts, immutable revisions, media metadata, approvals and audit/results are scoped to the Neat tenant; group access and explicit tester enrollment further restrict staff access.
- OAuth tokens are stored encrypted server-side, separately from user-visible destination metadata. The app records authorization owner, granted scopes, health and expiration information where returned.
- Draft media is stored privately. Dispatch creates a signed URL for the specific immutable file where a provider needs URL access; publication can make the approved content visible on the selected external destination.
- Login/account discovery does not publish. A specific administrator-approved revision and all live controls are required before automatic public publication.
- Manual finishing creates a generic Worklist task assigned to the approving administrator, containing only a link to the protected Social post. Worklist's team-visible views and calendar exports receive no post title, brand/destination name, caption, reviewer note, finishing instructions or media details; the authorized Social route retains that content.
- Disconnect blocks further queued sends but retains records and encrypted credential evidence. The pilot does not implement an automated retention/deletion-request system or promise remote deletion of already-published posts.

The owner still needs to decide and document retention durations, the actual deletion-request process/contact and any credential/media cleanup policy, then publish approved public text before platform review. Those decisions are not inferred from the current storage implementation or supplied as legal commitments.

### Meta: Facebook Pages and Instagram professional accounts

Use Neat's Meta developer application and the **Facebook Login** route. This supports discovery of Pages and their linked Instagram professional accounts without treating an Instagram send as a Facebook send. Confirm each real Page's linked account and account type before selecting it.

When the actual app uses Facebook Login for Business, the optional configuration route supports only an operator-verified **User access token** configuration. Configure its actual required permissions in Meta, then set `SOCIAL_META_CONFIG_ID` and `SOCIAL_META_TOKEN_TYPE=USER`. Neat sends `config_id` instead of `scope`; the random one-use OAuth state and current user-token exchange remain unchanged. An ID or `bearer` response alone does not establish token type. Do not substitute a Unified Login/system-user template or broader permission set. See the [route evidence and validation](releases/social-publishing-meta-user-config-validation.md); actual configuration creation, grants and discovery remain separate owner evidence.

In Meta App Dashboard, configure Facebook Login's valid OAuth redirect URI, app domains, privacy-policy/data-deletion URLs and required application settings. Request `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic` and `instagram_content_publish` as applicable to the selected destinations. Inspect the granted permissions and Page tasks after consent. An app in Development mode is limited by its app-role/tester and business/account access; request the required Advanced Access, business verification and App Review for the intended operating population. Do not assume app roles, a successful login or a token debugger grants permanent publishing access.

Authorize with a human who has the necessary Page/business role. Discover the actual Page IDs, display names and linked Instagram account IDs, then select and map them. A successful result is a visible destination with the expected external identity and health; publication remains **unverified** until an exact authorized post is inspected. Inspect native Instagram/Facebook cross-post settings before the first live post to avoid duplicate posts.

Native music/catalog availability, user/location tagging, collaborator invitations and Story interactions are separate capability checks. Unsupported extras use the manual finishing route. An Instagram audio result does not prove Facebook audio transfer. Never infer support from SDK parameter names.

### Google Business Profile

In the intended Google Cloud project, request Business Profile API access separately from OAuth consent. Use a real verified Business Profile and an eligible business/owner account; do not create fake listings. The API prerequisites and application access review remain required even if Calendar or Gmail already works. Enable the approved Business Profile Account Management, Business Information and Google My Business/Local Posts APIs used by discovery/publication.

Create a web OAuth client with the exact social callback. Configure OAuth consent-screen branding, authorized domain/privacy-policy links and intended test users or verification as required. Request `https://www.googleapis.com/auth/business.manage` and offline consent for a refresh token. Authorize as an owner/manager with the actual location access. Discovery must return the expected account and location names; a zero quota/access error is an API approval/configuration issue, not a reason to fabricate a location ID.

Start with a photo update, then an event with explicit start/end details and a suitable button/link. The Local Posts API's media surface is narrower than the native product; use the implementation's validated image format and do not assume native video support. Google restricts posts promoting regulated products, including alcohol. Prepare separate venue-focused copy and a suitable venue/event link, then review that exact Google revision. Neat does not silently copy an alcohol promotion or rewrite approved content. [Google's post guidance](https://support.google.com/business/answer/7342169), [Business Profile prerequisites](https://developers.google.com/my-business/content/prereqs).

### LinkedIn company Page

Create/select Neat's LinkedIn developer application associated with the actual Echo Spirits Distilling Co. company Page and complete Page verification by an authorized Page administrator. Add the exact OAuth callback, application identity/logo, privacy-policy URL and required legal/domain information. Request the **Community Management API** product and appropriate **Development** access, then apply separately for **Standard** access for ongoing production use. A development test is not permanent production approval.

The implemented organization scopes are `rw_organization_admin`, `w_organization_social` and `r_organization_social` where granted by the product/access tier. The author must be the selected `urn:li:organization:...` destination; `w_member_social` or posting to the consenting member's profile does not satisfy this pilot. A human Page administrator completes OAuth and organization discovery, then confirms the actual Page mapping.

Prepare a review demonstration covering OAuth consent, real organization selection, text/image/multi-image/video posts, approval, scheduled execution, results and disconnect/revocation; record privacy-policy/data handling and the required product use-case explanation. Follow the portal's current evidence instructions, including demonstration recording/test access if requested. Confirm the application's current tier and granted products rather than marking Standard approved after a Development success. [Community Management review](https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review), [access tiers](https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access).

## Approval, scheduling and recovery

Contributors prepare and submit content only for assigned groups. Administrators may return it for edits, cancel, or use the explicit **Approve and schedule** / **Approve and publish now** actions, including on their own post. The reviewed revision freezes caption/platform copy, links/event details, immutable media IDs/order, exact external destination IDs, format/options and publication time. A proposed time is not permission. A passed time requires a new future time or explicit publish-now approval.

Editing creates a new revision and invalidates pending approval. Delivered destinations retain their original evidence and are never resent by editing or retrying the remainder. Group remapping never redirects an approved destination. Every worker/send reloads current tenant/group/user/connection/approval/revision/cancellation state. Disconnecting a destination blocks queued sends. Canceling an already started send reports the in-progress uncertainty rather than promising remote deletion.

Execution uses persisted database delivery records and database claims. The existing Vercel Workflow runtime durably sleeps until each approved delivery is due, then invokes the same guarded worker. Browser timers and provider-native scheduling are not authoritative. Times are stored as UTC and displayed in `America/New_York`; the local-time picker rejects ambiguous/nonexistent daylight-saving wall times and asks for another time rather than silently choosing an offset.

Approval/retry/reconciliation dispatch awaits registration of a durable Workflow run; the delivery queue remains authoritative and its database claim prevents the Workflow and recovery path from double-sending. The daily recovery cron calls `/api/cron/social-publishing` at **14:19 UTC**, using `Authorization: Bearer <CRON_SECRET>`, to recover missing runs and flag stale work. `SOCIAL_JOBS_ENABLED=true` opts into execution independently of the existing global cron flag. The current Vercel team is on **Hobby**, so this implementation uses existing Workflow for due-time execution and a daily native recovery schedule. Minute cron was rejected as incompatible without purchasing a different plan; no plan change was made. Native cron executes only against the **TST project's** Production deployment target, even though Neat's application identity is `APP_ENV=test`. Do not interpret daily recovery as a promise to publish a missed post a day late. [Vercel limits](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing), [cron operations](https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs).

Pending jobs more than **15 minutes late** go to **Needs attention** for an administrator to review/reapprove; they are not bulk-published after an outage or live re-enablement. Transient safe failures retry at most four attempts with bounded backoff (starting at 60 seconds; rate-limit delays are bounded). Expired permissions/invalid content need intervention. Persisted external identifiers support processing checks. An ambiguous provider write is reconciled when possible, otherwise held for review; no universal exactly-once guarantee is made.

Live mode is fixed at approval. All live controls in the environment table must pass, plus the **current tenant live control in Connections** and an exact current administrator approval for an allowlisted destination. The tenant control persists in `Organization.crmPreferences.socialPublishing` as `liveEnabled` and `liveNotBefore`; it defaults paused. Its activation timestamp also requires a new approval after activation. Workers reload this database control immediately before an irreversible send, including Workflow runs pinned to older deployment code/environment values. Pause the tenant control to stop those pending live sends; changing only a new deployment's environment variable is insufficient for an already pinned run. Turning on live cannot turn a simulated delivery into a live delivery. Reapprove the exact real content deliberately. Keep simulated evidence and manually recorded completion separate from provider-confirmed publication.

## Media and manual finishing

Media versions are private and immutable. Dispatch creates scoped, expiring media access close to upload, so a draft's old download link is not reused weeks later. Validate file type, bytes/dimensions/duration and destination-specific constraints before approval and dispatch; prepare unsupported files outside Neat. Provider processing/result status remains separate from accepted upload.

Instagram, Google and other URL-fetch paths must be able to fetch the signed application media route without a Neat login or an interactive deployment-protection screen. During authorized media acceptance, test the exact dispatch URL from a signed-out request: a valid unexpired signature returns only that immutable file; an absent/invalid signature remains protected. If deployment protection intercepts the route, resolve the hosting/access configuration for the signed endpoint before a live post. Never put a deployment-wide protection bypass credential in provider URLs or make the whole Blob store public.

For native-only finishing, open the generic **Finish an approved social post** Worklist task and follow its link to the authorized Social record. Download the reviewed media, copy the caption, follow the format-specific instructions there and publish in the native app. Private post content is not copied into team-visible Worklist text or calendar exports. Record completion explicitly, preferably with the post URL. This is **manually confirmed**, not API-verified, and does not create an editable Instagram native draft automatically. Return-for-edits, cancellation and a revised post cancel an obsolete pending task; explicit completion closes the task.

## Rollout and handoff

1. Finish isolated automated/database/mobile/desktop checks and record actual evidence in [validation](releases/social-publishing-validation.md).
2. Deliver the exact tested application to TST with feature and live controls disabled; production remains unchanged.
3. Complete developer-app/API-review/redirect/private-storage setup. Read-only discovery may then verify identity/access without publication.
4. Enroll the intended Echo administrators/testers, create labels, map actual destinations and grant only needed contributor groups.
5. Run the [explicitly authorized live-test checklist](social-publishing-live-tests.md), starting with one genuine photo post per relevant provider. Do not fill every account with placeholders.
6. **Pause the tenant live control in Connections first** to block pending live sends, including older pinned Workflow runs. Disable the environment switches or tenant entitlement as appropriate while retaining evidence. Review any already-started attempts and remote items. Never delete retained records as rollback.

Full calendar/drag-and-drop, analytics, inbox/comments, advertising, AI copywriting and an embedded media editor remain outside this pilot. Public publication, collaborator invitations, remote deletions and production activation have not been authorized by this implementation request.
