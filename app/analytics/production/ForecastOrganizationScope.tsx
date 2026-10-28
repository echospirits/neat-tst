'use client';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { RecordPicker } from '../../components/RecordPicker';
import type { ForecastOrganization } from '../../../lib/productionForecasting/access';

export function ForecastOrganizationScope({ organization, organizations, filters = {}, allowChange = true }: { organization: ForecastOrganization; organizations: ForecastOrganization[]; filters?: Record<string, string>; allowChange?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <section className="pf-freshness" aria-label="Forecast organization" aria-busy={pending}>
    <span>Platform administrator view</span>
    {allowChange && organizations.length > 1 ? <RecordPicker key={organization.id} label="Organization" name="organization" options={organizations.map(o => ({ value: o.id, label: o.displayName }))} defaultValue={organization.id} allowEmpty={false} disabled={pending} onChange={id => {
      const query = new URLSearchParams({ ...filters, organization: id });
      startTransition(() => router.push(`/analytics/production?${query}`));
    }} /> : <strong>{organization.displayName}</strong>}
    <small aria-live="polite">{pending ? 'Loading forecasts for the selected organization…' : `Forecasts and source reports belong to ${organization.displayName}.`}</small>
  </section>;
}
