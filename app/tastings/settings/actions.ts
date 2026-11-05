'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { requireTastingActor } from '../../../lib/tastings/auth';
import { TastingError } from '../../../lib/tastings/service';
import { updateTastingSpacing } from '../../../lib/tastings/settings';
import type { CrmActionResult } from '../../../lib/crm/actionResult';
export async function saveTastingSpacing(form: FormData): Promise<CrmActionResult> {
  const { actor } = await requireTastingActor();
  try {
    await prisma.$transaction(db => updateTastingSpacing(db, actor, Object.fromEntries(form)));
    revalidatePath('/tastings/settings');
    return { success: 'Tasting spacing saved.' };
  } catch (error) {
    if (error instanceof TastingError) return { error: error.message };
    if (error instanceof z.ZodError) return { error: 'Choose a whole number from 0 to 365 days.' };
    throw error;
  }
}
