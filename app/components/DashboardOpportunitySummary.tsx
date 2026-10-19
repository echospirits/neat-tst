import Link from 'next/link';
import { prisma } from '../../lib/prisma';
import { evidenceModeLabel } from '../../lib/wholesaleAssessment';
import { actionableCommercialWhere, commercialDiscoveryAccountWhere } from '../../lib/commercialOpportunity';
export async function DashboardOpportunitySummary({ organizationId }: { organizationId: string }) {
  const suppressed = await prisma.organizationAccountOverlay.findMany({ where: { organizationId, accountType: 'WHOLESALE', OR: [{ opportunitySuppressed: true }, { active: false }] }, select: { externalAccountId: true } });
  const modes = Object.entries(evidenceModeLabel);
  const counts = await Promise.all(modes.map(([mode]) => prisma.wholesaleAccountAssessment.count({ where: { organizationId, evidenceMode: mode, ...actionableCommercialWhere(), wholesaleAccount: commercialDiscoveryAccountWhere(organizationId, suppressed.map(row => row.externalAccountId)) } })));
  return <section className="dashboard-section"><div className="section-heading"><h2>Where to spend time next</h2><Link href="/opportunities">Open intelligence</Link></div><div className="opportunity-summary-grid">{modes.map(([mode,label],i) => <Link className="card metric-card" key={mode} href={`/opportunities?mode=${mode}&rating=high`}><h3>{label}</h3><p className="metric-value">{counts[i]}</p><small>Ready to pursue · 3–5 commercial stars</small></Link>)}</div></section>;
}
