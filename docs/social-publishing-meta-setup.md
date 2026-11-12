# Facebook + Instagram: owner setup checklist

Prepared November 12, 2026. This is setup guidance, not evidence that an app, permission, account or publication has been verified. **Keep automatic live publishing off**, including the current tenant control, throughout connection/discovery setup.

## Values for the existing TST integration

| Setting | Value / source |
| --- | --- |
| OAuth callback / Valid OAuth Redirect URI | `https://neat-tst.vercel.app/api/social/oauth/meta/callback` (exact path, no extra slash) |
| Website origin | `https://neat-tst.vercel.app` |
| Social-only server origin | `SOCIAL_BASE_URL=https://neat-tst.vercel.app`; preserve the shared `APP_BASE_URL` |
| App domain, where requested | `neat-tst.vercel.app` |
| Server app ID / app secret | Meta app → App settings → Basic; configure as `SOCIAL_META_APP_ID` / `SOCIAL_META_APP_SECRET` in TST server configuration |
| Graph version | `SOCIAL_META_GRAPH_VERSION=v26.0` |
| Publishing/discovery permissions requested by Neat | `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish` |
| Neat setup view | `/social?view=connections` |

The Facebook route uses the **Meta app** ID/secret. Do not substitute credentials for a different Instagram-login product, a Page ID, an Instagram user ID or an access token. Enter the app secret directly through the approved server secret configuration; it is not needed in chat.

## Owner sequence

1. Open [Meta's app dashboard](https://developers.facebook.com/apps/) using the real person who administers Echo's accounts. Reuse the intended Neat developer app if one exists; otherwise establish its correct business ownership before creation. Meta's [official Instagram collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-3fe78620-2258-44b6-893f-42d76c7200d7) recommends a Business app for this Page-linked route.
2. The owner-visible app-creation wizard currently offers **Content management → Manage messaging & content on Instagram** and **Manage everything on your Page**. Both were selected in the draft named **Neat Social Publishing (TST)**, with the owner's contact email entered and the verified **Echo Spirits Distilling Co.** portfolio selected. The requirements step displayed no initial requirements. **Final app creation is pending owner confirmation of Meta's displayed terms.** After creation, inspect the actual Instagram and Facebook Login setup against the **Facebook Login / Page-linked** path implemented by Neat, and check that it exposes all five permissions above. Selecting these use cases is not evidence that permissions were granted or that login is compatible.
3. Under the login product's settings, save the exact callback above in **Valid OAuth Redirect URIs**. Configure the HTTPS website/domain fields that the actual dashboard requires. Use its redirect validator and read back the saved value.
4. In **App roles**, ensure the authorizing person has an accepted app Administrator/Developer/Tester role. Separately verify their actual access to each intended Facebook Page and linked Instagram professional account, including content-creation access. App roles, Page access and Neat roles are separate grants. Do not add unrelated staff or send invitations as part of unattended setup.
5. Inspect each required permission's dashboard access/testing status. The intended first check is restricted to app-role users and actual owned/managed assets. Do not assume internal ownership alone bypasses all permission prerequisites. If a permission requires review even for the configured test arrangement, retain the exact dashboard block as the owner action.
6. Confirm each actual Instagram account is professional and linked to the intended Page. [Meta's official collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-b628c95f-9319-432e-a58c-c99e96a05670) discovers that relationship through `/me/accounts`, including Page tokens/tasks and `instagram_business_account`. Do not infer the relationship from matching names or personal Accounts Center sharing. Do not create placeholder accounts.
7. Configure the real **public privacy-policy** URL and **User data deletion** instructions/callback selected in the app dashboard. This repository presently has no maintained public privacy/deletion route. An existing business-hosted policy can be used only if it accurately covers Neat's Meta data and provides the real request process. Verify public accessibility. The OAuth callback is **not** a deletion callback; do not register a nonexistent automatic deletion endpoint. The [official deletion-callback reference](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/) must be followed if that option is implemented.
8. Set TST app credentials securely, verify the deployment has received them, then open Neat Connections as the enrolled administrator. The account owner completes Meta's actual consent screen. This authorizes connection/discovery; it does not approve any public post.
9. Verify discovered Page and Instagram IDs, names, handles, authorization owner and granted scopes. Assign each actual destination to its correct brand group. Facebook and Instagram remain separate destinations. Leave discovered accounts unassigned if their identity is uncertain.
10. Keep every destination's publishing evidence **unverified** until a later exact-content administrator-authorized test. Before a future dual-platform test, inspect native cross-post settings to prevent duplicates. Plain API Story eligibility needs a real Business-account check recorded in Neat; this is distinct from verifying Story publication.

## Internal testing versus broader approval

Keep the first authorization restricted to legitimate app-role users and owned/managed accounts. Record the permissions actually granted and the dashboard's access level; a successful development login does not establish general access.

Before people without an app role or external businesses connect, inspect the [current access-level/release requirements](https://developers.facebook.com/docs/development/release/) and request the appropriate **Advanced Access/App Review per permission**, plus business verification and other dashboard requirements where shown. Prepare public policy/deletion information, reviewer access and an end-to-end permission-use demonstration. Public demonstration posts require separate explicit authorization. Do not describe an app-role test as completed broader review.

## Route compatibility gate

The implemented Neat flow presently uses a Facebook OAuth `scope` list, a user-code exchange, long-lived user-token exchange and Page-based discovery. If the actual developer dashboard only offers **Unified Login** or a **Facebook Login for Business configuration ID** route, stop before consent and record its token/configuration requirements. A configuration-driven/system-user flow can need different authorization parameters, token handling and discovery; adding only App ID/Secret does not establish compatibility. Do not switch products or make a second app blindly to work around this.

Current Meta developer pages for app creation, roles, access levels, login and deletion returned access/rate-limit failures to the research tool. The wizard labels above come from the current owner-visible dashboard; universal internal-access exemptions could not be independently confirmed from the developer pages. The actual dashboard must resolve permission and eligibility requirements. The official Meta Postman and [maintained Meta sample](https://github.com/fbsamples/reels_publishing_apis/tree/main/insta_reels_publishing_api_sample) support the Page-linked professional-account route; their examples are not proof of this app's actual grants.
