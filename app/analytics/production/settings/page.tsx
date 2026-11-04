import Link from 'next/link';
import { requireAdmin } from '../../../../lib/auth';
import { requireOrganizationContext } from '../../../../lib/organizations';
import { getOperationalSignalConfiguration } from '../../../../lib/productionForecasting/operationalSignals/credentials';
import { PageHeader } from '../../../components/PageChrome';
import { SubmitButton } from '../../../components/SubmitButton';
import { configureOpenDock } from './actions';
import { ohioOpenDockWarehouses } from '../../../../lib/productionForecasting/operationalSignals/ohioLocations';
import '../forecast.css';
import '../operational-signals.css';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Production data connections' };
export default async function ProductionSignalSettings({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const actor = await requireAdmin();
  const { organizationId } = await requireOrganizationContext(actor);
  const { opendock } = await getOperationalSignalConfiguration(organizationId);
  const { status } = await searchParams;
  return <div className="pf-page"><Link href="/analytics/production">← Production Forecasting</Link><PageHeader title="Production data connections" description="Verify the OpenDock warehouses and LTL delivery type for the daily morning check." />
    {status === 'configured' ? <p className="pf-success" role="status">OpenDock credentials and LTL warehouse mappings are configured. The next morning refresh will record availability.</p> : status === 'verification-failed' ? <p className="pf-warning" role="alert">OpenDock verification did not complete. Check the account and API access. Previous credentials and mappings are retained. MFA or SSO may require provider-supported API access.</p> : null}
    <p>{opendock.credentials.configured ? `Credentials saved (${opendock.credentials.usernameHint}).` : 'No OpenDock credentials saved.'} {opendock.configured ? 'Both warehouse mappings are verified.' : 'Warehouse mapping verification is required.'}</p>
    {!opendock.encryption.configured ? <p className="pf-warning" role="status">Credential storage is not configured. An operator must configure a matching encryption key in the TST app and morning runner before this connection can be saved. Use <code>PRODUCTION_OPERATIONAL_CREDENTIAL_ENCRYPTION_KEY</code>, or the correct existing OHLQ key; do not replace the key protecting existing OPS credentials.</p> : null}
    <form action={configureOpenDock} className="pf-operational-form">
      <fieldset><legend>Authorized OpenDock account</legend><label>Email<input name="username" type="email" autoComplete="username" /></label><label>Password<input name="password" type="password" autoComplete="current-password" /></label><p className="muted">Leave both fields blank to reuse the saved account. Passwords are encrypted on the server and never returned to this page.</p></fieldset>
      <fieldset><legend>Ohio delivery warehouses</legend>{(['GPT', 'GRN'] as const).map(code => <label key={code}>{code} · {ohioOpenDockWarehouses[code].address}<input name={code} readOnly value={ohioOpenDockWarehouses[code].warehouseId} aria-label={`${code} verified OpenDock warehouse ID`} /></label>)}<p className="muted">These facilities were checked against Echo’s OpenDock favorites. Verification must find one authorized “LTL - Pallet Load” type at each warehouse.</p></fieldset>
      <SubmitButton pendingLabel="Verifying OpenDock…" disabled={!opendock.encryption.configured}>Save and verify OpenDock</SubmitButton>
    </form>
    <details className="compact-details"><summary>Refresh timing and data limits</summary><p>The existing TST morning source workflow runs at 7:27 AM Eastern. OpenDock and OPS are checked in the background; opening the dashboard reads saved observations. Availability is not a booked appointment.</p><p>OPS reuses the existing encrypted OHLQ account. Agency replenishment is based on the overnight Item Coverage inventory, with source freshness shown separately from the forecast. Same-day shipments and receipts may lag until the next load.</p><p>Calendar days are primary. Business days are shown only when a complete verified operating calendar is supplied; unavailable appointment days are never assumed to be closures.</p></details>
  </div>;
}
