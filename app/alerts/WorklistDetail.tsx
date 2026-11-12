import Link from 'next/link';
import { splitReactivationPurchasedAgainDetail } from '../../lib/ohlqWholesaleReactivation';
import { socialWorklistPostHref } from '../../lib/socialPublishing/worklist';

export function WorklistDetail({ detail }: { detail: string | null }) {
  const socialPostHref = socialWorklistPostHref(detail);
  if (socialPostHref) {
    return <div className="muted preserve-lines">Approved social post is ready for native completion. <Link href={socialPostHref}>Open reviewed social post</Link></div>;
  }
  const parsed = splitReactivationPurchasedAgainDetail(detail);

  return (
    <>
      {parsed.purchasedAgainMessage ? (
        <div className="worklist-warning-ribbon">{parsed.purchasedAgainMessage}</div>
      ) : null}
      {parsed.detail ? <div className="muted preserve-lines">{parsed.detail}</div> : null}
    </>
  );
}
