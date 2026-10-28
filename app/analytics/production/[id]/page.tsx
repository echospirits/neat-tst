import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUserSession } from '../../../../lib/auth';
import { requireProductionForecastContext } from '../../../../lib/productionForecasting/access';
import { getProductionProduct } from '../../../../lib/productionForecasting/service';
import { cases } from '../../../../lib/productionForecasting/presentation';
import { ForecastDetail } from '../ForecastDetail';
import '../forecast.css';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Production forecast detail' };
export default async function ProductionProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requireUserSession();
  const query = await searchParams;
  const context = await requireProductionForecastContext(user, typeof query.organization === 'string' ? query.organization : undefined);
  if (!context.organization) notFound();
  const organizationId = context.organization.id;
  const { id } = await params;
  const result = await getProductionProduct(organizationId, id);
  if (!result) notFound();
  const backQuery = new URLSearchParams(Object.fromEntries(['q', 'market', 'confidence', 'sort'].flatMap(key => typeof query[key] === 'string' ? [[key, query[key]]] : [])));
  if (context.platform) backQuery.set('organization', organizationId);
  return <div className="pf-page"><Link href={`/analytics/production?${backQuery}`}>← Production Forecasting</Link>{result.forecast ? <ForecastDetail forecast={result.forecast} /> : <p role="status">This product is awaiting a source import and forecast refresh.</p>}<details className="card"><summary>Saved forecasts and actual demand</summary><p>Each run is retained. Actual demand is evaluated only after the complete horizon has source coverage.</p>{result.history.map(h => <p key={h.id}>{h.start} – {h.end} · forecast {cases(h.point)} cases · actual {h.actual === null ? 'awaiting complete source history' : `${cases(h.actual)} cases`}<small>Generated {h.generatedAt.slice(0, 16).replace('T', ' ')} UTC</small></p>)}</details></div>;
}
