'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '../../../lib/auth';
import { importTargetAccountWorkbook } from '../../../lib/targetAccountIntelligence';

const getWorkbookFile = (formData: FormData) => {
  const file = formData.get('workbook');

  return file instanceof File && file.size > 0 ? file : null;
};

export async function uploadTargetAccountWorkbook(formData: FormData) {
  const user = await requireAdmin();
  const mode = String(formData.get('mode') ?? 'dry-run');
  const returnTo = String(formData.get('returnTo') ?? 'target-import');
  const redirectWithStatus = (status: string, importId?: string): never => {
    const isDataStatusReturn = returnTo === 'data-status';
    const query = new URLSearchParams({
      [isDataStatusReturn ? 'targetStatus' : 'status']: status,
    });

    if (importId) query.set(isDataStatusReturn ? 'targetImportId' : 'importId', importId);

    redirect(`${isDataStatusReturn ? '/admin/data-status' : '/admin/target-import'}?${query.toString()}`);
  };
  const file = getWorkbookFile(formData);

  if (!file) {
    redirectWithStatus('missing-file');
  }

  const workbookFile = file as File;

  if (!workbookFile.name.toLowerCase().endsWith('.xlsx')) {
    redirectWithStatus('invalid-file');
  }

  const buffer = Buffer.from(await workbookFile.arrayBuffer());
  const result = await importTargetAccountWorkbook({
    buffer,
    dryRun: mode !== 'commit',
    filename: workbookFile.name,
    importedByUserId: user.id,
  });

  revalidatePath('/admin/target-import');
  revalidatePath('/admin/data-status');
  revalidatePath('/targets');
  revalidatePath('/targets/dashboard');
  redirectWithStatus(result.status.toLowerCase(), result.importId);
}
