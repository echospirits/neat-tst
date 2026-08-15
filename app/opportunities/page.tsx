export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { OpportunityEventType, OpportunityStatus, OpportunityType } from '@prisma/client';
import Link from 'next/link';
import { requireUser } from '../../lib/auth';
import { prisma } from '../../lib/prisma';
import { updateOpportunity } from './actions';

const labels: Record<OpportunityType, string> = { LAPSED_BUYER: 'Reactivation', FIRST_ORDER_FOLLOW_UP: 'First Reorder', CATEGORY_CONQUEST: 'Category Opportunity', CROSS_SELL: 'Cross-Sell', NO_RECENT_TOUCH: 'Needs Attention' };

export default async function OpportunityInbox({ searchParams }: { searchParams?: Promise<{ type?: string; priority?: string }> }) {
  await requireUser(); const query = (await searchParams) ?? {};
  const type = Object.values(OpportunityType).includes(query.type as OpportunityType) ? query.type as OpportunityType : undefined;
  const opportunities = await prisma.salesOpportunity.findMany({
    where: { status: { in: [OpportunityStatus.OPEN, OpportunityStatus.ACTIONED] }, ...(type ? { type } : {}), ...(query.priority ? { priorityBand: query.priority.toUpperCase() } : {}) },
    include: { wholesaleAccount: { select: { name: true, city: true } }, worklistItems: { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }, select: { id: true } } },
    orderBy: [{ productionScore: 'desc' }, { detectedAt: 'desc' }], take: 250,
  });
  await prisma.opportunityEvent.createMany({ skipDuplicates: true, data: opportunities.map((item) => ({ opportunityId: item.id, eventType: OpportunityEventType.SHOWN, eventKey: 'SHOWN:INBOX', wholesaleAccountId: item.wholesaleAccountId, occurredAt: new Date() })) });
  return <>
    <header className="page-heading page-header"><div><span className="page-eyebrow">Next best work</span><h1>Opportunity Inbox</h1><p className="muted">Prioritized recommendations with the evidence behind each one.</p></div><Link className="btn secondary" href="/admin/opportunity-performance">Performance</Link></header>
    <nav className="opportunity-filters"><Link href="/opportunities">Best Opportunities</Link>{Object.values(OpportunityType).map((value) => <Link href={`/opportunities?type=${value}`} key={value}>{labels[value]}</Link>)}</nav>
    <section className="opportunity-grid">{opportunities.map((item) => <article className="card opportunity-card" key={item.id}>
      <div className="opportunity-card-heading"><div><span className={`priority priority-${item.priorityBand.toLowerCase()}`}>{item.priorityBand}</span><small>{labels[item.type]}</small><h2><Link href={`/wholesale/${item.wholesaleAccountId}`}>{item.wholesaleAccount.name}</Link></h2><p className="muted">{item.wholesaleAccount.city}</p></div><strong className="opportunity-score">{Math.round(item.productionScore)}</strong></div>
      <ul>{(item.explanation as string[]).map((reason) => <li key={reason}>{reason}</li>)}</ul><p><strong>Next:</strong> {item.recommendedAction}</p>
      <div className="opportunity-actions"><form action={updateOpportunity}><input type="hidden" name="id" value={item.id}/><button name="action" value="pursue">Pursue</button><button className="secondary" name="action" value="assign">Assign to me</button><button className="secondary" name="action" value="worklist" disabled={item.worklistItems.length > 0}>{item.worklistItems.length ? 'On worklist' : 'Add to worklist'}</button></form><Link className="btn secondary compact-btn" href={`/visits/new?type=wholesale&wholesaleAccountId=${item.wholesaleAccountId}`}>Log visit</Link></div>
      <details><summary>Snooze or dismiss</summary><form action={updateOpportunity} className="opportunity-feedback"><input type="hidden" name="id" value={item.id}/><input name="snoozedUntil" type="date"/><button name="action" value="snooze">Snooze</button><select name="reason" defaultValue="Wrong timing">{['Not a fit','Wrong timing','Already handled','Buyer not interested','Seasonal','Bad/missing data','Other'].map((reason) => <option key={reason}>{reason}</option>)}</select><button className="danger" name="action" value="dismiss">Dismiss</button></form></details>
    </article>)}</section>{opportunities.length === 0 ? <p className="card muted">No open opportunities match this view.</p> : null}
  </>;
}
