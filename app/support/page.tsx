import Link from 'next/link';
import { requireUserSession, getUserDisplayName } from '../../lib/auth';
import { buildPageMetadata } from '../../lib/appBrand';
import { listSupportTickets } from '../../lib/support';
import { supportDate, SUPPORT_CATEGORIES, SUPPORT_PAGE_SIZE, SUPPORT_STATUSES } from '../../lib/supportShared';
import { EmptyState, PageHeader } from '../components/PageChrome';
import { LiveFilterForm } from '../components/LiveFilterForm';

export const dynamic = 'force-dynamic';
export const metadata = buildPageMetadata('Support');

export default async function SupportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUserSession({ allowTaster: true });
  const raw = await searchParams;
  const params = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, typeof value === 'string' ? value : '']));
  const result = await listSupportTickets({ q: params.q, status: params.status, category: params.category, mine: params.scope === 'mine', page: Number(params.page) || 1 });
  const platform = result.actor.role === 'PLATFORM_ADMIN';
  const admin = result.actor.role === 'ADMIN' || platform;
  const reviewingOrganization = admin && params.scope !== 'mine';
  const returnTo = `/support?${new URLSearchParams(params)}`;
  const pageLink = (page: number) => { const query = new URLSearchParams(params); query.set('page', String(page)); return `/support?${query}`; };
  return <>
    <PageHeader eyebrow={platform ? 'Neat platform' : 'Help & feedback'} title="Support" description={platform ? 'Create a ticket, review reports across organizations, and send answers.' : admin && params.scope !== 'mine' ? 'Create a ticket or review reports from your organization. Platform Admin works and answers them.' : 'Report a problem, ask a question, or suggest an improvement.'} actions={<Link className="btn" href="/support/new">New support ticket</Link>} />
    {admin ? <nav className="support-scope" aria-label="Ticket visibility"><Link href="/support" className={params.scope !== 'mine' ? 'btn' : 'btn secondary'} aria-current={params.scope !== 'mine' ? 'page' : undefined}>{platform ? 'Platform queue' : 'Organization tickets'}</Link><Link href="/support?scope=mine" className={params.scope === 'mine' ? 'btn' : 'btn secondary'} aria-current={params.scope === 'mine' ? 'page' : undefined}>My tickets</Link></nav> : null}
    <section className="card support-queue">
      <LiveFilterForm className="support-filters" action="/support" label="Filter support tickets">
        {params.scope === 'mine' ? <input type="hidden" name="scope" value="mine" /> : null}<input type="hidden" name="page" value="1" />
        <label htmlFor="support-search">Search tickets<input id="support-search" name="q" type="search" maxLength={160} defaultValue={params.q} placeholder={platform ? 'Summary, #, organization, reporter' : 'Summary or ticket number'} /></label>
        <label htmlFor="support-filter-status">Status<select id="support-filter-status" name="status" defaultValue={params.status || 'active'}><option value="active">Active tickets</option><option value="all">All tickets</option>{Object.entries(SUPPORT_STATUSES).map(([key, label]) => <option key={key} value={key}>{reviewingOrganization && key === 'WAITING_ON_USER' ? 'Waiting for reporter' : label}</option>)}</select></label>
        <label htmlFor="support-filter-category">Category<select id="support-filter-category" name="category" defaultValue={params.category || ''}><option value="">All categories</option>{Object.entries(SUPPORT_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      </LiveFilterForm>
      <p className="muted" aria-live="polite">{result.total.toLocaleString()} {result.total === 1 ? 'ticket' : 'tickets'}{result.total > SUPPORT_PAGE_SIZE ? ` · Showing ${(result.page - 1) * SUPPORT_PAGE_SIZE + 1}–${Math.min(result.page * SUPPORT_PAGE_SIZE, result.total)}` : ''} · Urgent first, then oldest reported</p>
      {result.tickets.length ? <div className="support-ticket-list">{result.tickets.map(ticket => <Link href={`/support/${ticket.id}?returnTo=${encodeURIComponent(returnTo)}`} key={ticket.id} className="support-ticket-row"><div><strong>#{ticket.number} · {ticket.title}</strong><span className="muted">{SUPPORT_CATEGORIES[ticket.category]} · Reported {supportDate(ticket.createdAt)}{admin ? ` · ${getUserDisplayName(ticket.reporter)}` : ''}{platform ? ` · ${ticket.organization.displayName}` : ''}</span>{ticket.anticipatedFixDate ? <span>Anticipated fix {supportDate(ticket.anticipatedFixDate)}</span> : null}</div><div className="support-ticket-badges"><span className="pill">{(platform || result.actor.id !== ticket.reporter.id) && ticket.status === 'WAITING_ON_USER' ? 'Waiting for reporter' : SUPPORT_STATUSES[ticket.status]}</span>{ticket.priority === 'URGENT' ? <span className="pill support-urgent">Urgent</span> : null}<span aria-hidden="true">›</span></div></Link>)}</div>
        : <EmptyState title={result.total ? 'No tickets on this page' : 'No matching tickets'} description="Try another search or choose All tickets to include completed reports." action={<Link href={params.scope === 'mine' ? '/support?scope=mine&status=all' : '/support?status=all'}>Show all tickets</Link>} />}
      {result.total > SUPPORT_PAGE_SIZE ? <nav className="support-actions" aria-label="Support queue pages">{result.page > 1 ? <Link className="btn secondary" href={pageLink(result.page - 1)}>Previous</Link> : null}{result.page * SUPPORT_PAGE_SIZE < result.total ? <Link className="btn secondary" href={pageLink(result.page + 1)}>Next</Link> : null}</nav> : null}
    </section>
  </>;
}
