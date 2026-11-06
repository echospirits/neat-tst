import Link from 'next/link';
import { PageHeader } from '../components/PageChrome';
import { LiveFilterForm } from '../components/LiveFilterForm';
import { requireTastingActor } from '../../lib/tastings/auth';
import { listTastings } from '../../lib/tastings/queries';
import { deriveTastingStatus, TASTING_STATUS_LABELS, type TastingStatus } from '../../lib/tastings/model';
import { addDaysToDateInputValue, formatDateOnly, formatEasternDateInputValue, formatEasternDateTime } from '../../lib/dateTime';
import { getUserDisplayName } from '../../lib/auth';
import { TastingSchedule } from './TastingSchedule';
import { TastingStatusSelect } from './TastingStatusSelect';
import { tastingStatusControlData } from '../../lib/tastings/statusActions';

export const dynamic = 'force-dynamic';
type Search = { view?: string; month?: string; date?: string; period?: string; q?: string; page?: string };
export default async function TastingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { actor, user, coordinator } = await requireTastingActor();
  const params = await searchParams;
  const today = formatEasternDateInputValue();
  const view = params.view === 'calendar' || params.view === 'history' ? params.view : 'upcoming';
  const query = params.q?.trim().slice(0, 120) ?? '';
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
  const tastings = await listTastings(actor, { ...(view === 'calendar' ? { from: new Date(`${from}T00:00:00Z`), to: new Date(`${to}T00:00:00Z`), limit: 250 } : { view, today: new Date(`${today}T00:00:00Z`), limit: 101, offset: page * 100 }), search: query });
  const visible = view === 'calendar' ? tastings : tastings.slice(0, 100);
  const groups = new Map<TastingStatus, typeof visible>();
  for (const tasting of visible) { const status = deriveTastingStatus(tasting); groups.set(status, [...(groups.get(status) ?? []), tasting]); }
  const returnTo = `/tastings?${new URLSearchParams({ view, ...(query ? { q: query } : {}), ...(view === 'calendar' ? { month, period, date } : { page: String(page) }) })}`;
  const days: string[] = [];
  if (view === 'calendar') for (let day = from; day < to; day = addDaysToDateInputValue(day, 1)) days.push(day);
  return <div className="tastings-page">
    <PageHeader title="Tastings" meta={actor.role === 'TASTER' ? 'Assigned to you · Eastern time' : 'Eastern time'} actions={coordinator ? <><Link className="btn secondary" href="/tastings/import">Import schedule</Link><Link className="btn" href="/tastings/new">New tasting</Link></> : undefined} />
    <nav className="tasting-tabs" aria-label="Tasting views">{[['upcoming', 'Workflow / Upcoming'], ['calendar', 'Calendar'], ['history', 'History']].map(([key, label]) => <Link key={key} aria-current={view === key ? 'page' : undefined} href={`/tastings?view=${key}`}>{label}</Link>)}</nav>
    {coordinator ? <div><Link href="/tastings/settings">Tasting settings</Link></div> : null}
    <LiveFilterForm action="/tastings" className="tasting-toolbar" label="Filter tastings" role="search">
      <input type="hidden" name="view" value={view} /><input type="hidden" name="page" value="0" />
      <label>Find Agency <input name="q" type="search" defaultValue={query} placeholder="Agency name or number" /></label>
      {view === 'calendar' ? <><label>Period <select name="period" defaultValue={period}><option value="month">Month</option><option value="week">Week</option></select></label>{period === 'month' ? <label>Month <input name="month" type="month" defaultValue={month} /></label> : <label>Week of <input name="date" type="date" defaultValue={date} /></label>}</> : null}
    </LiveFilterForm>
    {view === 'calendar' ? <>
      <div className="tasting-calendar-heading"><h2>{period === 'week' ? `Week of ${formatDateOnly(from)}` : formatDateOnly(monthStart, { month: 'long', year: 'numeric' })}</h2><div className="tasting-inline-actions"><Link className="btn secondary" href={`/tastings?${new URLSearchParams({ view, period, ...(period === 'week' ? { date: addDaysToDateInputValue(from, -7) } : { month: addDaysToDateInputValue(monthStart, -1).slice(0, 7) }) })}`}>Previous</Link><Link className="btn secondary" href={`/tastings?${new URLSearchParams({ view, period, ...(period === 'week' ? { date: to } : { month: monthEnd.slice(0, 7) }) })}`}>Next</Link></div></div>
      <div className="tasting-calendar" aria-label="Tasting calendar">
        {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => <div key={day} className="tasting-calendar-weekday">{day.slice(0, 3)}</div>)}
        {period === 'month' ? Array.from({ length: new Date(`${monthStart}T12:00:00Z`).getUTCDay() }, (_, index) => <div key={`blank-${index}`} className="tasting-calendar-blank" />) : null}
        {days.map(day => { const events = visible.filter(event => event.scheduledDate.toISOString().slice(0, 10) === day); return <section className={`tasting-calendar-day${day === today ? ' is-today' : ''}${events.length ? '' : ' is-empty'}`} key={day} aria-label={formatDateOnly(day)}><h3><time dateTime={day}>{formatDateOnly(day, { weekday: 'short', month: 'short', day: 'numeric' })}</time></h3>{events.map(event => <article key={event.id} className="tasting-calendar-entry"><Link className="tasting-calendar-event" href={`/tastings/${event.id}?returnTo=${encodeURIComponent(returnTo)}`}><strong>{event.agency.name}</strong><span>{formatEasternDateTime(event.startsAt, { hour: 'numeric', minute: '2-digit' })}–{formatEasternDateTime(event.endsAt, { hour: 'numeric', minute: '2-digit' })}</span><span>{event.assignedTaster ? getUserDisplayName(event.assignedTaster) : 'Taster needs mapping'}</span></Link><TastingStatusSelect tasting={tastingStatusControlData(event)} currentUserId={user.id} coordinator={coordinator} label={`${event.agency.name} on ${formatDateOnly(event.scheduledDate)}`} showStatusLabel /></article>)}</section>; })}
      </div>{!visible.length ? <p className="muted">No tastings in this period{query ? ' match this search' : ''}.</p> : null}
      {tastings.length === 250 ? <p role="status">Showing 250 tastings. Use a week or Agency search to narrow the schedule.</p> : null}
    </> : view === 'upcoming' ? <>{[...groups].map(([status, records]) => <TastingSchedule key={status} tastings={records} heading={TASTING_STATUS_LABELS[status]} currentUserId={user.id} returnTo={returnTo} inlineStatus={{ coordinator }} />)}{!visible.length ? <section className="card"><h2>No upcoming tastings{query ? ' match this search' : ''}</h2>{coordinator ? <Link href="/tastings/new">Create a tasting draft</Link> : <p className="muted">Your assigned proposals will appear here.</p>}</section> : null}</> : <TastingSchedule tastings={visible} heading="Tasting history" currentUserId={user.id} returnTo={returnTo} inlineStatus={{ coordinator }} showOutcome emptyLabel="No historical tastings match this scope." />}
    {view !== 'calendar' && (page > 0 || tastings.length > 100) ? <nav className="tasting-inline-actions" aria-label="Tasting result pages">{page > 0 ? <Link className="btn secondary" href={`/tastings?${new URLSearchParams({ view, q: query, page: String(page - 1) })}`}>Previous 100</Link> : null}{tastings.length > 100 ? <Link className="btn secondary" href={`/tastings?${new URLSearchParams({ view, q: query, page: String(page + 1) })}`}>Next 100</Link> : null}</nav> : null}
  </div>;
}
