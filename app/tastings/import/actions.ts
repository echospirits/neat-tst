'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '../../../lib/prisma';
import { requireTastingActor } from '../../../lib/tastings/auth';
import { previewTastingImport, importTastings, type TastingImportPreview } from '../../../lib/tastings/import';
import { parseTastingCsv } from '../../../lib/tastings/csv';
import { TastingError } from '../../../lib/tastings/service';

export type TastingImportResult = { error?: string; preview?: TastingImportPreview[]; created?: number; skipped?: number; review?: number };
export async function tastingImportAction(form: FormData): Promise<TastingImportResult> {
  const { actor, coordinator } = await requireTastingActor();
  if (!coordinator) return { error: 'Administrator access required.' };
  try {
    const rows = parseTastingCsv(String(form.get('csv') ?? ''));
    const sourceKey = String(form.get('sourceKey') ?? '').trim();
    if (!sourceKey || sourceKey.length > 200) return { error: 'Supply a stable source key for this schedule export.' };
    if (form.get('mode') !== 'import') return { preview: await previewTastingImport(prisma, actor, rows) };
    const result = await prisma.$transaction(db => importTastings(db, actor, rows, sourceKey), { timeout: 60000 });
    revalidatePath('/tastings'); revalidatePath('/');
    return { created: result.created, skipped: result.skipped, review: result.review, preview: result.preview };
  } catch (error) {
    if (error instanceof TastingError) return { error: error.message };
    throw error;
  }
}
