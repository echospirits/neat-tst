'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireSocialActor } from '../../lib/socialPublishing/access';
import { socialLocalTimestamp } from '../../lib/socialPublishing/model';
import { dispatchSocialDelivery, dispatchSocialPost } from '../../lib/socialPublishing/dispatch';
import { scheduleWorklistSync } from '../../lib/calendar/scheduleWorklistSync';
import { SocialError, setupSocialGroups, setSocialGroupAccess, assignSocialDestination, disconnectSocialDestination, saveSocialDraft, submitSocialPost, reviewSocialPost, retrySocialDelivery, reconcileSocialDelivery, confirmSocialManual, setSocialLiveControl, attestSocialBusinessAccount } from '../../lib/socialPublishing/service';
import type { ActionResult } from '../components/ActionForm';
type CrmActionResult = ActionResult & { href?: string };

function refresh(id?: string) { revalidatePath('/social'); if (id) revalidatePath(`/social/${id}`); }
async function syncSocialTasks(organizationId: string, postId: string) {
  const deliveries = await prisma.socialDelivery.findMany({ where: { organizationId, postId, worklistItemId: { not: null } }, select: { worklistItemId: true } });
  deliveries.forEach(delivery => { if (delivery.worklistItemId) scheduleWorklistSync(delivery.worklistItemId); });
}
function report(error: unknown): CrmActionResult {
  if (error instanceof z.ZodError) return { error: error.issues.map(issue => issue.message).join(' ') };
  if (error instanceof SocialError || error instanceof Error && ['SocialPublishingError', 'SocialProviderError'].includes(error.name)) return { error: error.message };
  return { error: 'Could not confirm the change. Refresh this post before trying again.' };
}
export async function setupSocialGroupsAction(): Promise<CrmActionResult> {
  const { actor } = await requireSocialActor(true);
  try { await prisma.$transaction(db => setupSocialGroups(db, actor)); refresh(); return { success: 'Brand groups created. Assign actual connected destinations and contributors next.' }; } catch (error) { return report(error); }
}
export async function setSocialGroupAccessAction(form: FormData): Promise<CrmActionResult> {
  const { actor } = await requireSocialActor(true);
  try { await prisma.$transaction(db => setSocialGroupAccess(db, actor, { groupId: String(form.get('groupId')), userId: String(form.get('userId')), enabled: form.get('enabled') === 'true' })); refresh(); return { success: 'Group access updated.' }; } catch (error) { return report(error); }
}
export async function assignSocialDestinationAction(form: FormData): Promise<CrmActionResult> {
  const { actor } = await requireSocialActor(true);
  try { await prisma.$transaction(db => assignSocialDestination(db, actor, { destinationId: String(form.get('destinationId')), groupId: String(form.get('groupId')) })); refresh(); return { success: 'Destination assigned. Existing reviewed revisions keep their exact destination IDs.' }; } catch (error) { return report(error); }
}
export async function disconnectSocialDestinationAction(form: FormData): Promise<CrmActionResult> {
  const { actor } = await requireSocialActor(true);
  try { await prisma.$transaction(db => disconnectSocialDestination(db, actor, String(form.get('destinationId')))); refresh(); return { success: 'Destination disconnected. Queued sends are blocked.' }; } catch (error) { return report(error); }
}
function easternTimestamp(value: unknown) {
  if (typeof value !== 'string' || !value) return null;
  const [date, time] = value.split('T');
  try { return socialLocalTimestamp(date, time).toISOString(); }
  catch { throw new SocialError('Choose a valid Eastern date and time. Ambiguous or unavailable daylight-saving times must be changed.'); }
}
export async function saveSocialDraftAction(form: FormData): Promise<CrmActionResult> {
  const { actor } = await requireSocialActor();
  try {
    const parsed: unknown = JSON.parse(String(form.get('payload')));
    const payload = z.object({ proposedLocal: z.string().optional(), destinations: z.array(z.record(z.unknown())) }).passthrough().parse(parsed);
    const { proposedLocal, ...rest } = payload;
    const destinations = payload.destinations.map(destination => {
      const event = destination.event && typeof destination.event === 'object' ? destination.event as Record<string, unknown> : null;
      return { ...destination, ...(event ? { event: { title: event.title, startAt: easternTimestamp(event.startLocal), endAt: easternTimestamp(event.endLocal) } } : {}) };
    });
    const post = await prisma.$transaction(db => saveSocialDraft(db, actor, { ...rest, proposedAt: easternTimestamp(proposedLocal), destinations }), { timeout: 15000 });
    refresh(post.id);
    await syncSocialTasks(actor.organizationId, post.id);
    return { success: 'Draft saved. Submit this revision for approval when ready.', href: `/social/${post.id}` };
  } catch (error) { return report(error); }
}
export async function submitSocialPostAction(form: FormData): Promise<CrmActionResult> {
  const { actor } = await requireSocialActor();
  try { const id = String(form.get('id')); await prisma.$transaction(db => submitSocialPost(db, actor, { id, version: Number(form.get('version')) })); refresh(id); return { success: 'Revision submitted for review.' }; } catch (error) { return report(error); }
}
export async function reviewSocialPostAction(form: FormData): Promise<CrmActionResult> {
  const { actor } = await requireSocialActor(true);
  try {
    const action = z.enum(['RETURN', 'CANCEL', 'APPROVE_SCHEDULE', 'APPROVE_NOW']).parse(form.get('action'));
    const id = String(form.get('id'));
    await prisma.$transaction(db => reviewSocialPost(db, actor, { id, version: Number(form.get('version')), action, comment: String(form.get('comment') || '') }), { timeout: 15000 });
    refresh(id);
    await syncSocialTasks(actor.organizationId, id);
    if (action === 'APPROVE_SCHEDULE' || action === 'APPROVE_NOW') {
      try { await dispatchSocialPost(id); }
      catch (error) { return { ...report(error), refresh: true }; }
    }
    return { success: action === 'CANCEL' ? 'Pending sends canceled. Started sends will be reconciled.' : action === 'RETURN' ? 'Returned for edits.' : 'Exact revision approved and queued. Results appear for each destination.' };
  } catch (error) { return report(error); }
}
export async function retrySocialDeliveryAction(form: FormData): Promise<CrmActionResult> {
  const { actor } = await requireSocialActor(true);
  try { const deliveryId = String(form.get('deliveryId')); await prisma.$transaction(db => retrySocialDelivery(db, actor, deliveryId)); refresh(String(form.get('postId'))); await dispatchSocialDelivery(deliveryId); return { success: 'Eligible delivery queued for retry. Successful destinations are preserved.' }; } catch (error) { return { ...report(error), refresh: true }; }
}
export async function confirmSocialManualAction(form: FormData): Promise<CrmActionResult> {
  const { actor } = await requireSocialActor(true);
  try { const deliveryId = String(form.get('deliveryId')); await prisma.$transaction(db => confirmSocialManual(db, actor, { deliveryId, postUrl: String(form.get('postUrl') || ''), note: String(form.get('note') || '') })); const delivery = await prisma.socialDelivery.findFirst({ where: { id: deliveryId, organizationId: actor.organizationId }, select: { postId: true } }); if (delivery) { refresh(delivery.postId); await syncSocialTasks(actor.organizationId, delivery.postId); } return { success: 'Manual completion recorded.' }; } catch (error) { return report(error); }
}
export async function reconcileSocialDeliveryAction(form: FormData): Promise<CrmActionResult> {
  const { actor } = await requireSocialActor(true);
  try { const deliveryId = String(form.get('deliveryId')); await prisma.$transaction(db => reconcileSocialDelivery(db, actor, deliveryId)); refresh(String(form.get('postId'))); await dispatchSocialDelivery(deliveryId); return { success: 'Existing provider identifiers queued for readback. This action cannot send a new post.' }; } catch (error) { return { ...report(error), refresh: true }; }
}
export async function setSocialLiveControlAction(form: FormData): Promise<CrmActionResult> {
  const { actor } = await requireSocialActor(true);
  try { const enabled = form.get('enabled') === 'true'; await prisma.$transaction(db => setSocialLiveControl(db, actor, enabled)); refresh(); return { success: enabled ? 'Tenant live control enabled. Explicit destination/environment gates and a new exact administrator approval are still required.' : 'Tenant live publishing paused. Pending live sends are blocked; started publications still require result reconciliation.' }; } catch (error) { return report(error); }
}
export async function attestSocialBusinessAccountAction(form: FormData): Promise<CrmActionResult> {
  const { actor } = await requireSocialActor(true);
  try { await prisma.$transaction(db => attestSocialBusinessAccount(db, actor, { destinationId: String(form.get('destinationId')), evidence: String(form.get('evidence') || '') })); refresh(); return { success: 'Native Business-account check recorded. Story publication is still unverified until an authorized live test succeeds.' }; } catch (error) { return report(error); }
}
