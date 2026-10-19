# Communications access fix — 2026-10-12

## Scope

TST-only continuation from `602acbb001bb5dc403e3814858fa8008142843d8`. Communications moves into the existing desktop My Work navigation group and remains in mobile More. The shared CRM authorization guard permits own-tenant mailbox access for platform admins while explicitly rejecting Support View, including same-tenant Support View. The page and account suggestions use the same result. Suggestion membership checks still require an active user assigned to the requested tenant; platform privileges do not bypass ownership, membership or feature checks.

No schema, membership, provider configuration, live mailbox activation or production change. Existing SMS administration permissions are unchanged.

## Regression checks

- Full suite: 856 tests / 76 suites, zero failures, skips or cancellations.
- Authorization tests exercise the actual `requireCrmActor` implementation with authenticated USER, ADMIN and PLATFORM_ADMIN actors, own/mismatched/missing membership, same/foreign tenant Support View, and the shared CORE_CRM entitlement check.
- Navigation tests confirm desktop and mobile availability with CORE_CRM and absence without the entitlement.
- Standalone typecheck and optimized build pass. The crash occurred after those checks, before commit/push; the typecheck was repeated successfully after making the browser fixture cleanup resilient to interruption. Application source was unchanged by that recovery.
- Browser acceptance passes at 390×844 and 1440×900 using `scripts/communications-access-browser.ts` against the pre-existing isolated Neon rehearsal branch, with a synthetic platform member and private synthetic message. It verifies desktop My Work and mobile More navigation, owner-only evidence, cross-tenant service denial, reviewed contact save and refresh persistence, OAuth entry authorization without provider activation, same/other-tenant Support View denial, exit recovery, and no client errors or page overflow. Screenshots were visually inspected. It does not create sessions or change roles in shared TST.
- The script revokes only its own synthetic interrupted-run sessions before retrying; its final session is removed and fixture user deactivated. The local acceptance server is stopped after validation.
- `git diff --check` passes. React review preserves existing navigation, server-derived authorization, early privacy guards and Suspense; no additional client fetch or interface workflow was introduced.

Release target is `staging/tst`; the final chat delivery receipt records the exact deployed commit, Vercel READY state and health identity. Production baseline remains `af1f396726e3b15e1167f5af2aa6ba426cae9bf9`.
