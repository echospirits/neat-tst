import Link from 'next/link';
import './salesStatus.css';
import type { AccountSalesStatus } from '@prisma/client';
import { ACTIVE_SALES_STATUSES, SALES_STATUS_OPTIONS } from '../../lib/accountSalesStatus';

type Props = {
  currentStatus?: AccountSalesStatus | null;
  counts?: Partial<Record<AccountSalesStatus, number>>;
  filterHref?: (status: AccountSalesStatus) => string;
};

/** Relationship stages, not a claim that earlier stages were visited or completed. */
export function SalesStatusJourney({ currentStatus, counts, filterHref }: Props) {
  const stage = (option: typeof SALES_STATUS_OPTIONS[number], index?: number) => {
    const current = currentStatus === option.value;
    const content = <>
      <span className="sales-journey-caption">{counts ? `${counts[option.value] ?? 0} accounts` : index === undefined ? 'Other status' : `Stage ${index + 1}`}</span>
      <strong>{option.label}</strong>
      {current ? <span className="sales-journey-current">{filterHref ? 'Selected' : 'Current status'}</span> : null}
    </>;
    return <li key={option.value} data-sales-stage={option.value} className={current ? 'is-current' : undefined}>
      {filterHref ? <Link href={filterHref(option.value)} aria-current={current ? 'page' : undefined}>{content}</Link> : <div aria-current={current ? 'step' : undefined}>{content}</div>}
    </li>;
  };

  return <div className="sales-journey" aria-label={filterHref ? 'Filter pipeline by sales status' : 'Sales relationship stages'}>
    <ol className="sales-journey-path">
      {SALES_STATUS_OPTIONS.filter(({ value }) => (ACTIVE_SALES_STATUSES as readonly AccountSalesStatus[]).includes(value)).map((option, index) => stage(option, index))}
    </ol>
    <ul className="sales-journey-other" aria-label="Other relationship statuses">
      {SALES_STATUS_OPTIONS.filter(({ value }) => !(ACTIVE_SALES_STATUSES as readonly AccountSalesStatus[]).includes(value)).map((option) => stage(option))}
    </ul>
  </div>;
}
