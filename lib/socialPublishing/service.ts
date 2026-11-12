import { Prisma, type UserRole } from '@prisma/client';
import { z } from 'zod';
import { isAdminRole } from '../userAccess';
import { ECHO_ORGANIZATION_ID } from '../echoAccess';
import {
  socialDraftInput,
  socialHash,
  socialTesterEnabled,
  socialLivePolicy,
  socialTenantLivePolicy,
  type SocialSnapshot,
} from './model';
import type { SocialActor } from './access';
import type {
  SocialProvider,
  PublishContent,
  SocialDestination as ProviderDestination,
} from './types';
import { getSocialProvider } from './providers';
import {
  formatEasternDateInputValue,
  parseTimeInputToMinutes,
} from '../dateTime';
import { tastingTimeValue } from '../tastings/time';
export type SocialDb = Prisma.TransactionClient;
export class SocialError extends Error {}
const terminal = ['PUBLISHED', 'SIMULATED', 'MANUALLY_CONFIRMED'];
const json = (v: unknown) => v as Prisma.InputJsonValue;
export async function lockSocialPost(
  db: SocialDb,
  organizationId: string,
  id: string,
) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`social:${organizationId}:${id}`},0))`;
}
export async function assertSocialActor(
  db: SocialDb,
  actor: SocialActor,
  admin = false,
) {
  const [user, organization, feature] = await Promise.all([
    db.user.findFirst({
      where: {
        id: actor.userId,
        organizationId: actor.organizationId,
        isActive: true,
      },
      select: { id: true, role: true },
    }),
    db.organization.findFirst({
      where: {
        id: actor.organizationId,
        active: true,
        accountStatus: { notIn: ['SUSPENDED', 'CANCELLED'] },
      },
    }),
    db.organizationFeature.findFirst({
      where: {
        organizationId: actor.organizationId,
        featureKey: 'SOCIAL_PUBLISHING',
        enabled: true,
      },
    }),
  ]);
  if (
    actor.organizationId !== ECHO_ORGANIZATION_ID ||
    !user ||
    user.role !== actor.role ||
    !organization ||
    !feature ||
    !socialTesterEnabled(user.id)
  )
    throw new SocialError('Social Publishing is unavailable for this user.');
  if (admin && !isAdminRole(user.role))
    throw new SocialError('Administrator access is required.');
  return { user, organization };
}
export async function assertSocialGroup(
  db: SocialDb,
  actor: SocialActor,
  groupId: string,
) {
  await assertSocialActor(db, actor);
  const group = await db.socialGroup.findFirst({
    where: {
      organizationId: actor.organizationId,
      id: groupId,
      ...(!isAdminRole(actor.role)
        ? { members: { some: { userId: actor.userId } } }
        : {}),
    },
  });
  if (!group)
    throw new SocialError('You do not have access to this brand group.');
  return group;
}
export async function setupSocialGroups(db: SocialDb, actor: SocialActor) {
  await assertSocialActor(db, actor, true);
  const values = [
    ['echo-spirits', 'Echo Spirits Distilling Co.'],
    ['on-the-vine', 'Echo Spirits on the Vine'],
    ['the-bar', 'The Bar at Echo Spirits'],
  ];
  for (const [key, label] of values)
    await db.socialGroup.upsert({
      where: {
        organizationId_key: { organizationId: actor.organizationId, key },
      },
      create: { organizationId: actor.organizationId, key, label },
      update: {},
    });
}
export async function setSocialGroupAccess(
  db: SocialDb,
  actor: SocialActor,
  raw: unknown,
) {
  await assertSocialActor(db, actor, true);
  const v = z
    .object({ groupId: z.string(), userId: z.string(), enabled: z.boolean() })
    .parse(raw);
  await assertSocialGroup(db, actor, v.groupId);
  const member = await db.user.findFirst({
    where: {
      id: v.userId,
      organizationId: actor.organizationId,
      isActive: true,
    },
  });
  if (!member) throw new SocialError('Choose an active tenant user.');
  if (v.enabled && member.role === 'TASTER')
    throw new SocialError(
      'Tasting-only accounts cannot join Social Publishing; use an active staff account.',
    );
  if (v.enabled)
    await db.socialGroupMember.upsert({
      where: {
        organizationId_groupId_userId: {
          organizationId: actor.organizationId,
          groupId: v.groupId,
          userId: v.userId,
        },
      },
      create: {
        organizationId: actor.organizationId,
        groupId: v.groupId,
        userId: v.userId,
      },
      update: {},
    });
  else
    await db.socialGroupMember.deleteMany({
      where: {
        organizationId: actor.organizationId,
        groupId: v.groupId,
        userId: v.userId,
      },
    });
}
export async function assignSocialDestination(
  db: SocialDb,
  actor: SocialActor,
  raw: unknown,
) {
  await assertSocialActor(db, actor, true);
  const v = z
    .object({ destinationId: z.string(), groupId: z.string() })
    .parse(raw);
  await assertSocialGroup(db, actor, v.groupId);
  const dest = await db.socialDestination.findFirst({
    where: { id: v.destinationId, organizationId: actor.organizationId },
  });
  if (!dest) throw new SocialError('Destination unavailable.');
  // Old approvals keep destination IDs. Moving a mapping cannot silently authorize an old send.
  await db.socialDestination.update({
    where: { id: dest.id },
    data: { groupId: v.groupId },
  });
}
export async function disconnectSocialDestination(
  db: SocialDb,
  actor: SocialActor,
  id: string,
) {
  await assertSocialActor(db, actor, true);
  const dest = await db.socialDestination.findFirst({
    where: { id, organizationId: actor.organizationId },
  });
  if (!dest) throw new SocialError('Destination unavailable.');
  await db.socialDestination.update({
    where: { id },
    data: { enabled: false, health: 'DISCONNECTED' },
  });
  await db.socialDelivery.updateMany({
    where: {
      organizationId: actor.organizationId,
      destinationId: id,
      status: { in: ['QUEUED', 'RETRY'] },
      startedAt: null,
    },
    data: { status: 'CANCELED', detail: 'Destination disconnected.' },
  });
}
async function audit(
  db: SocialDb,
  actor: SocialActor,
  postId: string,
  type: string,
  detail: string,
) {
  await db.socialAudit.create({
    data: {
      organizationId: actor.organizationId,
      postId,
      actorUserId: actor.userId,
      type,
      detail,
    },
  });
}
export const socialProviderDestination = (d: {
  provider: string;
  externalId: string;
  displayName: string;
  handle: string | null;
  profileImageUrl: string | null;
  metadata: Prisma.JsonValue;
}): ProviderDestination => ({
  provider: d.provider as SocialProvider,
  externalId: d.externalId,
  displayName: d.displayName,
  handle: d.handle ?? undefined,
  profileImageUrl: d.profileImageUrl ?? undefined,
  metadata: d.metadata as Record<string, unknown>,
});
export function socialContent(
  d: SocialSnapshot['destinations'][number],
): PublishContent {
  return {
    caption: d.caption,
    format: d.format,
    media: d.media,
    link: d.link || undefined,
    event: d.event,
    options: d.options,
  };
}
export async function saveSocialDraft(
  db: SocialDb,
  actor: SocialActor,
  raw: unknown,
) {
  const v = socialDraftInput.parse(raw);
  await assertSocialGroup(db, actor, v.groupId);
  await lockSocialPost(db, actor.organizationId, v.id ?? v.groupId);
  const old = v.id
    ? await db.socialPost.findFirst({
        where: { id: v.id, organizationId: actor.organizationId },
        include: { deliveries: true },
      })
    : null;
  if (v.id && (!old || old.groupId !== v.groupId))
    throw new SocialError('Post unavailable in this group.');
  if (old && (old.version !== v.version || old.status === 'CANCELED'))
    throw new SocialError('This post changed. Reload before editing.');
  if (
    old?.deliveries.some(
      (d) =>
        !['PUBLISHED', 'MANUALLY_CONFIRMED', 'SIMULATED', 'REJECTED'].includes(
          d.status,
        ) &&
        (d.externalIds as { publicationStarted?: boolean })?.publicationStarted,
    )
  )
    throw new SocialError(
      'A publication is in progress or uncertain. Reconcile its result before editing.',
    );
  if (old)
    await db.worklistItem.updateMany({
      where: {
        organizationId: actor.organizationId,
        id: {
          in: old.deliveries
            .filter((d) => d.status === 'MANUAL_READY' && d.worklistItemId)
            .map((d) => d.worklistItemId!),
        },
        status: { in: ['OPEN', 'IN_PROGRESS'] },
      },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledByUserId: actor.userId,
      },
    });
  const destinations: SocialSnapshot['destinations'] = [];
  for (const input of v.destinations) {
    if (
      old?.deliveries.some(
        (d) =>
          d.destinationId === input.destinationId &&
          terminal.includes(d.status),
      )
    )
      throw new SocialError(
        'Remove already completed destinations when editing remaining deliveries.',
      );
    const dest = await db.socialDestination.findFirst({
      where: {
        id: input.destinationId,
        organizationId: actor.organizationId,
        groupId: v.groupId,
        enabled: true,
      },
    });
    if (!dest)
      throw new SocialError(
        'Choose an enabled destination assigned to this group.',
      );
    const media = await db.socialMedia.findMany({
      where: {
        organizationId: actor.organizationId,
        groupId: v.groupId,
        id: { in: input.mediaIds },
      },
    });
    if (
      new Set(input.mediaIds).size !== input.mediaIds.length ||
      media.length !== input.mediaIds.length
    )
      throw new SocialError('Choose immutable media uploaded to this group.');
    destinations.push({
      ...input,
      externalId: dest.externalId,
      provider: dest.provider,
      displayName: dest.displayName,
      media: input.mediaIds.map((id) => {
        const m = media.find((x) => x.id === id)!;
        return {
          id: m.id,
          fileName: m.fileName,
          mimeType: m.mimeType,
          bytes: m.bytes,
          width: m.width,
          height: m.height,
          durationSeconds: m.durationSeconds,
          sha256: m.sha256,
        };
      }),
    });
  }
  const payload: SocialSnapshot = {
    title: v.title,
    caption: v.caption,
    note: v.note,
    proposedAt: v.proposedAt ?? null,
    destinations,
  };
  const post = old
    ? await db.socialPost.update({
        where: { id: old.id },
        data: {
          title: v.title,
          status: 'DRAFT',
          version: { increment: 1 },
          currentRevision: { increment: 1 },
        },
      })
    : await db.socialPost.create({
        data: {
          organizationId: actor.organizationId,
          groupId: v.groupId,
          createdByUserId: actor.userId,
          title: v.title,
        },
      });
  if (old) {
    await db.socialRevision.updateMany({
      where: {
        organizationId: actor.organizationId,
        postId: old.id,
        invalidatedAt: null,
        deliveries: { none: { status: { in: terminal } } },
      },
      data: { invalidatedAt: new Date() },
    });
    await db.socialDelivery.updateMany({
      where: {
        organizationId: actor.organizationId,
        postId: old.id,
        status: {
          in: [
            'QUEUED',
            'RETRY',
            'UPLOADING',
            'PROCESSING',
            'ACCEPTED',
            'FAILED',
            'REJECTED',
            'NEEDS_ATTENTION',
            'MANUAL_READY',
          ],
        },
      },
      data: {
        status: 'SUPERSEDED',
        detail: 'Revision changed. Approval is required again.',
      },
    });
  }
  await db.socialRevision.create({
    data: {
      organizationId: actor.organizationId,
      postId: post.id,
      number: post.currentRevision,
      payload: json(payload),
      contentHash: socialHash(payload),
      proposedAt: v.proposedAt ? new Date(v.proposedAt) : null,
    },
  });
  await audit(
    db,
    actor,
    post.id,
    'REVISION_CREATED',
    `Revision ${post.currentRevision}; prior pending approvals invalidated.`,
  );
  return post;
}
async function editablePost(
  db: SocialDb,
  actor: SocialActor,
  id: string,
  version: number,
) {
  const p = await db.socialPost.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { revisions: { orderBy: { number: 'desc' } }, deliveries: true },
  });
  if (!p) throw new SocialError('Post unavailable.');
  await assertSocialGroup(db, actor, p.groupId);
  if (p.version !== version)
    throw new SocialError('This post changed. Reload before continuing.');
  return p;
}
async function validateSnapshot(
  db: SocialDb,
  actor: SocialActor,
  payload: SocialSnapshot,
  groupId: string,
) {
  for (const entry of payload.destinations) {
    const dest = await db.socialDestination.findFirst({
      where: {
        id: entry.destinationId,
        organizationId: actor.organizationId,
        groupId,
        enabled: true,
      },
      include: { credential: true },
    });
    if (
      !dest ||
      dest.externalId !== entry.externalId ||
      dest.provider !== entry.provider
    )
      throw new SocialError(
        'A selected destination is no longer connected to this group.',
      );
    if (
      dest.credential.health === 'RECONNECT_REQUIRED' ||
      dest.health === 'DISCONNECTED'
    )
      throw new SocialError('Reconnect the selected destination.');
    const errors = getSocialProvider(entry.provider as SocialProvider).validate(
      socialProviderDestination(dest),
      socialContent(entry),
    );
    if (errors.length)
      throw new SocialError(`${entry.displayName}: ${errors.join(' ')}`);
  }
}
export async function submitSocialPost(
  db: SocialDb,
  actor: SocialActor,
  raw: unknown,
) {
  const v = z.object({ id: z.string(), version: z.number().int() }).parse(raw);
  await assertSocialActor(db, actor);
  await lockSocialPost(db, actor.organizationId, v.id);
  const p = await editablePost(db, actor, v.id, v.version);
  if (p.status !== 'DRAFT')
    throw new SocialError('Only a draft can be submitted.');
  const rev = p.revisions.find((r) => r.number === p.currentRevision)!;
  await validateSnapshot(
    db,
    actor,
    rev.payload as unknown as SocialSnapshot,
    p.groupId,
  );
  await db.socialRevision.update({
    where: { id: rev.id },
    data: { submittedAt: new Date() },
  });
  await db.socialPost.update({
    where: { id: p.id },
    data: { status: 'SUBMITTED', version: { increment: 1 } },
  });
  await audit(
    db,
    actor,
    p.id,
    'SUBMITTED',
    `Revision ${rev.number} submitted for review.`,
  );
}
export async function reviewSocialPost(
  db: SocialDb,
  actor: SocialActor,
  raw: unknown,
  now = new Date(),
) {
  const v = z
    .object({
      id: z.string(),
      version: z.number().int(),
      action: z.enum(['RETURN', 'CANCEL', 'APPROVE_SCHEDULE', 'APPROVE_NOW']),
      comment: z.string().max(4000).optional(),
    })
    .parse(raw);
  const { organization } = await assertSocialActor(db, actor, true);
  await lockSocialPost(db, actor.organizationId, v.id);
  const p = await editablePost(db, actor, v.id, v.version);
  let rev = p.revisions.find((r) => r.number === p.currentRevision)!;
  if (v.action === 'RETURN' || v.action === 'CANCEL') {
    await db.worklistItem.updateMany({
      where: {
        organizationId: actor.organizationId,
        id: {
          in: p.deliveries
            .filter((d) => d.status === 'MANUAL_READY' && d.worklistItemId)
            .map((d) => d.worklistItemId!),
        },
        status: { in: ['OPEN', 'IN_PROGRESS'] },
      },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
        cancelledByUserId: actor.userId,
      },
    });
    await db.socialRevision.updateMany({
      where: {
        organizationId: actor.organizationId,
        postId: p.id,
        invalidatedAt: null,
        deliveries: { none: { status: { in: terminal } } },
      },
      data: { invalidatedAt: now },
    });
    await db.socialDelivery.updateMany({
      where: {
        organizationId: actor.organizationId,
        postId: p.id,
        id: {
          in: p.deliveries
            .filter(
              (d) =>
                !(d.externalIds as { publicationStarted?: boolean })
                  .publicationStarted,
            )
            .map((d) => d.id),
        },
        status: {
          in: [
            'QUEUED',
            'RETRY',
            'MANUAL_READY',
            'FAILED',
            'NEEDS_ATTENTION',
            'UPLOADING',
            'PROCESSING',
            'ACCEPTED',
          ],
        },
      },
      data: { status: 'CANCELED', detail: 'Editorial approval withdrawn.' },
    });
    await db.socialPost.update({
      where: { id: p.id },
      data: {
        status: v.action === 'CANCEL' ? 'CANCELED' : 'DRAFT',
        version: { increment: 1 },
      },
    });
    await audit(
      db,
      actor,
      p.id,
      v.action,
      v.comment ||
        'Review withdrawn; already started publications require reconciliation.',
    );
    return;
  }
  if (!['DRAFT', 'SUBMITTED'].includes(p.status))
    throw new SocialError('Return for edits before approving a new schedule.');
  const payload = rev.payload as unknown as SocialSnapshot;
  await validateSnapshot(db, actor, payload, p.groupId);
  let scheduledAt = rev.proposedAt;
  if (v.action === 'APPROVE_NOW') scheduledAt = now;
  else if (!scheduledAt || scheduledAt < now)
    throw new SocialError(
      'The proposed time has passed. Choose a new time or explicitly approve and publish now.',
    );
  if (v.action === 'APPROVE_NOW' || rev.approvedAt || rev.invalidatedAt) {
    const next = { ...payload, proposedAt: scheduledAt!.toISOString() };
    if (
      !p.deliveries.some(
        (d) => d.revisionId === rev.id && terminal.includes(d.status),
      )
    )
      await db.socialRevision.update({
        where: { id: rev.id },
        data: { invalidatedAt: now },
      });
    rev = await db.socialRevision.create({
      data: {
        organizationId: actor.organizationId,
        postId: p.id,
        number: p.currentRevision + 1,
        payload: json(next),
        contentHash: socialHash(next),
        proposedAt: scheduledAt,
        submittedAt: now,
      },
    });
  }
  await db.socialRevision.update({
    where: { id: rev.id },
    data: {
      approvedAt: now,
      approvedByUserId: actor.userId,
      invalidatedAt: null,
    },
  });
  await db.socialPost.update({
    where: { id: p.id },
    data: {
      status: 'APPROVED',
      currentRevision: rev.number,
      version: { increment: 1 },
    },
  });
  for (const entry of payload.destinations) {
    if (
      p.deliveries.some(
        (d) =>
          d.destinationId === entry.destinationId &&
          terminal.includes(d.status),
      )
    )
      continue;
    const live = socialLivePolicy(
      actor.organizationId,
      entry.destinationId,
      now,
    );
    if (process.env.SOCIAL_LIVE_PUBLISHING_ENABLED === 'true' && !live.enabled)
      throw new SocialError(live.reason);
    if (
      live.enabled &&
      !socialTenantLivePolicy(organization.crmPreferences, now).enabled
    )
      throw new SocialError(
        'Enable the tenant live-publishing control before approving live delivery.',
      );
    const mode = entry.options?.manualInstructions?.trim()
      ? 'MANUAL'
      : live.enabled
        ? 'LIVE'
        : 'SIMULATED';
    const delivery = await db.socialDelivery.create({
      data: {
        organizationId: actor.organizationId,
        postId: p.id,
        revisionId: rev.id,
        destinationId: entry.destinationId,
        provider: entry.provider,
        externalId: entry.externalId,
        mode,
        status: mode === 'MANUAL' ? 'MANUAL_READY' : 'QUEUED',
        scheduledAt: scheduledAt!,
        nextAttemptAt: scheduledAt!,
      },
    });
    if (mode === 'MANUAL') {
      const task = await db.worklistItem.create({
        data: {
          organizationId: actor.organizationId,
          title: `Publish ${p.title} to ${entry.displayName}`,
          detail: `Ready for native completion: /social/${p.id}\n${entry.options?.manualInstructions ?? ''}\nApproved caption:\n${entry.caption}\nDownload the reviewed media from the post, finish in the native app, then record the public post link in Social Publishing.`,
          createdByUserId: actor.userId,
          assignedToUserId: actor.userId,
          submissionKey: `social-manual:${delivery.id}`,
          dueDate: new Date(
            `${formatEasternDateInputValue(scheduledAt!)}T00:00:00Z`,
          ),
          dueTimeMinutes: parseTimeInputToMinutes(
            tastingTimeValue(scheduledAt!),
          ),
        },
      });
      await db.socialDelivery.update({
        where: { id: delivery.id },
        data: { worklistItemId: task.id },
      });
    }
  }
  await audit(
    db,
    actor,
    p.id,
    v.action,
    `${v.comment || 'Exact revision approved.'} ${scheduledAt!.toISOString()}`,
  );
}
export async function retrySocialDelivery(
  db: SocialDb,
  actor: SocialActor,
  id: string,
) {
  await assertSocialActor(db, actor, true);
  const first = await db.socialDelivery.findFirst({
    where: { id, organizationId: actor.organizationId },
  });
  if (!first) throw new SocialError('Delivery unavailable.');
  await lockSocialPost(db, actor.organizationId, first.postId);
  const d = await db.socialDelivery.findUniqueOrThrow({
    where: { id },
    include: { revision: true, post: true },
  });
  if (
    !(
      ['FAILED', 'NEEDS_ATTENTION'].includes(d.status) ||
      (d.status === 'QUEUED' && !d.workflowRunId)
    ) ||
    (d.externalIds as { publicationStarted?: boolean }).publicationStarted
  )
    throw new SocialError(
      'Reconcile uncertain publication; it cannot be resent automatically.',
    );
  if (
    !d.revision.approvedAt ||
    d.revision.invalidatedAt ||
    d.post.status !== 'APPROVED' ||
    d.post.currentRevision !== d.revision.number ||
    Date.now() - d.scheduledAt.getTime() > 15 * 60_000
  )
    throw new SocialError(
      'Return for edits and explicitly approve a new time.',
    );
  await db.socialDelivery.update({
    where: { id },
    data: {
      status: 'QUEUED',
      nextAttemptAt: new Date(),
      leaseToken: null,
      leaseUntil: null,
      workflowRunId: null,
    },
  });
  await audit(
    db,
    actor,
    d.postId,
    'RETRY_REQUESTED',
    `Destination ${d.destinationId}; successful deliveries preserved.`,
  );
}
export async function confirmSocialManual(
  db: SocialDb,
  actor: SocialActor,
  raw: unknown,
) {
  await assertSocialActor(db, actor, true);
  const v = z
    .object({
      deliveryId: z.string(),
      postUrl: z
        .string()
        .url()
        .refine((s) => new URL(s).protocol === 'https:'),
      note: z.string().max(2000).optional(),
    })
    .parse(raw);
  const d = await db.socialDelivery.findFirst({
    where: { id: v.deliveryId, organizationId: actor.organizationId },
    include: { post: true, revision: true },
  });
  if (
    !d ||
    d.mode !== 'MANUAL' ||
    d.status !== 'MANUAL_READY' ||
    d.revision.invalidatedAt
  )
    throw new SocialError('Manual task is unavailable.');
  await lockSocialPost(db, actor.organizationId, d.postId);
  const fresh = await db.socialDelivery.findUniqueOrThrow({
    where: { id: d.id },
    include: { revision: true, post: true },
  });
  if (
    fresh.status !== 'MANUAL_READY' ||
    fresh.revision.invalidatedAt ||
    fresh.post.status !== 'APPROVED' ||
    fresh.post.currentRevision !== fresh.revision.number
  )
    throw new SocialError('This manual revision is no longer approved.');
  await db.socialDelivery.update({
    where: { id: d.id },
    data: {
      status: 'MANUALLY_CONFIRMED',
      postUrl: v.postUrl,
      confirmedAt: new Date(),
      detail: v.note || 'Administrator recorded completion.',
    },
  });
  if (fresh.worklistItemId)
    await db.worklistItem.updateMany({
      where: {
        organizationId: actor.organizationId,
        id: fresh.worklistItemId,
        status: { in: ['OPEN', 'IN_PROGRESS'] },
      },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        completedByUserId: actor.userId,
      },
    });
  await audit(db, actor, d.postId, 'MANUALLY_CONFIRMED', v.postUrl);
}
export async function getSocialWorkspace(db: SocialDb, actor: SocialActor) {
  const { organization } = await assertSocialActor(db, actor);
  const admin = isAdminRole(actor.role);
  const groupWhere = {
    organizationId: actor.organizationId,
    ...(!admin ? { members: { some: { userId: actor.userId } } } : {}),
  };
  const groups = await db.socialGroup.findMany({
    where: groupWhere,
    include: { members: true },
    orderBy: { label: 'asc' },
  });
  const ids = groups.map((g) => g.id);
  const [destinations, posts, media, users] = await Promise.all([
    db.socialDestination.findMany({
      where: {
        organizationId: actor.organizationId,
        ...(!admin ? { groupId: { in: ids } } : {}),
      },
      select: {
        id: true,
        organizationId: true,
        groupId: true,
        provider: true,
        externalId: true,
        displayName: true,
        handle: true,
        profileImageUrl: true,
        metadata: true,
        health: true,
        enabled: true,
        verifiedAt: true,
        credential: {
          select: {
            authorizationOwnerId: true,
            scopes: true,
            expiresAt: true,
            health: true,
          },
        },
      },
      orderBy: { displayName: 'asc' },
    }),
    db.socialPost.findMany({
      where: { organizationId: actor.organizationId, groupId: { in: ids } },
      include: {
        revisions: { orderBy: { number: 'desc' } },
        deliveries: {
          include: { attemptsLog: { orderBy: { number: 'desc' } } },
        },
        audits: { orderBy: { createdAt: 'desc' }, take: 25 },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    }),
    db.socialMedia.findMany({
      where: { organizationId: actor.organizationId, groupId: { in: ids } },
      select: {
        id: true,
        groupId: true,
        fileName: true,
        mimeType: true,
        bytes: true,
        width: true,
        height: true,
        durationSeconds: true,
        sha256: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    admin
      ? db.user.findMany({
          where: { organizationId: actor.organizationId, isActive: true },
          select: { id: true, name: true, email: true, role: true },
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([]),
  ]);
  return {
    groups,
    destinations,
    posts,
    media,
    users,
    canManage: admin,
    tenantLiveEnabled: socialTenantLivePolicy(organization.crmPreferences)
      .enabled,
  };
}

/** Readback only: this path can never construct another public post. */
export async function reconcileSocialDelivery(
  db: SocialDb,
  actor: SocialActor,
  id: string,
) {
  await assertSocialActor(db, actor, true);
  const first = await db.socialDelivery.findFirst({
    where: { id, organizationId: actor.organizationId },
  });
  if (!first) throw new SocialError('Delivery unavailable.');
  await lockSocialPost(db, actor.organizationId, first.postId);
  const d = await db.socialDelivery.findUniqueOrThrow({ where: { id } });
  if (
    !(d.externalIds as { publicationStarted?: boolean }).publicationStarted ||
    d.mode !== 'LIVE' ||
    ['PUBLISHED', 'MANUALLY_CONFIRMED', 'SIMULATED'].includes(d.status)
  )
    throw new SocialError(
      'This delivery has no uncertain live publication to reconcile.',
    );
  await db.socialDelivery.update({
    where: { id },
    data: {
      status: 'PROCESSING',
      nextAttemptAt: new Date(),
      leaseToken: null,
      leaseUntil: null,
      workflowRunId: null,
    },
  });
  await audit(
    db,
    actor,
    d.postId,
    'RECONCILE_REQUESTED',
    'Read existing provider identifiers; never resend.',
  );
}

/** Current database control is checked even by workflows pinned to an older deployment. */
export async function setSocialLiveControl(
  db: SocialDb,
  actor: SocialActor,
  enabled: boolean,
) {
  await assertSocialActor(db, actor, true);
  const control = JSON.stringify({
    liveEnabled: enabled,
    liveNotBefore: new Date().toISOString(),
  });
  await db.$executeRaw`UPDATE "Organization" SET "crmPreferences"=jsonb_set("crmPreferences",'{socialPublishing}',COALESCE("crmPreferences"->'socialPublishing','{}'::jsonb)||${control}::jsonb,true),"updatedAt"=NOW() WHERE "id"=${actor.organizationId}`;
}
export async function attestSocialBusinessAccount(
  db: SocialDb,
  actor: SocialActor,
  raw: unknown,
) {
  await assertSocialActor(db, actor, true);
  const input = z
    .object({
      destinationId: z.string(),
      evidence: z.string().trim().min(20).max(1000),
    })
    .parse(raw);
  const destination = await db.socialDestination.findFirst({
    where: {
      id: input.destinationId,
      organizationId: actor.organizationId,
      provider: 'INSTAGRAM',
      enabled: true,
    },
  });
  if (!destination)
    throw new SocialError('Select an enabled Instagram destination.');
  await db.socialDestination.update({
    where: { id: destination.id },
    data: {
      metadata: json({
        ...(destination.metadata as Record<string, unknown>),
        accountType: 'BUSINESS',
        accountTypeEvidence: {
          source: 'ADMIN_NATIVE_ACCOUNT_CHECK',
          note: input.evidence,
          userId: actor.userId,
          checkedAt: new Date().toISOString(),
        },
      }),
    },
  });
}
