import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getUserDisplayName, requireUserSession } from '../../../lib/auth';
import { buildPageMetadata } from '../../../lib/appBrand';
import { getSupportTicket, SupportError } from '../../../lib/support';
import { safeSupportPath, supportDate, supportReturnPath, SUPPORT_CATEGORIES, SUPPORT_STATUSES } from '../../../lib/supportShared';
import { PageHeader } from '../../components/PageChrome';
import { SupportReplyForm } from '../SupportReplyForm';
import { SupportScreenshot } from '../SupportScreenshot';

export const dynamic = 'force-dynamic';
export const metadata = buildPageMetadata('Support ticket');
export default async function SupportTicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string }> }) {
  await requireUserSession({ allowTaster: true });
  const { id } = await params;
  let result;
  try { result = await getSupportTicket(id); }
  catch (error) { if (error instanceof SupportError && error.status === 404) notFound(); throw error; }
  const { actor, ticket, canReply } = result;
  const platform = actor.role === 'PLATFORM_ADMIN';
  const diagnostics = ticket.diagnostics as { trail?: { path: string; at: string }[]; browser?: string; viewport?: { width: number; height: number } };
  const back = supportReturnPath((await searchParams).returnTo);
  const statusLabel = (platform || actor.id !== ticket.reporterId) && ticket.status === 'WAITING_ON_USER' ? 'Waiting for reporter' : SUPPORT_STATUSES[ticket.status];
  return <>
    <PageHeader eyebrow={`Support · #${ticket.number}`} title={ticket.title} actions={<Link className="btn secondary" href={back}>Back to Support</Link>} />
    <div className="support-ticket-layout">
      <section className="card support-report"><div className="support-actions"><span className="pill">{statusLabel}</span><span>{SUPPORT_CATEGORIES[ticket.category]}</span>{ticket.priority === 'URGENT' ? <span className="pill support-urgent">Urgent</span> : null}</div>
        <p className="muted">Reported {supportDate(ticket.createdAt)} by {getUserDisplayName(ticket.reporter)} · {ticket.organization.displayName}</p>
        {ticket.anticipatedFixDate ? <p><strong>Anticipated fix:</strong> {supportDate(ticket.anticipatedFixDate)} <span className="muted">(estimate)</span></p> : null}
        <h2>What was reported</h2><p className="support-text">{ticket.description}</p>
        {ticket.screenshot ? <SupportScreenshot ticketId={id} canRemove={canReply} /> : null}
        {diagnostics.browser || diagnostics.trail?.length ? <details className="support-details"><summary>Pages &amp; browser details shared with this report</summary>{diagnostics.browser ? <p>{diagnostics.browser}{diagnostics.viewport ? ` · ${diagnostics.viewport.width} × ${diagnostics.viewport.height}` : ''}</p> : null}<ol className="support-trail">{diagnostics.trail?.map((entry, index) => <li key={`${entry.at}-${index}`}>{safeSupportPath(entry.path) ? <Link href={safeSupportPath(entry.path)!}>{entry.path}</Link> : 'Page unavailable'} <time className="muted" dateTime={entry.at}>{new Date(entry.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET</time></li>)}</ol></details> : null}
      </section>
      <section className="card support-conversation"><h2>Replies</h2>
        {ticket.messages.length ? <ol className="support-messages">{ticket.messages.map(message => <li key={message.id} className={message.isInternal ? 'support-message is-internal' : 'support-message'}><div className="support-message-meta"><strong>{message.isPlatformReply ? 'Platform support' : getUserDisplayName(message.author)}</strong><time dateTime={message.createdAt.toISOString()}>{supportDate(message.createdAt)}</time>{message.isInternal ? <span className="pill">Private platform note</span> : message.status ? <span className="pill">{platform && message.status === 'WAITING_ON_USER' ? 'Waiting for reporter' : SUPPORT_STATUSES[message.status]}</span> : null}</div><p className="support-text">{message.body}</p>{message.anticipatedFixDate ? <p className="muted">Anticipated fix: {supportDate(message.anticipatedFixDate)} (estimate)</p> : null}</li>)}</ol> : <p className="muted">Your report is in the queue. Platform Admin will reply here.</p>}
        {canReply ? <SupportReplyForm key={id} ticketId={id} version={ticket.version} platform={platform} status={ticket.status} date={ticket.anticipatedFixDate?.toISOString().slice(0, 10) ?? ''} priority={ticket.priority} /> : <p className="muted">You can review this organization ticket. The reporter and Platform Admin can reply.</p>}
        {platform ? <details className="support-details"><summary>Add a private platform note</summary><SupportReplyForm key={`${id}-note`} ticketId={id} version={ticket.version} platform status={ticket.status} date="" priority={ticket.priority} internal /></details> : null}
      </section>
    </div>
  </>;
}
