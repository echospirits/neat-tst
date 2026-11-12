import { sleep } from 'workflow';

/** The platform persists sleeps and step results; no browser or process timer is involved. */
export async function socialPublishingWorkflow(deliveryId: string, at: string) {
  'use workflow';
  await sleep(new Date(at));
  for (let poll = 0; poll < 70; poll++) {
    const next = await executeSocialDeliveryStep(deliveryId);
    if (!next) return;
    await sleep(new Date(next));
  }
  await stopSocialDeliveryStep(deliveryId);
}
async function executeSocialDeliveryStep(
  deliveryId: string,
): Promise<string | null> {
  'use step';
  const { prisma } = await import('../prisma');
  const { processSocialDelivery } = await import('./worker');
  const active = ['QUEUED', 'RETRY', 'UPLOADING', 'PROCESSING', 'ACCEPTED'];
  if (process.env.SOCIAL_JOBS_ENABLED !== 'true') {
    await prisma.socialDelivery.updateMany({
      where: { id: deliveryId, status: { in: active }, startedAt: null },
      data: {
        status: 'NEEDS_ATTENTION',
        detail: 'Scheduling paused. Review and approve a new publication time.',
      },
    });
    return null;
  }
  await processSocialDelivery(prisma, deliveryId);
  const delivery = await prisma.socialDelivery.findUnique({
    where: { id: deliveryId },
    select: { status: true, nextAttemptAt: true, leaseUntil: true },
  });
  if (!delivery || !active.includes(delivery.status)) return null;
  return new Date(
    Math.max(
      delivery.nextAttemptAt.getTime(),
      delivery.leaseUntil?.getTime() ?? 0,
      Date.now() + 10_000,
    ),
  ).toISOString();
}
async function stopSocialDeliveryStep(deliveryId: string) {
  'use step';
  const { prisma } = await import('../prisma');
  await prisma.socialDelivery.updateMany({
    where: {
      id: deliveryId,
      status: {
        in: ['QUEUED', 'RETRY', 'UPLOADING', 'PROCESSING', 'ACCEPTED'],
      },
    },
    data: {
      status: 'NEEDS_ATTENTION',
      detail:
        'Processing exceeded the bounded workflow window. Reconcile the recorded identifiers.',
    },
  });
}
