'use server';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireUserSession } from '../../../lib/auth';
import { isAdminRole } from '../../../lib/userAccess';
import { requireProductionForecastContext } from '../../../lib/productionForecasting/access';
import { importProductionSource, type SourceKind } from '../../../lib/productionForecasting/import';
import { refreshProductionForecast } from '../../../lib/productionForecasting/service';
export type ImportState = { ok: boolean; message: string };
export async function importForecastSource(form: FormData): Promise<ImportState> {
  const { user } = await requireUserSession();
  if (!isAdminRole(user.role)) notFound();
  const requestedOrganization = String(form.get('organizationId') ?? '').trim();
  // Imports must name the organization shown on the form. A stale or forged
  // target cannot fall back to another tenant, even for a platform admin.
  if (!requestedOrganization) notFound();
  const context = await requireProductionForecastContext(user, requestedOrganization || undefined);
  if (!context.organization) notFound();
  const organizationId = context.organization.id;
  const file = form.get('file');
  if (!(file instanceof File) || !file.size || file.size > 8 * 1024 * 1024) return { ok: false, message: 'Choose a source CSV or TSV file up to 8 MiB.' };
  const field = (name: string) => String(form.get(name) ?? '').trim();
  try {
    const result = await importProductionSource(await file.text(), { organizationId, market: 'OH', source: field('source') as SourceKind, start: field('start'), end: field('end'), observedOn: field('observedOn'), complete: form.get('complete') === 'on' });
    revalidatePath('/analytics/production');
    // Refresh failure must not misreport a successfully committed import.
    try { await refreshProductionForecast(organizationId); }
    catch { return { ok: true, message: `${result.rowCount} source rows saved (${result.excludedRows} excluded). Forecast refresh is pending; the daily job will retry.` }; }
    revalidatePath('/analytics/production', 'layout');
    return { ok: true, message: `${result.replay ? 'Already imported' : 'Imported'}: ${result.rowCount} rows, ${result.excludedRows} excluded. Forecast snapshot is ready.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    // Parser validation is intentionally user-readable; database errors stay private.
    return { ok: false, message: /^(Row |Native source|Normalized CSV|CSV |Choose |A complete|Confirm |Every item|This product|Unknown classification|A valid|This market)/.test(message) ? message : 'Import could not be saved. Existing complete source data is preserved. Check the file and retry.' };
  }
}
