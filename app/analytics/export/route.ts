import{operationsReport,operationsCsv}from'../../../lib/crm/operationsReport';
import{prisma}from'../../../lib/prisma';
import { requireUser } from '../../../lib/auth';
import { requireFeatureForUser } from '../../../lib/organizations';
import { formatDateInputValue } from '../../../lib/dateTime';
import { parseFilters } from '../../../lib/analytics/model';
import { getAnalytics } from '../../../lib/analytics/service';
import { csvCell, analyticsCsv } from '../../../lib/analytics/csv';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const user = await requireUser();
  const { organizationId, organization } = await requireFeatureForUser(user, 'ANALYTICS');
  const params = new URL(request.url).searchParams;
  let filters;
  try { filters = parseFilters(Object.fromEntries(params), formatDateInputValue(new Date(), organization.timezone)); }
  catch { return new Response('Choose valid dates in order, no later than today, spanning at most 366 days.', { status: 400 }); }
  if(params.get('report')==='relationships'){const result=await prisma.$transaction(db=>operationsReport(db,organizationId,filters.start,filters.end),{isolationLevel:'RepeatableRead',timeout:30000});return new Response(operationsCsv(result),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="neat-relationships-${filters.start}-${filters.end}.csv"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
  const report = params.get('report') === 'products' ? 'products' : 'accounts';
  if (report === 'products' && filters.group !== 'all') return new Response('Product exports use the Sales Overview report. Clear the account group filter.', { status: 400 });
  const result = await getAnalytics(organizationId, filters);
  if(params.get('report')==='continuity')return new Response('\uFEFF'+[['Organization','Start','End','Market','Channel','Product','Metric','Value'],...Object.entries(result.purchaseOutcomes).map(([k,v])=>[organizationId,filters.start,filters.end,filters.market,filters.channel,filters.product||'All',k,v])].map(row=>row.map(csvCell).join(',')).join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="neat-purchasing-continuity.csv"','Cache-Control':'private, no-store'}});
  return new Response(analyticsCsv(result, filters, organizationId, report), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="neat-${report}-${filters.start}-${filters.end}.csv"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
