import { z } from 'zod';
import { assertTastingActor, lockTastings, TastingError, type TastingActor, type TastingDb } from './service';
import { tastingMinimumDays } from './model';

export async function updateTastingSpacing(db: TastingDb, actor: TastingActor, raw: unknown) {
  const input = z.object({ minimumDays: z.coerce.number().int().min(0).max(365), previousDays: z.coerce.number().int().min(0).max(365) }).parse(raw);
  await lockTastings(db, actor.organizationId);
  const { organization } = await assertTastingActor(db, actor, true);
  const previous = tastingMinimumDays(organization.settings);
  if (previous !== input.previousDays) throw new TastingError('The spacing setting changed. Reload before saving.');
  if (previous === input.minimumDays) return;
  // Update just this JSON key, preserving unrelated organization settings atomically.
  await db.$executeRaw`UPDATE "Organization" SET "settings"=jsonb_set(COALESCE("settings",'{}'::jsonb),'{tastingMinimumDays}',${String(input.minimumDays)}::jsonb), "updatedAt"=CURRENT_TIMESTAMP WHERE id=${actor.organizationId}`;
  await db.organizationAuditEvent.create({ data: { organizationId: actor.organizationId, actorUserId: actor.userId, action: 'ORGANIZATION_UPDATED', metadata: { kind: 'TASTING_SPACING_CHANGED', previousDays: previous, minimumDays: input.minimumDays } } });
}
