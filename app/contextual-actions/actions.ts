'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '../../lib/auth';
import { scheduleWorklistSync } from '../../lib/calendar/scheduleWorklistSync';
import { createAccountFollowUp, FollowUpError } from '../../lib/contextualFollowUp';
import { normalizeCRMActionContext } from '../../lib/crmActionContext';
import { parseTimeInputToMinutes } from '../../lib/dateTime';
import { prisma } from '../../lib/prisma';
import { requireOrganizationContext } from '../../lib/organizations';

export type ContextualActionResult = { ok: boolean; message: string };

const optional = (value: FormDataEntryValue | null) => String(value ?? '').trim() || null;
const dateOnly = (value: FormDataEntryValue | null) => {
  const raw = optional(value);
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export async function createContextualFollowUp(formData: FormData): Promise<ContextualActionResult> {
  const user = await requireUser();
  const { organizationId } = await requireOrganizationContext(user);
  const context = normalizeCRMActionContext({
    agencyId: optional(formData.get('agencyId')),
    wholesaleAccountId: optional(formData.get('wholesaleAccountId')),
    opportunityId: optional(formData.get('opportunityId')),
    agencyProductIntelligenceId: optional(formData.get('agencyProductIntelligenceId')),
    productItemCode: optional(formData.get('productItemCode')),
    productName: optional(formData.get('productName')),
    sourceType: optional(formData.get('sourceType')),
    sourceLabel: optional(formData.get('sourceLabel')),
    reason: optional(formData.get('reason')),
    returnTo: optional(formData.get('returnTo')),
  });
  const title = optional(formData.get('title'))?.slice(0, 200);
  const submissionKey = optional(formData.get('submissionKey'));
  if (!title || !submissionKey || (!context.agencyId && !context.wholesaleAccountId)) {
    return { ok: false, message: 'The account, title, and request key are required.' };
  }

  let item;
  try {
    item = await prisma.$transaction(db => createAccountFollowUp(db, {
      organizationId, user, context, title, submissionKey,
      assignedToUserId: optional(formData.get('assignedToUserId')),
      dueDate: dateOnly(formData.get('dueDate')), dueTimeMinutes: parseTimeInputToMinutes(formData.get('dueTime')),
      note: optional(formData.get('note')),
    }));
  } catch (error) {
    if (error instanceof FollowUpError) return { ok: false, message: error.message };
    throw error;
  }
  scheduleWorklistSync(item.id);

  for (const path of ['/alerts', '/my-week', '/', context.returnTo].filter(Boolean) as string[]) revalidatePath(path);
  if (context.agencyId) revalidatePath(`/agencies/${context.agencyId}`);
  if (context.wholesaleAccountId) revalidatePath(`/wholesale/${context.wholesaleAccountId}`);
  revalidatePath('/opportunities');
  revalidatePath('/agency-focus');
  return { ok: true, message: 'Follow-up created.' };
}
