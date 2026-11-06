'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireTastingActor } from '../../lib/tastings/auth';
import { saveTasting, transitionTasting, reassignTasting, TastingError } from '../../lib/tastings/service';
import type { CrmActionResult } from '../../lib/crm/actionResult';

function report(error: unknown): CrmActionResult {
  if (error instanceof TastingError) return { error: error.message };
  if (error instanceof z.ZodError) return { error: error.issues.map(item => item.message).join(' ') };
  if (error instanceof Error && /P2002|P2034|P2025/.test(error.message)) return { error: 'The tasting changed while saving. Refresh and try again.' };
  throw error;
}
function refresh(id: string) {
  revalidatePath('/tastings'); revalidatePath(`/tastings/${id}`); revalidatePath('/'); revalidatePath('/agencies/[id]', 'page');
}
export async function saveTastingAction(form: FormData): Promise<CrmActionResult> {
  const { actor } = await requireTastingActor();
  try {
    const raw = Object.fromEntries(form);
    const event = await prisma.$transaction(db => saveTasting(db, actor, { ...raw, id: String(form.get('id') || '') || undefined, agencyId: form.get('accountId') || form.get('agencyId'), version: form.get('id') ? Number(form.get('version')) : undefined }), { timeout: 15000 });
    refresh(event.id);
    return { success: 'Tasting saved.', href: `/tastings/${event.id}` };
  } catch (error) { return report(error); }
}
export async function transitionTastingAction(form: FormData): Promise<CrmActionResult> {
  const { actor } = await requireTastingActor();
  try {
    const event = await prisma.$transaction(db => transitionTasting(db, actor, { ...Object.fromEntries(form), version: Number(form.get('version')) }), { timeout: 15000 });
    refresh(event.id);
    return { success: 'Tasting updated.' };
  } catch (error) { return report(error); }
}
export async function reassignTastingAction(form: FormData): Promise<CrmActionResult> {
  const { actor } = await requireTastingActor();
  try {
    const event = await prisma.$transaction(db => reassignTasting(db, actor, {
      id: form.get('id'), version: Number(form.get('version')), assignedTasterUserId: form.get('assignedTasterUserId'),
    }), { timeout: 15000 });
    refresh(event.id);
    return { success: 'Assigned taster updated.' };
  } catch (error) { return report(error); }
}
