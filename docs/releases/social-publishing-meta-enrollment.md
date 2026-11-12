# TST Facebook and Instagram setup

November 12, 2026. Owner explicitly requested pilot enrollment for their existing TST account, Facebook/Instagram setup and live publishing kept off. This follow-up preserves `0.10.0-dev`, unrelated TST work and production/main.

## Applied enrollment and configuration

- Verified the exact shared TST database identity (`test`, `neon-neat-tst`) through the existing guarded configuration before writing.
- Enabled only Echo's `SOCIAL_PUBLISHING` entitlement. Enrolled existing active administrator Joe Bidinger (`joe@echospirits.com`, user `c6db2100fe5a7517b73f56712`) through the exact server tester allowlist. No users, roles or staff memberships were added.
- Created only the three idempotent brand labels: Echo Spirits Distilling Co.; Echo Spirits on the Vine; The Bar at Echo Spirits. Independent readback found three groups, zero memberships, credentials, destinations, posts and deliveries, and the tenant live control false. Other feature rows and user count were checked unchanged during enrollment.
- Configured the explicit `neat-tst` Vercel project `prj_fNOruLSh6BQNVXAThXYJEjBw2HYA` under `team_iONC2HcvO7u5Nt0k3haV3gLS`. This project's Vercel **production deployment target** is the TST application; it is not Neat's separate production project.
- Read back nonsecret gate values: `SOCIAL_LIVE_PUBLISHING_ENABLED=false`, empty `SOCIAL_LIVE_DESTINATION_IDS` and `SOCIAL_LIVE_NOT_BEFORE`, `SOCIAL_LIVE_ENVIRONMENT=test`, `SOCIAL_JOBS_ENABLED=true`, the exact single-user allowlist above, `SOCIAL_BASE_URL=https://neat-tst.vercel.app`, `SOCIAL_META_GRAPH_VERSION=v26.0` and `SOCIAL_META_ACCESS_STATUS=PENDING`. The existing `APP_BASE_URL` was read back unchanged. Jobs enable simulations; they do not authorize live delivery.
- Created a random private-media signing secret as a sensitive server variable without displaying it. Existing token-encryption and upload settings were preserved.
- Created the separate private Blob store `neat-tst-social` (`store_rjmeZOuKlsuM2KAU`, `iad1`, available), verified its team owner, and connected it only to the explicit TST project/target with custom prefix `SOCIAL_BLOB`. Readback confirmed `SOCIAL_BLOB_READ_WRITE_TOKEN` exists for that target; the existing `BLOB_READ_WRITE_TOKEN` remains separately configured. Actual media upload acceptance is still a separate check.

Hosted environment changes require a new deployment before the signed-in UI receives them. Source correction validation: [Social-only origin record](social-publishing-origin-validation.md). Store credentials, app secrets, login sessions and OAuth codes are not recorded in this document.

## Meta owner handoff

The current signed-in Meta console showed two existing Events apps, which were left unchanged. A separate app draft was prepared with name **Neat Social Publishing (TST)**, contact `joe@echospirits.com`, content-management use cases **Manage messaging & content on Instagram** and **Manage everything on your Page**, and the verified **Echo Spirits Distilling Co.** business portfolio. The requirements step displayed no initial requirements, which does not prove permission approval or later release eligibility.

Final creation accepts the displayed Meta Platform Terms and Developer Policies and is pending owner confirmation. No Meta app, permission grant, consent, invitation, external account connection or public post is claimed by this record. After creation, inspect the actual login product and supported route, configure the exact callback, and enter App ID/Secret securely in TST. Follow the [owner setup checklist](../social-publishing-meta-setup.md) for permissions, asset identity, public policy/deletion information and any review requirements. Keep live controls off throughout discovery.
