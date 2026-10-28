import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { start } from 'workflow/api';
import { isSideEffectEnabled } from '../../../../lib/appEnvironment';
import { productionForecastWorkflow } from '../../../../lib/productionForecasting/workflow';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : '';
  const actual = request.headers.get('authorization') ?? '';
  if (!expected || Buffer.byteLength(actual) !== Buffer.byteLength(expected) || !timingSafeEqual(new TextEncoder().encode(actual), new TextEncoder().encode(expected))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSideEffectEnabled('cron')) return NextResponse.json({ status: 'disabled' });
  try { const run = await start(productionForecastWorkflow); return NextResponse.json({ started: true, runId: run.runId }); }
  catch { return NextResponse.json({ error: 'Forecast refresh could not start. Retry the scheduled job.' }, { status: 503 }); }
}
