'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '../../../../lib/auth';
import {
  mergeWholesaleAccounts,
  WholesaleMergeError,
  type WholesaleMergeErrorCode,
} from '../../../../lib/wholesaleAccountMerge';

const toRequired = (value: FormDataEntryValue | null) => String(value ?? '').trim();

export async function mergeWholesaleAccountAction(formData: FormData) {
  const user = await requireAdmin();
  const sourceId = toRequired(formData.get('sourceId'));
  const targetId = toRequired(formData.get('targetId'));
  const confirmation = toRequired(formData.get('confirmation'));

  if (!sourceId || !targetId || confirmation !== 'MERGE') {
    redirect(
      `/wholesale/${sourceId || 'unknown'}/merge?targetId=${encodeURIComponent(targetId)}&status=confirmation-required`,
    );
  }

  try {
    await mergeWholesaleAccounts({ mergedByUserId: user.id, sourceId, targetId });
  } catch (error) {
    if (!(error instanceof WholesaleMergeError)) throw error;
    const status: WholesaleMergeErrorCode = error.code;
    redirect(`/wholesale/${sourceId}/merge?targetId=${encodeURIComponent(targetId)}&status=${status}`);
  }

  revalidatePath('/wholesale');
  revalidatePath('/visits');
  revalidatePath('/visits/new');
  revalidatePath('/alerts');
  revalidatePath('/my-week');
  revalidatePath(`/wholesale/${sourceId}`);
  revalidatePath(`/wholesale/${targetId}`);
  redirect(`/wholesale/${targetId}?status=merged`);
}
