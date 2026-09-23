'use server';

import { WorklistCategory, WorklistSource, WorklistStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { getUserDisplayName, requireUser } from '../../lib/auth';
import { parseTimeInputToMinutes } from '../../lib/dateTime';
import { scheduleWorklistSync } from '../../lib/calendar/scheduleWorklistSync';
import { requireOrganizationContext } from '../../lib/organizations';
import { prisma } from '../../lib/prisma';
import { getWorklistCategoryForLocationSelection } from '../../lib/worklistLocations';

export type SchedulerActionResult = { error: string } | { success: string };

const activeStatuses = [WorklistStatus.OPEN, WorklistStatus.IN_PROGRESS];

const toOptional = (value: FormDataEntryValue | null | undefined) => {
  const text = String(value ?? '').trim();
  return text || null;
};

const parseDateOnly = (value: FormDataEntryValue | null | undefined) => {
  const text = toOptional(value);
  if (!text) return { date: null, error: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return { date: null, error: 'Choose a valid date.' };
  const date = new Date(`${text}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    return { date: null, error: 'Choose a valid date.' };
  }
  return { date, error: null };
};

const parseDueTime = (value: FormDataEntryValue | null | undefined, hasDate: boolean) => {
  const text = toOptional(value);
  if (!text) return { minutes: null, error: null };
  if (!hasDate) return { minutes: null, error: 'Choose a date before adding a time.' };
  const minutes = parseTimeInputToMinutes(text);
  return minutes === null
    ? { minutes: null, error: 'Enter a valid time.' }
    : { minutes, error: null };
};

const revalidateScheduler = () => {
  revalidatePath('/');
  revalidatePath('/my-week');
  revalidatePath('/alerts');
};

export async function updateSchedulerWorklistItem(formData: FormData): Promise<SchedulerActionResult> {
  const currentUser = await requireUser();
  const { organizationId } = await requireOrganizationContext(currentUser);
  const id = toOptional(formData.get('id'));
  if (!id) return { error: 'This task is missing. Refresh the schedule.' };

  const parsedDate = parseDateOnly(formData.get('dueDate'));
  if (parsedDate.error) return { error: parsedDate.error };
  const parsedTime = parseDueTime(formData.get('dueTime'), Boolean(parsedDate.date));
  if (parsedTime.error) return { error: parsedTime.error };

  const owned = await prisma.worklistItem.findFirst({
    where: { id, organizationId, status: { in: activeStatuses } },
    select: { id: true },
  });
  if (!owned) return { error: 'This task is no longer active in your organization. Refresh the schedule.' };

  const data: {
    dueDate: Date | null;
    dueTimeMinutes: number | null;
    assignedToUserId?: string | null;
    assignedTo?: string | null;
  } = { dueDate: parsedDate.date, dueTimeMinutes: parsedDate.date ? parsedTime.minutes : null };

  if (formData.has('assignedToUserId')) {
    const assignedToUserId = toOptional(formData.get('assignedToUserId'));
    const assignedUser = assignedToUserId
      ? await prisma.user.findFirst({
          where: { id: assignedToUserId, organizationId, isActive: true, role: { notIn: ['TASTER', 'PLATFORM_ADMIN'] } },
          select: { id: true, email: true, firstName: true, lastName: true, name: true },
        })
      : null;
    if (assignedToUserId && !assignedUser) return { error: 'Choose an active team member or Unassigned.' };
    data.assignedToUserId = assignedUser?.id ?? null;
    data.assignedTo = assignedUser ? getUserDisplayName(assignedUser) : null;
  }

  await prisma.worklistItem.update({ where: { id: owned.id }, data });
  scheduleWorklistSync(owned.id);
  revalidateScheduler();
  return { success: 'Worklist schedule saved.' };
}

export async function completeSchedulerWorklistItem(formData: FormData): Promise<SchedulerActionResult> {
  const currentUser = await requireUser();
  const { organizationId } = await requireOrganizationContext(currentUser);
  const id = toOptional(formData.get('id'));
  if (!id) return { error: 'This task is missing. Refresh the schedule.' };

  const owned = await prisma.worklistItem.findFirst({
    where: { id, organizationId, status: { in: activeStatuses } },
    select: { id: true },
  });
  if (!owned) return { error: 'This task is no longer active in your organization. Refresh the schedule.' };

  await prisma.worklistItem.update({
    where: { id: owned.id },
    data: {
      status: WorklistStatus.COMPLETED,
      completedAt: new Date(),
      completedByUserId: currentUser.id,
    },
  });
  scheduleWorklistSync(owned.id);
  revalidateScheduler();
  return { success: 'Task completed.' };
}

export async function createSchedulerWorklistItem(formData: FormData): Promise<SchedulerActionResult> {
  const currentUser = await requireUser();
  const { organizationId } = await requireOrganizationContext(currentUser);
  const title = toOptional(formData.get('title'));
  if (!title) return { error: 'Enter a task title.' };

  const requestedCategory = String(formData.get('category') ?? WorklistCategory.GENERAL);
  if (!Object.values(WorklistCategory).includes(requestedCategory as WorklistCategory)) {
    return { error: 'Choose a valid task category.' };
  }
  const agencyId = toOptional(formData.get('agencyId'));
  const wholesaleAccountId = toOptional(formData.get('wholesaleAccountId'));
  if (agencyId && wholesaleAccountId) return { error: 'Choose one account for this task.' };
  if (agencyId && !await prisma.agency.findUnique({ where: { id: agencyId }, select: { id: true } })) {
    return { error: 'That agency is no longer available. Search and choose it again.' };
  }
  if (wholesaleAccountId && !await prisma.wholesaleAccount.findFirst({
    where: { id: wholesaleAccountId, isActive: true },
    select: { id: true },
  })) {
    return { error: 'That wholesale account is no longer available. Search and choose it again.' };
  }

  const category = getWorklistCategoryForLocationSelection(
    requestedCategory as WorklistCategory,
    agencyId,
    wholesaleAccountId,
  );
  if (agencyId && category !== WorklistCategory.AGENCY) return { error: 'Choose the Agency category for this account.' };
  if (wholesaleAccountId && category !== WorklistCategory.WHOLESALE) return { error: 'Choose the Wholesale category for this account.' };

  const parsedDate = parseDateOnly(formData.get('dueDate'));
  if (parsedDate.error) return { error: parsedDate.error };
  const parsedTime = parseDueTime(formData.get('dueTime'), Boolean(parsedDate.date));
  if (parsedTime.error) return { error: parsedTime.error };

  const assignedToUserId = toOptional(formData.get('assignedToUserId'));
  const assignedUser = assignedToUserId
    ? await prisma.user.findFirst({
        where: { id: assignedToUserId, organizationId, isActive: true, role: { notIn: ['TASTER', 'PLATFORM_ADMIN'] } },
        select: { id: true, email: true, firstName: true, lastName: true, name: true },
      })
    : null;
  if (assignedToUserId && !assignedUser) return { error: 'Choose an active team member or Unassigned.' };

  const item = await prisma.worklistItem.create({
    data: {
      organizationId,
      title,
      detail: toOptional(formData.get('detail')),
      status: WorklistStatus.OPEN,
      source: WorklistSource.MANUAL,
      category,
      agencyId: category === WorklistCategory.AGENCY ? agencyId : null,
      wholesaleAccountId: category === WorklistCategory.WHOLESALE ? wholesaleAccountId : null,
      dueDate: parsedDate.date,
      dueTimeMinutes: parsedDate.date ? parsedTime.minutes : null,
      assignedToUserId: assignedUser?.id ?? null,
      assignedTo: assignedUser ? getUserDisplayName(assignedUser) : null,
      createdByUserId: currentUser.id,
      createdBy: getUserDisplayName(currentUser),
    },
    select: { id: true },
  });
  scheduleWorklistSync(item.id);
  revalidateScheduler();
  return { success: 'Worklist task created.' };
}
