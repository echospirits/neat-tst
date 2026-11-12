import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import {
  assertSocialActor,
  lockSocialPost,
  socialContent,
  socialProviderDestination,
  SocialError,
  type SocialDb,
} from './service';
import {
  socialDeliveryGuard,
  socialHash,
  socialLivePolicy,
  socialTenantLivePolicy,
  socialRetryDelay,
  type SocialSnapshot,
} from './model';
import { decryptCalendarToken, encryptCalendarToken } from '../calendar/crypto';
import { getSocialProvider, refreshSocialCredentials } from './providers';
import {
  SocialProviderError,
  type SocialCredentials,
  type ExternalIds,
  type ProviderContext,
  type ProviderOutcome,
  type SocialProvider,
} from './types';
import { createDispatchMediaUrl, readSocialMedia } from './media';

const json = (v: unknown) => v as Prisma.InputJsonValue;
const activeStatuses = [
  'QUEUED',
  'RETRY',
  'UPLOADING',
  'PROCESSING',
  'ACCEPTED',
];
async function loadDelivery(db: SocialDb, id: string) {
  return db.socialDelivery.findUniqueOrThrow({
    where: { id },
    include: {
      post: true,
      revision: true,
      destination: { include: { credential: true } },
    },
  });
}
async function authorizeDelivery(
  db: SocialDb,
  id: string,
  token: string,
  now: Date,
  irreversible = false,
) {
  const first = await loadDelivery(db, id);
  await lockSocialPost(db, first.organizationId, first.postId);
  const d = await loadDelivery(db, id);
  if (
    d.leaseToken !== token ||
    !d.leaseUntil ||
    d.leaseUntil <= now ||
    !activeStatuses.includes(d.status)
  )
    throw new Error('Delivery lease or cancellation changed.');
  if (!d.revision.approvedByUserId)
    throw new Error('Administrator approval is missing.');
  const user = await db.user.findFirst({
    where: {
      id: d.revision.approvedByUserId,
      organizationId: d.organizationId,
      isActive: true,
    },
  });
  if (!user) throw new Error('Approver access has been revoked.');
  const { organization } = await assertSocialActor(
    db,
    { organizationId: d.organizationId, userId: user.id, role: user.role },
    true,
  );
  const reason = socialDeliveryGuard(
    {
      approvedAt: d.revision.approvedAt,
      invalidatedAt: d.revision.invalidatedAt,
      postStatus: d.post.status,
      currentRevision: d.post.currentRevision,
      revisionNumber: d.revision.number,
      destinationEnabled: d.destination.enabled,
      connectionHealth: d.destination.credential.health,
      expiresAt: d.destination.credential.expiresAt,
      scheduledAt: d.scheduledAt,
      started: !!d.startedAt,
    },
    now,
  );
  if (reason) throw new SocialError(reason);
  if (
    d.destination.groupId !== d.post.groupId ||
    d.destination.externalId !== d.externalId ||
    d.destination.provider !== d.provider
  )
    throw new Error('Destination mapping changed. Review and approve again.');
  const payload = d.revision.payload as unknown as SocialSnapshot;
  if (socialHash(payload) !== d.revision.contentHash)
    throw new Error('Reviewed content integrity check failed.');
  const entry = payload.destinations.find(
    (v) => v.destinationId === d.destinationId && v.externalId === d.externalId,
  );
  if (!entry)
    throw new Error('Destination is absent from the approved revision.');
  const media = await db.socialMedia.findMany({
    where: {
      organizationId: d.organizationId,
      groupId: d.post.groupId,
      id: { in: entry.mediaIds },
    },
  });
  if (
    media.length !== entry.media.length ||
    entry.media.some(
      (v) => !media.some((m) => m.id === v.id && m.sha256 === v.sha256),
    )
  )
    throw new Error('Reviewed media version is unavailable.');
  if (d.mode === 'LIVE') {
    const gate = socialLivePolicy(
      d.organizationId,
      d.destinationId,
      d.revision.approvedAt,
    );
    if (!gate.enabled) throw new SocialError(gate.reason);
    const current = socialTenantLivePolicy(
      organization.crmPreferences,
      d.revision.approvedAt,
    );
    if (!current.enabled) throw new SocialError(current.reason);
  }
  if (irreversible)
    await db.socialDelivery.update({
      where: { id },
      data: {
        ...((d.externalIds as ExternalIds).publicationStarted ||
        d.mode === 'SIMULATED'
          ? { startedAt: d.startedAt ?? now }
          : {}),
        status: 'UPLOADING',
      },
    });
  return { d, payload, entry, media };
}
export async function processSocialDelivery(
  db: PrismaClient,
  id: string,
  now = new Date(),
) {
  const token = randomUUID();
  const claim = await db.socialDelivery.updateMany({
    where: {
      id,
      status: { in: activeStatuses },
      nextAttemptAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    data: {
      leaseToken: token,
      leaseUntil: new Date(now.getTime() + 240_000),
      attempts: { increment: 1 },
    },
  });
  if (!claim.count) return { id, claimed: false };
  let initial: Awaited<ReturnType<typeof loadDelivery>> | undefined;
  try {
    initial = await loadDelivery(db, id);
    if (
      initial.mode === 'LIVE' &&
      initial.destination.credential.expiresAt &&
      initial.destination.credential.expiresAt.getTime() <
        now.getTime() + 60_000
    ) {
      await db.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`social-credential:${initial!.destination.credentialId}`},0))`;
          const current = await loadDelivery(tx, id);
          const approver = await tx.user.findFirst({
            where: {
              id: current.revision.approvedByUserId ?? '',
              organizationId: current.organizationId,
              isActive: true,
            },
          });
          if (!approver) throw new Error('Approver unavailable.');
          await assertSocialActor(
            tx,
            {
              organizationId: current.organizationId,
              userId: approver.id,
              role: approver.role,
            },
            true,
          );
          const token = JSON.parse(
            decryptCalendarToken(
              current.destination.credential.credentialsEncrypted,
            ),
          ) as SocialCredentials;
          const refreshed = await refreshSocialCredentials(
            current.provider as SocialProvider,
            token,
          );
          await tx.socialCredential.update({
            where: { id: current.destination.credentialId },
            data: {
              credentialsEncrypted: encryptCalendarToken(
                JSON.stringify(refreshed),
              ),
              expiresAt: refreshed.expiresAt
                ? new Date(refreshed.expiresAt)
                : null,
              scopes: refreshed.scopes,
            },
          });
        },
        { timeout: 45000 },
      );
      initial = await loadDelivery(db, id);
    }
    const recovering = !!(initial.externalIds as ExternalIds)
      .publicationStarted;
    // Recovery of an already started request must read back even after cancellation/revocation.
    const approved = recovering
      ? {
          d: initial,
          entry: (
            initial.revision.payload as unknown as SocialSnapshot
          ).destinations.find(
            (v) => v.destinationId === initial!.destinationId,
          )!,
          media: await db.socialMedia.findMany({
            where: {
              organizationId: initial.organizationId,
              id: {
                in:
                  (
                    initial.revision.payload as unknown as SocialSnapshot
                  ).destinations.find(
                    (v) => v.destinationId === initial!.destinationId,
                  )?.mediaIds ?? [],
              },
            },
          }),
        }
      : await db.$transaction((tx) => authorizeDelivery(tx, id, token, now), {
          timeout: 15000,
        });
    const { d, entry, media } = approved;
    let outcome: ProviderOutcome;
    if (d.mode === 'SIMULATED') {
      await db.$transaction(
        async (tx) => {
          await authorizeDelivery(tx, id, token, new Date(), true);
          await tx.socialDelivery.update({
            where: { id },
            data: { externalIds: {} },
          });
        },
        { timeout: 15000 },
      );
      outcome = {
        status: 'PUBLISHED',
        ids: {},
        detail: 'SIMULATED — no provider request was made.',
      };
    } else if (d.mode === 'LIVE') {
      const adapter = getSocialProvider(d.provider as SocialProvider);
      const credentials = JSON.parse(
        decryptCalendarToken(d.destination.credential.credentialsEncrypted),
      ) as SocialCredentials;
      const destination = socialProviderDestination(d.destination);
      const content = socialContent(entry);
      const errors = adapter.validate(destination, content);
      if (errors.length)
        throw new SocialProviderError(
          errors.join(' '),
          'CONTENT',
          'VALIDATION',
        );
      let ids = d.externalIds as ExternalIds;
      const context: ProviderContext = {
        destination,
        credentials,
        content,
        ids,
        getMediaUrl: async (m) => {
          const stored = media.find((v) => v.id === m.id);
          if (!stored) throw new Error('Media unavailable.');
          return createDispatchMediaUrl(stored);
        },
        readMedia: async (m) => {
          const stored = media.find((v) => v.id === m.id);
          if (!stored) throw new Error('Media unavailable.');
          return new Uint8Array(await readSocialMedia(stored));
        },
        checkpoint: async (value) => {
          ids = { ...ids, ...value };
          context.ids = ids;
          const changed = await db.socialDelivery.updateMany({
            where: { id, leaseToken: token },
            data: {
              externalIds: json(ids),
              leaseUntil: new Date(Date.now() + 240_000),
            },
          });
          if (!changed.count) throw new Error('Delivery claim changed.');
        },
        assertCanPublish: async () => {
          await db.$transaction(
            (tx) => authorizeDelivery(tx, id, token, new Date(), true),
            { timeout: 15000 },
          );
        },
      };
      if (ids.publicationStarted) outcome = await adapter.check(context, ids);
      else {
        const prepared = await adapter.prepare(context);
        await context.checkpoint(prepared.ids);
        outcome = prepared.rejected
          ? { status: 'REJECTED', ids: prepared.ids, detail: prepared.rejected }
          : !prepared.ready
            ? {
                status: 'PROCESSING',
                ids: prepared.ids,
                detail: 'Media is processing.',
              }
            : await adapter.publish(context, prepared);
      }
    } else
      throw new Error(
        'Manual delivery requires the administrator completion action.',
      );
    let status = d.mode === 'SIMULATED' ? 'SIMULATED' : outcome.status;
    if (
      ['PROCESSING', 'ACCEPTED'].includes(status) &&
      Date.now() - d.createdAt.getTime() >
        Math.max(
          3600_000,
          d.scheduledAt.getTime() - d.createdAt.getTime() + 3600_000,
        )
    )
      status = 'NEEDS_ATTENTION';
    await db.$transaction(async (tx) => {
      const changed = await tx.socialDelivery.updateMany({
        where: { id, leaseToken: token, status: { in: activeStatuses } },
        data: {
          status,
          externalIds: json(outcome.ids),
          postUrl: outcome.postUrl,
          detail: outcome.detail,
          confirmedAt: outcome.confirmed ? new Date() : null,
          nextAttemptAt: new Date(Date.now() + 60_000),
          leaseToken: null,
          leaseUntil: null,
        },
      });
      if (!changed.count) return;
      await tx.socialAttempt.create({
        data: {
          deliveryId: id,
          number: d.attempts,
          mode: d.mode,
          outcome: status,
          detail: outcome.detail,
          externalIds: json(outcome.ids),
        },
      });
      await tx.socialAudit.create({
        data: {
          organizationId: d.organizationId,
          postId: d.postId,
          type: status,
          detail: `${d.destination.displayName}: ${outcome.detail || status}`,
        },
      });
      if (d.mode === 'LIVE' && status === 'PUBLISHED' && outcome.confirmed) {
        await tx.socialDestination.update({
          where: { id: d.destinationId },
          data: { health: 'CONNECTED', verifiedAt: new Date() },
        });
        await tx.socialCredential.update({
          where: { id: d.destination.credentialId },
          data: { health: 'CONNECTED' },
        });
      }
    });
    return { id, claimed: true, status };
  } catch (error) {
    const current = await loadDelivery(db, id);
    if (current.leaseToken !== token)
      return { id, claimed: true, status: 'CLAIM_CHANGED' };
    const ids = current.externalIds as ExternalIds;
    const known = error instanceof SocialProviderError;
    const failures = await db.socialAttempt.count({
      where: { deliveryId: id, outcome: 'RETRY' },
    });
    const retry =
      known &&
      error.kind === 'TRANSIENT' &&
      !ids.publicationStarted &&
      failures < 3;
    const status = ids.publicationStarted
      ? 'NEEDS_ATTENTION'
      : retry
        ? 'RETRY'
        : known && error.kind === 'CONTENT'
          ? 'REJECTED'
          : 'NEEDS_ATTENTION';
    // Never persist remote response bodies, OAuth tokens, or arbitrary exception text.
    const detail = known
      ? `${error.kind}: ${error.code}. ${retry ? 'Automatic bounded retry queued.' : 'Administrator review required.'}`
      : error instanceof SocialError
        ? error.message
        : 'Delivery guard or provider request failed. Review authorization, revision, timing and connection setup.';
    await db.$transaction(async (tx) => {
      const changed = await tx.socialDelivery.updateMany({
        where: { id, leaseToken: token, status: { in: activeStatuses } },
        data: {
          status,
          detail,
          ...(!ids.publicationStarted ? { startedAt: null } : {}),
          nextAttemptAt: new Date(
            Date.now() +
              socialRetryDelay(
                current.attempts,
                known ? error.retryAfterSeconds : undefined,
              ),
          ),
          leaseToken: null,
          leaseUntil: null,
        },
      });
      if (!changed.count) return;
      await tx.socialAttempt.create({
        data: {
          deliveryId: id,
          number: current.attempts,
          mode: current.mode,
          outcome: status,
          detail,
          externalIds: json(ids),
        },
      });
      await tx.socialAudit.create({
        data: {
          organizationId: current.organizationId,
          postId: current.postId,
          type: status,
          detail: `Destination ${current.destinationId}: ${detail}`,
        },
      });
      if (known && error.kind === 'AUTHORIZATION') {
        await tx.socialCredential.update({
          where: { id: current.destination.credentialId },
          data: { health: 'RECONNECT_REQUIRED' },
        });
        await tx.socialDestination.updateMany({
          where: {
            organizationId: current.organizationId,
            credentialId: current.destination.credentialId,
            enabled: true,
          },
          data: { health: 'RECONNECT_REQUIRED' },
        });
      }
    });
    return { id, claimed: true, status };
  }
}
export async function runSocialPublishingJobs(
  db: PrismaClient,
  now = new Date(),
) {
  if (process.env.SOCIAL_JOBS_ENABLED !== 'true')
    return { disabled: true, results: [] };
  const due = await db.socialDelivery.findMany({
    where: {
      organizationId: 'org_echo_spirits',
      status: { in: activeStatuses },
      nextAttemptAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    select: { id: true },
    orderBy: { nextAttemptAt: 'asc' },
    take: 10,
  });
  const results = [];
  for (const d of due) results.push(await processSocialDelivery(db, d.id, now));
  return { disabled: false, results };
}
