import { start } from 'workflow/api';
import { prisma } from '../prisma';
import { socialPublishingWorkflow } from './workflow';
import { lockSocialPost, SocialError } from './service';
const active = ['QUEUED', 'RETRY', 'UPLOADING', 'PROCESSING', 'ACCEPTED'];
/** Await platform enqueue before reporting scheduling success. Duplicate starts still share the DB claim. */
export async function dispatchSocialDelivery(
  deliveryId: string,
): Promise<void> {
  const delivery = await prisma.socialDelivery.findUnique({
    where: { id: deliveryId },
  });
  if (
    !delivery ||
    delivery.mode === 'MANUAL' ||
    !active.includes(delivery.status)
  )
    return;
  if (process.env.SOCIAL_JOBS_ENABLED !== 'true') {
    await prisma.socialDelivery.updateMany({
      where: { id: deliveryId, status: { in: active }, startedAt: null },
      data: {
        status: 'NEEDS_ATTENTION',
        detail:
          'Revision approved, but scheduling is disabled. Enable SOCIAL_JOBS_ENABLED and explicitly retry within the late-job limit, or choose a new time.',
      },
    });
    throw new SocialError(
      'Revision approved, but scheduling is disabled. Enable SOCIAL_JOBS_ENABLED and explicitly retry this delivery, or approve a new time.',
    );
  }
  try {
    await prisma.$transaction(
      async (tx) => {
        await lockSocialPost(tx, delivery.organizationId, delivery.postId);
        const fresh = await tx.socialDelivery.findUniqueOrThrow({
          where: { id: deliveryId },
        });
        if (fresh.workflowRunId || !active.includes(fresh.status)) return;
        const run = await start(socialPublishingWorkflow, [
          deliveryId,
          fresh.nextAttemptAt.toISOString(),
        ]);
        await tx.socialDelivery.update({
          where: { id: deliveryId },
          data: {
            workflowRunId: run.runId,
            detail:
              'Durable workflow enqueued; per-destination result pending.',
          },
        });
      },
      { timeout: 15000 },
    );
  } catch {
    await prisma.socialDelivery.updateMany({
      where: { id: deliveryId, status: { in: active }, startedAt: null },
      data: {
        detail:
          'Workflow dispatch could not be confirmed. Retry scheduling; database claiming prevents duplicate sends.',
      },
    });
    throw new SocialError(
      'Approval saved, but durable scheduling could not be confirmed. Retry this delivery before its late-job limit.',
    );
  }
}
export async function dispatchSocialPost(postId: string): Promise<void> {
  const deliveries = await prisma.socialDelivery.findMany({
    where: { postId, mode: { not: 'MANUAL' }, status: { in: active } },
    select: { id: true },
  });
  const results = await Promise.allSettled(
    deliveries.map((d) => dispatchSocialDelivery(d.id)),
  );
  const failed = results.find((v) => v.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
}
/** Daily safety net for an interrupted commit/enqueue boundary. Never sends stale posts. */
export async function recoverSocialDispatches() {
  if (process.env.SOCIAL_JOBS_ENABLED !== 'true')
    return { disabled: true, dispatched: 0 };
  const deliveries = await prisma.socialDelivery.findMany({
    where: {
      organizationId: 'org_echo_spirits',
      workflowRunId: null,
      mode: { not: 'MANUAL' },
      status: { in: active },
    },
    select: { id: true, scheduledAt: true, startedAt: true },
    take: 100,
    orderBy: { scheduledAt: 'asc' },
  });
  let dispatched = 0;
  for (const d of deliveries) {
    if (!d.startedAt && Date.now() - d.scheduledAt.getTime() > 15 * 60_000) {
      await prisma.socialDelivery.updateMany({
        where: { id: d.id, startedAt: null, status: { in: active } },
        data: {
          status: 'NEEDS_ATTENTION',
          detail:
            'Scheduling recovery found a job more than 15 minutes late. Explicitly approve a new time.',
        },
      });
      continue;
    }
    try {
      await dispatchSocialDelivery(d.id);
      dispatched++;
    } catch {
      /* The saved delivery exposes actionable dispatch diagnostics. */
    }
  }
  return { disabled: false, dispatched };
}
