import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import {
  logActivity,
  correctActivity,
  readTimeline,
} from "../lib/crm/activity";
import {
  ingestMailChanges,
  disconnectMailbox,
  syncMailbox,
} from "../lib/crm/mail/sync";
import { initializeDealStages, createDeal, moveDeal } from "../lib/crm/deals";
import { getAccountBriefing } from "../lib/crm/briefing";
import { MockMailAdapter } from "../lib/crm/mail/mock";
import { beginMailboxOAuth, finishMailboxOAuth } from "../lib/crm/mail/oauth";
if (
  process.env.CRM_REHEARSAL !== "true" ||
  process.env.DATABASE_TARGET_ID !== "crm-isolated-rehearsal" ||
  process.env.APP_ENV !== "development"
)
  throw Error("Isolated rehearsal environment required.");
const db = new PrismaClient();
async function main() {
  const run = randomUUID().slice(0, 8),
    orgA = `crm_qa_a_${run}`,
    orgB = `crm_qa_b_${run}`,
    userA = `crm_qa_rep_${run}`,
    userB = `crm_qa_other_${run}`,
    colleague = `crm_qa_colleague_${run}`;
  for (const [id, slug] of [
    [orgA, `qa-a-${run}`],
    [orgB, `qa-b-${run}`],
  ])
    await db.organization.create({
      data: {
        id,
        slug,
        name: "CRM isolated acceptance fixture",
        displayName: "CRM acceptance",
        active: true,
      },
    });
  for (const [id, organizationId, role] of [
    [userA, orgA, "ADMIN"],
    [userB, orgB, "USER"],
    [colleague, orgA, "USER"],
  ] as const)
    await db.user.create({
      data: {
        id,
        organizationId,
        email: `${id}@example.invalid`,
        role,
        isActive: true,
        name: id === userA ? "QA Representative" : "Other fixture user",
      },
    });
  await db.organizationFeature.createMany({
    data: [
      "CORE_CRM",
      "VISITS",
      "WORKLIST",
      "AGENCIES",
      "WHOLESALE_ACCOUNTS",
      "ACCOUNT_SALES_STATUS",
    ].flatMap((featureKey) =>
      [orgA, orgB].map((organizationId) => ({
        organizationId,
        featureKey,
        enabled: true,
      })),
    ),
  });
  const agency = await db.agency.findFirst({
    select: { id: true, name: true },
  });
  assert.ok(agency, "Rehearsal copy must contain a shared reference account");
  const account = { accountType: "AGENCY" as const, accountId: agency.id },
    actor = { organizationId: orgA, userId: userA },
    other = { organizationId: orgB, userId: userB },
    peer = { organizationId: orgA, userId: colleague };
  const aContact = await db.locationContact.create({
    data: {
      organizationId: orgA,
      agencyId: agency.id,
      name: "Fixture Buyer",
      email: "buyer@example.invalid",
    },
  });
  const bContact = await db.locationContact.create({
    data: {
      organizationId: orgB,
      agencyId: agency.id,
      name: "Other Tenant Buyer",
      email: "buyer@example.invalid",
    },
  });
  const manual = {
    ...account,
    activityType: "PHONE_CALL",
    summary: "Confirmed a sample presentation",
    occurredAt: new Date(),
    contactId: aContact.id,
    submissionKey: randomUUID(),
    visibility: "PRIVATE",
    meaningful: true,
  };
  const first = await db.$transaction((tx) => logActivity(tx, actor, manual));
  const replay = await db.$transaction((tx) => logActivity(tx, actor, manual));
  assert.equal(first.id, replay.id);
  await assert.rejects(() =>
    db.$transaction((tx) =>
      logActivity(tx, actor, {
        ...manual,
        contactId: bContact.id,
        submissionKey: randomUUID(),
      }),
    ),
  );
  assert.equal(
    (await readTimeline(db, peer, account)).entries.length,
    0,
    "same-tenant peer must not see private activity",
  );
  assert.equal(
    (await readTimeline(db, other, account)).entries.length,
    0,
    "other tenant must not see activity",
  );
  assert.equal((await readTimeline(db, actor, account)).entries.length, 1);
  await assert.rejects(() =>
    db.$transaction((tx) =>
      correctActivity(tx, peer, {
        ...account,
        id: first.id,
        visibility: "TEAM",
      }),
    ),
  );
  await db.$transaction((tx) =>
    correctActivity(tx, actor, {
      ...account,
      id: first.id,
      visibility: "TEAM",
      contactId: aContact.id,
    }),
  );
  assert.equal((await readTimeline(db, peer, account)).entries.length, 1);
  assert.equal(
    await db.activityAudit.count({
      where: { organizationId: orgA, activityId: first.id },
    }),
    1,
  );
  const connection = await db.mailboxConnection.create({
    data: {
      ...actor,
      provider: "MOCK",
      providerAccountId: "fixture",
      email: `${userA}@example.invalid`,
      scope: "fixture",
    },
  });
  const message = {
    id: "one",
    kind: "EMAIL" as const,
    threadId: "thread",
    subject: "Private fixture correspondence",
    participants: ["buyer@example.invalid"],
    at: new Date().toISOString(),
  };
  await db.$transaction((tx) =>
    ingestMailChanges(tx, actor, connection, [message, message]),
  );
  assert.equal(
    await db.accountActivity.count({ where: { connectionId: connection.id } }),
    1,
  );
  const imported = await db.accountActivity.findFirstOrThrow({
    where: { connectionId: connection.id },
  });
  assert.equal(imported.contactId, aContact.id);
  assert.equal(imported.visibility, "PRIVATE");
  assert.equal((await readTimeline(db, peer, account)).entries.length, 1);
  await db.$transaction((tx) =>
    correctActivity(tx, actor, {
      ...account,
      id: imported.id,
      visibility: "TEAM",
    }),
  );
  await db.$transaction((tx) =>
    ingestMailChanges(tx, actor, connection, [message]),
  );
  assert.equal(
    (await db.accountActivity.findUniqueOrThrow({ where: { id: imported.id } }))
      .matchStatus,
    "CORRECTED",
  );
  await db.$transaction((tx) => initializeDealStages(tx, actor));
  await db.$transaction((tx) => initializeDealStages(tx, other));
  const stages = await db.dealStage.findMany({
      where: { organizationId: orgA },
      orderBy: { position: "asc" },
    }),
    foreignStage = await db.dealStage.findFirstOrThrow({
      where: { organizationId: orgB },
    });
  await assert.rejects(() =>
    db.$transaction((tx) =>
      createDeal(tx, actor, {
        ...account,
        title: "Foreign stage",
        stageId: foreignStage.id,
        submissionKey: randomUUID(),
      }),
    ),
  );
  const deal = await db.$transaction((tx) =>
    createDeal(tx, actor, {
      ...account,
      title: "Fixture menu placement",
      stageId: stages[0].id,
      revenueCents: 125000,
      submissionKey: randomUUID(),
      nextAction: "Arrange a sample presentation",
    }),
  );
  await assert.rejects(() =>
    db.$transaction((tx) =>
      moveDeal(tx, other, {
        id: deal.id,
        version: 1,
        stageId: foreignStage.id,
        status: "OPEN",
      }),
    ),
  );
  await db.$transaction((tx) =>
    moveDeal(tx, actor, {
      id: deal.id,
      version: 1,
      stageId: stages[1].id,
      status: "OPEN",
    }),
  );
  await assert.rejects(() =>
    db.$transaction((tx) =>
      moveDeal(tx, actor, {
        id: deal.id,
        version: 1,
        stageId: stages[2].id,
        status: "OPEN",
      }),
    ),
  );
  assert.equal(await db.dealEvent.count({ where: { dealId: deal.id } }), 2);
  const briefing = await getAccountBriefing(db, actor, account);
  assert.equal(
    briefing.lastVisit,
    null,
    "phone and email must not become physical visits",
  );
  assert.ok(briefing.lastContact);
  await assert.rejects(() =>
    syncMailbox(other, connection.id, new MockMailAdapter([message])),
  );
  await syncMailbox(actor, connection.id, new MockMailAdapter([message]));
  const synced = await db.mailboxConnection.findUniqueOrThrow({
    where: { id: connection.id },
  });
  assert.ok(synced.lastSyncAt);
  assert.equal(synced.leaseId, null);
  await disconnectMailbox(actor, connection.id, false);
  const disconnected = await db.mailboxConnection.findUniqueOrThrow({
    where: { id: connection.id },
  });
  assert.equal(disconnected.enabled, false);
  assert.equal(disconnected.accessTokenEncrypted, null);
  // Exercise the actual OAuth state/PKCE/token persistence lifecycle with a fixture transport.
  // No live credentials or provider requests are used.
  const originalFetch = globalThis.fetch;
  const priorEnv = { ...process.env };
  try {
    process.env.CRM_MAIL_ENABLED = "true";
    process.env.CRM_GOOGLE_CLIENT_ID = "fixture-client";
    process.env.CRM_GOOGLE_CLIENT_SECRET = "fixture-secret";
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY ||=
      randomBytes(32).toString("hex");
    process.env.APP_BASE_URL = "http://localhost:3102";
    process.env.OAUTH_ENVIRONMENT = "development";
    let hold: (() => void) | undefined;
    let started: (() => void) | undefined;
    let paused = false;
    const tokenResponse = () =>
      Response.json({
        access_token: "fixture-access",
        refresh_token: "fixture-refresh",
        expires_in: 3600,
        scope:
          "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events.readonly",
      });
    globalThis.fetch = async (input) => {
      if (String(input).includes("oauth2.googleapis.com/token")) {
        if (paused) {
          started?.();
          await new Promise<void>((resolve) => {
            hold = resolve;
          });
        }
        return tokenResponse();
      }
      assert.equal(
        String(input),
        "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      );
      return Response.json({ emailAddress: "fixture-mailbox@example.invalid" });
    };
    const authorization = new URL(await beginMailboxOAuth(actor, "GOOGLE"));
    assert.ok(authorization.searchParams.get("code_challenge"));
    const state = authorization.searchParams.get("state")!;
    await assert.rejects(() =>
      finishMailboxOAuth(other, "GOOGLE", state, "fixture-code"),
    );
    await finishMailboxOAuth(actor, "GOOGLE", state, "fixture-code");
    await assert.rejects(() =>
      finishMailboxOAuth(actor, "GOOGLE", state, "fixture-code"),
    );
    const oauthConnection = await db.mailboxConnection.findUniqueOrThrow({
      where: {
        organizationId_userId_provider: { ...actor, provider: "GOOGLE" },
      },
    });
    assert.ok(oauthConnection.accessTokenEncrypted);
    assert.notEqual(oauthConnection.accessTokenEncrypted, "fixture-access");
    const pendingState = new URL(
      await beginMailboxOAuth(actor, "GOOGLE"),
    ).searchParams.get("state")!;
    paused = true;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = finishMailboxOAuth(
      actor,
      "GOOGLE",
      pendingState,
      "fixture-code",
    ).then(
      () => false,
      () => true,
    );
    await entered;
    await disconnectMailbox(actor, oauthConnection.id, false);
    hold!();
    assert.equal(
      await pending,
      true,
      "disconnect must cancel an in-flight OAuth callback",
    );
    const cancelled = await db.mailboxConnection.findUniqueOrThrow({
      where: { id: oauthConnection.id },
    });
    assert.equal(cancelled.enabled, false);
    assert.equal(cancelled.refreshTokenEncrypted, null);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env))
      if (!(key in priorEnv)) delete process.env[key];
    Object.assign(process.env, priorEnv);
  }
  // Browser acceptance uses only these synthetic users and their newly-created rows in this isolated branch.
  const token = randomBytes(32).toString("base64url");
  await db.userSession.create({
    data: {
      userId: userA,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  mkdirSync("output", { recursive: true });
  writeFileSync(
    "output/crm-rehearsal.json",
    JSON.stringify({
      orgA,
      orgB,
      userA,
      userB,
      colleague,
      account,
      accountName: agency.name,
      dealId: deal.id,
      sessionToken: token,
    }),
  );
  console.log(
    "PASS: database persistence, replay, private visibility, tenant isolation, correction audit, stage ownership, optimistic concurrency, mailbox lease/checkpoint, OAuth ownership/replay/encryption/disconnect race and visit semantics.",
  );
}
main()
  .catch((error: unknown) => {
    console.error(
      "CRM database rehearsal failed. Inspect the failing assertion locally without logging credentials or mailbox content.",
    );
    // Stack frames identify the failed check without printing error messages or values.
    if (error instanceof Error)
      console.error(
        error.name,
        error.stack
          ?.split("\n")
          .filter((line) => /^\s+at /.test(line))
          .slice(0, 5)
          .join("\n"),
      );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
