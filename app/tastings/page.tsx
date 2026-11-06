import Link from 'next/link';
import { PageHeader } from '../components/PageChrome';
import { LiveFilterForm } from '../components/LiveFilterForm';
import { requireTastingActor } from '../../lib/tastings/auth';
import { listTastings, tastingAssigneeOptions } from '../../lib/tastings/queries';
import { canAssignTasting } from '../../lib/tastings/assignment';
import { addDaysToDateInputValue, formatDateOnly, formatEasternDateInputValue, formatEasternDateTime } from '../../lib/dateTime';
import { getUserDisplayName } from '../../lib/auth';
import { TastingBrowse } from './TastingBrowse';
import { TastingMenu } from './TastingMenu';
import { TastingStatusSelect } from './TastingStatusSelect';
import { TastingAssigneeSelect } from './TastingAssigneeSelect';
import { isTerminalTasting } from '../../lib/tastings/model';
import { tastingStatusControlData } from '../../lib/tastings/statusActions';
import { tastingPageHref, type TastingPageState } from '../../lib/tastings/navigation';

export const dynamic = 'force-dynamic';
type Search = { view?: string; month?: string; date?: string; period?: string; q?: string; page?: string; order?: string };
export default async function TastingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { actor, user, coordinator } = await requireTastingActor();
  const params = await searchParams;
  const today = formatEasternDateInputValue();
  const view = params.view === 'calendar' || params.view === 'history' ? params.view : 'upcoming';
  const query = params.q?.trim().slice(0, 120) ?? '';
  const selectedOrder = params.order === 'asc' || params.order === 'desc' ? params.order : undefined;
  const order = selectedOrder ?? (view === 'history' ? 'desc' : 'asc');
  const page = Math.min(499, Math.max(0, Number(params.page) || 0));
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month ?? '') ? params.month! : today.slice(0, 7);
  const period = params.period === 'week' ? 'week' : 'month';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? '') && Number.isFinite(Date.parse(`${params.date}T00:00:00Z`)) ? params.date! : today;
  const monthStart = `${month}-01`;
  const monthEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1)).toISOString().slice(0, 10);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const weekStart = addDaysToDateInputValue(date, -weekday);
  const from = period === 'week' ? weekStart : monthStart;
  const to = period === 'week' ? addDaysToDateInputValue(weekStart, 7) : monthEnd;
  const tastings = await listTastings(actor, { ...(view === 'calendar' ? { from: new Date(`${from}T00:00:00Z`), to: new Date(`${to}T00:00:00Z`), limit: 250 } : { view, today: new Date(`${today}T00:00:00Z`), limit: 101, offset: page * 100 }), search: query, order });
  const visible = view === 'calendar' ? tastings : tastings.slice(0, 100);
  const canAssign = canAssignTasting(actor.role);
  const assigneeOptions = canAssign && visible.length ? (await tastingAssigneeOptions(actor)).map(person => ({ value: person.id, label: getUserDisplayName(person) })) : [];
  const scope: TastingPageState = { view, q: query || undefined, order: selectedOrder, page,
    ...(params.month ? { month } : {}), ...(params.period === 'month' || params.period === 'week' ? { period } : {}), ...(params.date ? { date } : {}) };
  const returnTo = tastingPageHref(scope);
  const shown = visible.length;
  const more = view !== 'calendar' && tastings.length > 100;
  const days: string[] = [];
  if (view === 'calendar') for (let day = from; day < to; day = addDaysToDateInputValue(day, 1)) days.push(day);
  return <div className="tastings-page tasting-browse-page">
    <PageHeader title="Tastings" meta={actor.role === 'TASTER' ? 'Assigned to you · Eastern time' : 'Eastern time'} actions={coordinator ? <><TastingMenu kind="manage" label="Manage" accessibleLabel="Manage tastings"><Link href="/tastings/import">Import schedule</Link><Link href="/tastings/settings">Tasting settings</Link></TastingMenu><Link className="btn" href="/tastings/new">New tasting</Link></> : undefined} />
    <nav className="tasting-tabs" aria-label="Tasting views">{([['upcoming', 'Workflow / Upcoming'], ['calendar', 'Calendar'], ['history', 'History']] as const).map(([key, label]) => <Link key={key} aria-current={view === key ? 'page' : undefined} href={tastingPageHref(scope, { view: key })}>{label}</Link>)}</nav>
    <LiveFilterForm action="/tastings" className="tasting-toolbar" label="Filter tastings" role="search" urlValues={{ q: query, order, ...(view === 'calendar' ? { period, ...(period === 'month' ? { month } : { date }) } : {}) }}>
      <input type="hidden" name="view" value={view} /><input type="hidden" name="page" value="0" />
      <label>Find Agency <input name="q" type="search" defaultValue={query} placeholder="Agency name or number" /></label>
      {view !== 'calendar' ? <label className="tasting-order-field">Date order<select name="order" defaultValue={order}><option value="asc">Soonest first</option><option value="desc">Latest first</option></select></label> : selectedOrder ? <input type="hidden" name="order" value={selectedOrder} /> : null}
      {view === 'calendar' ? <><label>Period <select name="period" defaultValue={period}><option value="month">Month</option><option value="week">Week</option></select></label>{period === 'month' ? <label>Month <input name="month" type="month" defaultValue={month} /></label> : <label>Week of <input name="date" type="date" defaultValue={date} /></label>}</> : null}
    </LiveFilterForm>
    <div className="tasting-result-scope"><p className="tasting-results" role="status">{page > 0 && view !== 'calendar' && shown ? `${page * 100 + 1}–${page * 100 + shown} shown` : `${shown} ${shown === 1 ? 'tasting' : 'tastings'} shown`}{more ? ' · More available' : view === 'calendar' && shown === 250 ? ' · View limit reached' : ''}</p>{query ? <Link className="tasting-clear-search" href={tastingPageHref(scope, { q: undefined, page: 0 })}>Clear search</Link> : null}</div>
    {view === 'calendar' ? <>
      <div className="tasting-calendar-heading"><h2>{period === 'week' ? `Week of ${formatDateOnly(from)}` : formatDateOnly(monthStart, { month: 'long', year: 'numeric' })}</h2><div className="tasting-inline-actions"><Link className="btn secondary" href={tastingPageHref(scope, { period, ...(period === 'week' ? { date: addDaysToDateInputValue(from, -7) } : { month: addDaysToDateInputValue(monthStart, -1).slice(0, 7) }), page: 0 })}>Previous</Link><Link className="btn secondary" href={tastingPageHref(scope, { period, ...(period === 'week' ? { date: to } : { month: monthEnd.slice(0, 7) }), page: 0 })}>Next</Link></div></div>
      <div className="tasting-calendar" aria-label="Tasting calendar">
        {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => <div key={day} className="tasting-calendar-weekday">{day.slice(0, 3)}</div>)}
        {period === 'month' ? Array.from({ length: new Date(`${monthStart}T12:00:00Z`).getUTCDay() }, (_, index) => <div key={`blank-${index}`} className="tasting-calendar-blank" />) : null}
        {days.map(day => { const events = visible.filter(event => event.scheduledDate.toISOString().slice(0, 10) === day); return <section className={`tasting-calendar-day${day === today ? ' is-today' : ''}${events.length ? '' : ' is-empty'}`} key={day} aria-label={formatDateOnly(day)}><h3><time dateTime={day}>{formatDateOnly(day, { weekday: 'short', month: 'short', day: 'numeric' })}</time></h3>{events.map(event => <article key={event.id} className="tasting-calendar-entry"><Link className="tasting-calendar-event" href={`/tastings/${event.id}?returnTo=${encodeURIComponent(returnTo)}`}><strong>{event.agency.name}</strong><span>{formatEasternDateTime(event.startsAt, { hour: 'numeric', minute: '2-digit' })}–{formatEasternDateTime(event.endsAt, { hour: 'numeric', minute: '2-digit' })}</span>{!canAssign ? <span>{event.assignedTaster ? getUserDisplayName(event.assignedTaster) : 'Taster needs mapping'}</span> : null}</Link>{canAssign ? <TastingAssigneeSelect key={`${event.id}:${event.version}`} id={event.id} version={event.version} assignedTasterUserId={event.assignedTasterUserId} currentTasterName={event.assignedTaster ? getUserDisplayName(event.assignedTaster) : 'Needs identity mapping'} label={`${event.agency.name} on ${formatDateOnly(event.scheduledDate)}`} canAssign={canAssign} options={assigneeOptions} unavailableReason={event.completedAt ? 'Visit logged · assignment locked' : isTerminalTasting(event) ? coordinator || event.assignedTasterUserId === user.id ? 'Reopen status to reassign' : 'Ask an administrator to reopen status' : undefined} /> : null}<TastingStatusSelect tasting={tastingStatusControlData(event)} currentUserId={user.id} coordinator={coordinator} label={`${event.agency.name} on ${formatDateOnly(event.scheduledDate)}`} showStatusLabel />{event.workflowStatusOverride === 'COMPLETED' && !event.completedAt ? <span className="tasting-missing-visit">Visit not logged</span> : null}</article>)}</section>; })}
      </div>{!visible.length ? <p className="muted">No tastings in this period{query ? ' match this search' : ''}.</p> : null}
      {tastings.length === 250 ? <p role="status">Showing 250 tastings. Use a week or Agency search to narrow the schedule.</p> : null}
    </> : visible.length ? <TastingBrowse tastings={visible} heading={view === 'history' ? 'Tasting history' : 'Upcoming tastings'} currentUserId={user.id} returnTo={returnTo} coordinator={coordinator} canAssign={canAssign} assigneeOptions={assigneeOptions} groupByStatus={view === 'upcoming'} showOutcome={view === 'history'} /> : <section className="tasting-empty"><h2>{view === 'history' ? 'No historical tastings' : 'No upcoming tastings'}{query ? ' match this search' : ''}</h2>{!query && coordinator && view === 'upcoming' ? <Link href="/tastings/new">Create a tasting draft</Link> : !query && !coordinator && view === 'upcoming' ? <p className="muted">Your assigned proposals will appear here.</p> : null}</section>}
    {view !== 'calendar' && (page > 0 || tastings.length > 100) ? <nav className="tasting-inline-actions" aria-label="Tasting result pages">{page > 0 ? <Link className="btn secondary" href={tastingPageHref(scope, { page: page - 1 })}>Previous 100</Link> : null}{tastings.length > 100 ? <Link className="btn secondary" href={tastingPageHref(scope, { page: page + 1 })}>Next 100</Link> : null}</nav> : null}
  </div>;
}
