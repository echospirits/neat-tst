import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '../../components/PageChrome';
import { requireTastingActor } from '../../../lib/tastings/auth';
import { getTasting, tastingEditorOptions } from '../../../lib/tastings/queries';
import { deriveTastingStatus, isTerminalTasting, TASTING_STATUS_LABELS, tastingExecutionStatus } from '../../../lib/tastings/model';
import { formatDateOnly, formatEasternDateTime, formatEasternDateInputValue, getZonedDateTimeParts } from '../../../lib/dateTime';
import { getUserDisplayName } from '../../../lib/auth';
import { getDirectionsHref } from '../../../lib/crmActionContext';
import { prisma } from '../../../lib/prisma';
import { refreshTastingSales } from '../../../lib/tastings/sales';
import { TastingEditor } from '../TastingEditor';
import { TastingWorkflow } from '../TastingWorkflow';
import { TastingStatusSelect } from '../TastingStatusSelect';
import { tastingStatusControlData } from '../../../lib/tastings/statusActions';
import { VisitPhotoGallery } from '../../visits/VisitPhotoGallery';

export const dynamic = 'force-dynamic';
function timeInput(date: Date) { const parts = getZonedDateTimeParts(date); return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`; }
const historyLabels: Record<string, string> = { WORKFLOW_STATUS_CHANGED: 'Workflow status changed', WORKFLOW_STATUS_RESET: 'Manual status reset after schedule change', DRAFT_CREATED: 'Draft created', TASTER_APPROVED: 'Taster approved', TASTER_NEEDS_EDIT: 'Taster needs edit', AGENCY_APPROVAL_REQUESTED: 'Agency approval requested', AGENCY_APPROVED: 'Agency approved', AGENCY_DENIED: 'Agency denied', SUBMITTED_TO_STATE: 'Submitted to state', STATE_APPROVED: 'State approved', STATE_DENIED: 'State denied', CANCELLED: 'Cancelled', SCHEDULE_CHANGED: 'Date / time changed', TASTER_REASSIGNED: 'Taster reassigned', AGENCY_CHANGED: 'Agency changed', APPROVALS_INVALIDATED: 'Approvals require review', TASTING_COMPLETED: 'Completed through Log Visit', FEEDBACK_UPDATED: 'Feedback updated', SPACING_OVERRIDE: 'Spacing override', IMPORTED: 'Imported from schedule', SALES_OUTCOME_UPDATED: 'Retail sales outcome updated' };
export default async function TastingDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string; returnTo?: string; notice?: string }> }) {
  const { actor, user, coordinator } = await requireTastingActor();
  const { id } = await params;
  const query = await searchParams;
  let event = await getTasting(actor, id);
  if (!event) notFound();
  // Authorization precedes reconciliation; unrelated tenant IDs never reach the sales service.
  let salesRefreshFailed = false;
  try { await refreshTastingSales(prisma, actor.organizationId, id); }
  catch { salesRefreshFailed = true; }
  event = await getTasting(actor, id);
  if (!event) notFound();
  const terminal = isTerminalTasting(event);
  const editing = coordinator && query.edit === '1' && !terminal;
  const users = editing ? await tastingEditorOptions(actor) : [];
  const back = query.returnTo?.startsWith('/') && !query.returnTo.startsWith('//') && !query.returnTo.includes('\\') ? query.returnTo : '/tastings';
  const status = TASTING_STATUS_LABELS[deriveTastingStatus(event)];
  const assigned = event.assignedTasterUserId === user.id;
  const execution = tastingExecutionStatus(event);
  const date = event.scheduledDate.toISOString().slice(0, 10);
  const canLog = assigned && !event.completedAt && !['CANCELLED', 'DENIED'].includes(execution) && date === formatEasternDateInputValue();
  const visitHref = `/visits/new?${new URLSearchParams({ tastingId: event.id, type: 'agency', agencyId: event.agencyId, returnTo: `/tastings/${event.id}` })}`;
  const address = [event.agency.address, event.agency.city, event.agency.state, event.agency.zip].filter(Boolean).join(', ');
  const directions = getDirectionsHref(address);
  const actorIds = Array.from(new Set(event.history.map(entry => entry.actorUserId).filter((value): value is string => Boolean(value))));
  const actors = await prisma.user.findMany({ where: { organizationId: actor.organizationId, id: { in: actorIds } }, select: { id: true, name: true, firstName: true, lastName: true, email: true } });
  const names = new Map(actors.map(actor => [actor.id, getUserDisplayName(actor)]));
  const workflowProps = { id, version: event.version, coordinator, assigned, terminal, completed: Boolean(event.completedAt), tasterResponse: event.tasterResponse, agencyApproval: event.agencyApproval, stateApproval: event.stateApproval, emailsGathered: event.emailsGathered, postEventNotes: event.postEventNotes, tasterFeedback: event.tasterFeedback };
  return <div className="tastings-page">
    <Link className="tasting-back" href={back}>Back to tastings</Link>
    <PageHeader title={event.agency.name} meta={`Agency ${event.agency.agencyId} · ${status}`} actions={<>{canLog ? <Link className="btn" href={visitHref}>Log Tasting Visit</Link> : null}{coordinator && !terminal ? <Link className="btn secondary" href={`/tastings/${id}${editing ? '' : '?edit=1'}`}>{editing ? 'Close editor' : 'Edit tasting'}</Link> : null}</>} />
    {query.notice === 'visit-completed' && event.completedAt && event.completedVisitId ? <p className="tasting-notice" role="status">Tasting completed. Visit and photo saved.</p> : query.notice === 'visit-needs-review' ? <p className="tasting-notice" role="alert">The schedule changed while the photo was uploading. Your visit was saved; the coordinator needs to review the link.</p> : null}
    <section className="tasting-facts" aria-label="Tasting details"><div><strong>{formatDateOnly(event.scheduledDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</strong><span>{formatEasternDateTime(event.startsAt, { hour: 'numeric', minute: '2-digit' })}–{formatEasternDateTime(event.endsAt, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}</span></div><div><span className="muted">Assigned taster</span><strong>{event.assignedTaster ? getUserDisplayName(event.assignedTaster) : 'Needs identity review'}</strong></div><div><span className="muted">Store contact</span><strong>{event.contact?.name ?? 'Not recorded'}</strong>{event.contact?.phone ? <a href={`tel:${event.contact.phone}`}>{event.contact.phone}</a> : null}</div><div><span className="muted">Execution</span><strong>{execution === 'VISIT_NOT_LOGGED' ? 'Visit Not Logged · Needs Review' : execution === 'COMPLETED' ? 'Completed with Visit + photo' : execution === 'MANUALLY_COMPLETED' ? 'Completed manually · Visit not logged' : execution === 'SCHEDULED' ? 'Scheduled · Visit not logged' : execution === 'DENIED' ? 'Denied' : 'Cancelled'}</strong>{event.completedAt ? <span>{formatEasternDateTime(event.completedAt)}</span> : null}</div></section>
    {!editing ? <section className="tasting-next"><h2>Status</h2><TastingStatusSelect tasting={tastingStatusControlData(event)} currentUserId={user.id} coordinator={coordinator} label={event.agency.name} />{event.workflowStatusOverride ? <p className="field-note">Status set manually. Recorded approvals and Visit evidence are retained.</p> : null}</section> : null}
    <div className="tasting-inline-actions"><Link className="btn secondary" href={`/agencies/${event.agencyId}`}>Open Agency</Link>{directions ? <a className="btn secondary" href={directions} target="_blank" rel="noreferrer">Directions</a> : null}{event.completedVisitId ? <a href="#tasting-visit-evidence">View Visit evidence</a> : null}</div>
    {address ? <p className="muted">{address}</p> : null}
    {event.importNeedsReview ? <p className="tasting-notice" role="status">Imported proposal needs review. Resolve the taster identity and verify its schedule before proceeding.</p> : null}
    {event.tasterNotes ? <section className="tasting-notes"><h2>Notes for taster</h2><p>{event.tasterNotes}</p></section> : null}
    {event.tasterResponseComment ? <section className="tasting-notes"><h2>Taster response</h2><p>{event.tasterResponseComment}</p></section> : null}
    {editing ? <section className="card tasting-editor"><h2>Edit proposal</h2><TastingEditor event={{ id, version: event.version, agencyId: event.agencyId, agencyName: event.agency.name, assignedTasterUserId: event.assignedTasterUserId, date, startTime: timeInput(event.startsAt), endTime: timeInput(event.endsAt), contactId: event.contactId, tasterNotes: event.tasterNotes, internalNotes: event.internalNotes }} users={users.map(user => ({ value: user.id, label: getUserDisplayName(user) }))} /></section> : <TastingWorkflow {...workflowProps} showNextStep={false} />}
    <section className="tasting-milestones"><h2>Recorded approval milestones</h2><dl><div><dt>Taster</dt><dd>{event.tasterResponse.replaceAll('_', ' ')}{event.tasterRespondedAt ? ` · ${formatEasternDateTime(event.tasterRespondedAt)}` : ''}</dd></div><div><dt>Agency</dt><dd>{event.agencyApproval.replaceAll('_', ' ')}{event.agencyDecidedAt || event.agencyRequestedAt ? ` · ${formatEasternDateTime(event.agencyDecidedAt ?? event.agencyRequestedAt)}` : ''}</dd></div><div><dt>State</dt><dd>{event.stateApproval.replaceAll('_', ' ')}{event.stateDecidedAt || event.stateSubmittedAt ? ` · ${formatEasternDateTime(event.stateDecidedAt ?? event.stateSubmittedAt)}` : ''}{event.stateReference ? ` · ${event.stateReference}` : ''}</dd></div></dl>{event.cancellationReason ? <p>Cancelled: {event.cancellationReason}</p> : null}{event.agencyDecisionComment ? <p>Agency: {event.agencyDecisionComment}</p> : null}{event.stateDecisionComment ? <p>State: {event.stateDecisionComment}</p> : null}</section>
    <section className="tasting-sales"><h2>Retail bottles sold on tasting date</h2><p className="tasting-sales-value">{event.retailBottlesSold == null ? 'Awaiting available retail sales data' : event.retailBottlesSold.toLocaleString()}</p><p className="field-note">Same-day store sales for your organization’s products; association does not establish sales caused by the tasting.</p>{event.salesCalculatedAt ? <p className="field-note">{event.salesDataSource} · Source through {formatDateOnly(event.salesSourceDataThrough)} · Calculated {formatEasternDateTime(event.salesCalculatedAt)}</p> : null}{event.salesProductBreakdown && Array.isArray(event.salesProductBreakdown) ? <details className="tasting-support"><summary>Per-product sales</summary><ul>{event.salesProductBreakdown.map((raw, index) => { const row = raw as Record<string, unknown>; return <li key={index}>{String(row.itemCode ?? row.brand ?? row.product ?? 'Product')}: {String(row.bottles ?? row.retailBottlesSold ?? 'Unknown')}</li>; })}</ul></details> : null}</section>
    {coordinator && event.internalNotes ? <section className="tasting-notes"><h2>Internal notes</h2><p>{event.internalNotes}</p></section> : null}
    {event.completedVisit ? <section id="tasting-visit-evidence"><h2>Visit evidence</h2><p>{formatEasternDateTime(event.completedVisit.visitAt)} · {event.completedVisit.summary}</p><VisitPhotoGallery photos={event.completedVisit.photos.map(photo => ({ id: photo.id, url: photo.url, caption: photo.caption, type: photo.type }))} /></section> : null}
    {coordinator && event.visits.some(visit => visit.id !== event.completedVisitId) ? <section><h2>Linked visits requiring review</h2>{event.visits.filter(visit => visit.id !== event.completedVisitId).map(visit => <div key={visit.id}><p>{formatEasternDateTime(visit.visitAt)} · {visit.summary || 'Visit without completion evidence'}</p><VisitPhotoGallery photos={visit.photos.map(photo => ({ id: photo.id, url: photo.url, caption: photo.caption, type: photo.type }))} /></div>)}</section> : null}
    {salesRefreshFailed ? <p role="status" className="tasting-notice">Retail sales refresh is temporarily unavailable. Any displayed sales value is the last saved observation; reopen this tasting to retry.</p> : null}
    <section className="tasting-history"><h2>History</h2><ol>{event.history.map(entry => <li key={entry.id}><strong>{historyLabels[entry.type] ?? entry.type.toLowerCase().replaceAll('_', ' ')}</strong>{entry.statusChange ? <span>{entry.statusChange.previous ? TASTING_STATUS_LABELS[entry.statusChange.previous] : 'Previous status unknown'} → {entry.statusChange.current ? TASTING_STATUS_LABELS[entry.statusChange.current] : 'Status reset'}</span> : null}<span>{formatEasternDateTime(entry.createdAt)} · {entry.actorUserId ? names.get(entry.actorUserId) ?? 'Former team member' : 'System'}</span>{entry.comment ? <p>{entry.comment}</p> : null}{coordinator && (entry.oldValue || entry.newValue) ? <details><summary>Change details</summary><pre>{JSON.stringify({ previous: entry.oldValue, current: entry.newValue }, null, 2)}</pre></details> : null}</li>)}</ol>{event.history.length === 100 ? <p className="field-note">Latest 100 history entries shown; older records remain stored.</p> : null}</section>
  </div>;
}
