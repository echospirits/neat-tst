import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../prisma";
import { CrmError, type CrmActor, type CrmDb } from "../activity";
import {
  matchParticipants,
  isInternalMessage,
  normalizeEmail,
} from "../matching";
import { GoogleMailAdapter } from "./google";
import { MicrosoftMailAdapter } from "./microsoft";
import { mailboxAccessToken, mailConfig, providerInput } from "./oauth";
import {
  MailProviderError,
  type MailAdapter,
  type MailChange,
  type MailCursor,
  type MailPage,
} from "./types";

export async function ingestMailChanges(
  db: CrmDb,
  actor: CrmActor,
  connection: {
    id: string;
    email: string;
    provider: string;
    excludeInternal: boolean;
    retentionDays: number;
    internalDomains?: string[];
  },
  changes: MailChange[],
  now = new Date(),
) {
  const participantEmails = [
    ...new Set(
      changes
        .flatMap((change) => change.participants ?? [])
        .map(normalizeEmail),
    ),
  ];
  const [contacts, users] = await Promise.all([
    db.locationContact.findMany({
      where: {
        organizationId: actor.organizationId,
        active: true,
        OR: [{ email: { in: participantEmails, mode: "insensitive" } }, { emailAliases: { hasSome: participantEmails } }],
      },
      select: {
        id: true,
        email: true,
        emailAliases: true,
        agencyId: true,
        wholesaleAccountId: true,
      },
    }),
    db.user.findMany({
      where: { organizationId: actor.organizationId },
      select: { email: true },
    }),
  ]);
  let saved = 0;
  for (const change of changes) {
    const sourceKey = `mail:${connection.id}:${change.kind}:${change.id}`;
    const identity = {
      organizationId: actor.organizationId,
      connectionId: connection.id,
      sourceKey,
    };
    const participants = [
      ...new Set((change.participants ?? []).map(normalizeEmail)),
    ];
    if (
      change.deleted ||
      change.private ||
      (change.kind === "CALENDAR_MEETING" &&
        !participants.some((p) => p !== normalizeEmail(connection.email))) ||
      (connection.excludeInternal &&
        isInternalMessage(
          participants,
          users.map((u) => u.email),
          connection.email,
          connection.internalDomains,
        ))
    ) {
      await db.accountActivity.deleteMany({ where: identity });
      continue;
    }
    if (!change.at || !Number.isFinite(new Date(change.at).getTime()))
      throw new MailProviderError("INVALID_RESPONSE");
    const at = new Date(change.at);
    if (at.getTime() < now.getTime() - connection.retentionDays * 86400000)
      continue;
    // A meeting invitation/future appointment does not prove that contact occurred.
    let match = matchParticipants(
      participants.filter((p) => p !== normalizeEmail(connection.email)),
      contacts,
    );
    if (change.threadId && match.status === 'REVIEW') {
      const history = await db.accountActivity.findMany({ where: { organizationId: actor.organizationId, connectionId: connection.id, createdByUserId: actor.userId, threadId: change.threadId, matchStatus: 'CORRECTED' }, orderBy: { updatedAt: 'desc' }, take: 10, select: { agencyId: true, wholesaleAccountId: true, participants: true } });
      const accounts = new Set(history.map(row => `${row.agencyId ?? ''}:${row.wholesaleAccountId ?? ''}`));
      const prior = history[0];
      if (prior && accounts.size === 1 && Boolean(prior.agencyId) !== Boolean(prior.wholesaleAccountId) && participants.every(email => prior.participants.includes(email))) {
        match = { status: 'MATCHED', confidence: 0.95, agencyId: prior.agencyId, wholesaleAccountId: prior.wholesaleAccountId, contactId: null, reason: 'Owner-corrected conversation with unchanged participants.' };
      }
    }
    const existing = await db.accountActivity.findUnique({
      where: {
        organizationId_sourceKey: {
          organizationId: actor.organizationId,
          sourceKey,
        },
      },
      select: { id: true, matchStatus: true },
    });
    const data = {
      providerSeenAt: now,
      summary: (change.subject || "(No subject)").slice(0, 500),
      occurredAt: at,
      threadId: change.threadId ?? null,
      participants,
      direction: change.direction ?? null,
      externalUrl: safeOriginalUrl(change.url),
    };
    await db.accountActivity.upsert({
      where: {
        organizationId_sourceKey: {
          organizationId: actor.organizationId,
          sourceKey,
        },
      },
      create: {
        ...identity,
        ...data,
        createdByUserId: actor.userId,
        source: connection.provider,
        activityType: change.kind,
        visibility: "PRIVATE",
        meaningful: false,
        agencyId: match.agencyId,
        wholesaleAccountId: match.wholesaleAccountId,
        contactId: match.contactId,
        matchStatus: match.status,
        matchConfidence: match.confidence,
      },
      update: {
        ...data,
        ...(existing?.matchStatus === "CORRECTED"
          ? {}
          : {
              agencyId: match.agencyId,
              wholesaleAccountId: match.wholesaleAccountId,
              contactId: match.contactId,
              matchStatus: match.status,
              matchConfidence: match.confidence,
            }),
      },
    });
    saved++;
  }
  return saved;
}
export async function syncMailbox(
  actor: CrmActor,
  id: string,
  adapterOverride?: MailAdapter,
) {
  const now = new Date(),
    leaseId = randomUUID();
  const owned = await prisma.mailboxConnection.findFirst({
    where: {
      id,
      ...actor,
      enabled: true,
      user: { isActive: true, organizationId: actor.organizationId },
    },
  });
  if (!owned) throw new CrmError("Active mailbox connection not found.");
  if (owned.nextRetryAt && owned.nextRetryAt > now) throw new CrmError("Provider retry is scheduled. Please wait before synchronizing again.");
  if (!adapterOverride) mailConfig(providerInput.parse(owned.provider));
  if (owned.lastSyncAt && now.getTime() - owned.lastSyncAt.getTime() < 10000)
    throw new CrmError("Please wait a few seconds before synchronizing again.");
  const claim = await prisma.mailboxConnection.updateMany({
    where: {
      id,
      ...actor,
      enabled: true,
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    data: { leaseId, leaseUntil: new Date(now.getTime() + 10 * 60000) },
  });
  if (!claim.count)
    throw new CrmError("Synchronization is already in progress.");
  try {
    const token = adapterOverride
      ? "mock-token"
      : await mailboxAccessToken(owned, leaseId);
    const adapter =
      adapterOverride ??
      (owned.provider === "GOOGLE"
        ? new GoogleMailAdapter()
        : new MicrosoftMailAdapter());
    const cursor: MailCursor = owned.cursor
      ? z.record(z.string()).parse(owned.cursor)
      : {};
    const page = await adapter.readPage({
      token,
      email: owned.email,
      since: new Date(
        now.getTime() -
          Math.min(owned.historyDays, owned.retentionDays) * 86400000,
      ),
      cursor,
      now,
    });
    const saved = await prisma.$transaction(
      async (tx) => {
        // Claim the row inside the transaction. Disconnect/config edits clear the lease and invalidate this result.
        const current = await tx.mailboxConnection.updateMany({
          where: {
            id,
            ...actor,
            enabled: true,
            leaseId,
            leaseUntil: { gt: new Date() },
            user: { isActive: true, organizationId: actor.organizationId },
          },
          data: { lastSyncAt: now },
        });
        if (!current.count)
          throw new CrmError("Connection changed. Please synchronize again.");
        const count = await ingestMailChanges(
          tx,
          actor,
          owned,
          page.changes,
          now,
        );
        await reconcileMailSnapshot(tx, actor.organizationId, id, page.snapshot);
        await tx.accountActivity.deleteMany({
          where: {
            organizationId: actor.organizationId,
            connectionId: id,
            occurredAt: {
              lt: new Date(now.getTime() - owned.retentionDays * 86400000),
            },
          },
        });
        await tx.mailboxConnection.updateMany({
          where: { id, ...actor, leaseId },
          data: {
            cursor: page.cursor as Prisma.InputJsonValue,
            errorCode: null,
            failureCount: 0,
            nextRetryAt: null,
            leaseId: null,
            leaseUntil: null,
          },
        });
        return count;
      },
      { timeout: 30000 },
    );
    return { saved, more: page.more };
  } catch (error) {
    await prisma.mailboxConnection.updateMany({
      where: { id, ...actor, leaseId },
      data: {
        leaseId: null,
        leaseUntil: null,
        errorCode: error instanceof MailProviderError ? error.code : "RETRY",
        failureCount: { increment: 1 },
        nextRetryAt: new Date(Date.now() + Math.min(3600, 30 * 2 ** Math.min(owned.failureCount, 7)) * 1000),
      },
    });
    throw error instanceof CrmError
      ? error
      : new CrmError(
          error instanceof MailProviderError && error.code === "RECONNECT"
            ? "Reconnect this mailbox to restore access."
            : "Synchronization could not finish. Your previous checkpoint is safe; retry shortly.",
        );
  }
}
export async function disconnectMailbox(
  actor: CrmActor,
  id: string,
  deleteHistory: boolean,
) {
  await prisma.$transaction(async (tx) => {
    // Lock the same authorization rows as OAuth completion before touching the
    // connection, so a delayed callback cannot undo this disconnect.
    await tx.mailboxOAuthState.deleteMany({ where: actor });
    const row = await tx.mailboxConnection.updateMany({
      where: { id, ...actor },
      data: {
        enabled: false,
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
        leaseId: null,
        leaseUntil: null,
        errorCode: null,
      },
    });
    if (!row.count) throw new CrmError("Connection not found.");
    if (deleteHistory) {
      await tx.accountActivity.deleteMany({
        where: { organizationId: actor.organizationId, connectionId: id },
      });
      await tx.mailboxConnection.deleteMany({ where: { id, ...actor } });
    }
  });
}

export function safeOriginalUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && ['mail.google.com', 'calendar.google.com', 'www.google.com', 'outlook.office.com', 'outlook.office365.com', 'outlook.live.com'].includes(url.hostname) ? url.href : null;
  } catch { return null; }
}
export async function sweepMailboxRetention(limit = 20, now = new Date()) {
  const connections = await prisma.mailboxConnection.findMany({ where: { OR: [{ lastRetentionAt: null }, { lastRetentionAt: { lt: new Date(now.getTime() - 86400000) } }] }, orderBy: { lastRetentionAt: { sort: 'asc', nulls: 'first' } }, take: Math.min(100, Math.max(1, limit)), select: { id: true, organizationId: true, retentionDays: true } });
  let removed = 0;
  for (const connection of connections) removed += await prisma.$transaction(async tx => {
    const result = await tx.accountActivity.deleteMany({ where: { organizationId: connection.organizationId, connectionId: connection.id, occurredAt: { lt: new Date(now.getTime() - connection.retentionDays * 86400000) } } });
    await tx.mailboxConnection.updateMany({ where: { id: connection.id, organizationId: connection.organizationId }, data: { lastRetentionAt: now } });
    return result.count;
  });
  return removed;
}

/** Sweep only after every page commits; absence during a partial scan is not a deletion. */
export async function reconcileMailSnapshot(db: CrmDb, organizationId:string, connectionId:string, snapshot:MailPage["snapshot"]) {
  if (!snapshot?.complete) return 0;
  const start=new Date(snapshot.startedAt), from=new Date(snapshot.from), to=snapshot.to ? new Date(snapshot.to) : undefined;
  if(!Number.isFinite(start.getTime()) || !Number.isFinite(from.getTime()) || (to && !Number.isFinite(to.getTime()))) throw new MailProviderError("INVALID_RESPONSE");
  const result=await db.accountActivity.deleteMany({where:{organizationId,connectionId,activityType:snapshot.kind,occurredAt:{gte:from,...(to?{lt:to}:{})},OR:[{providerSeenAt:null},{providerSeenAt:{lt:start}}]}});
  return result.count;
}
