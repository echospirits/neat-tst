export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { UserRole } from '@prisma/client';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '../../../lib/auth';
import { prisma } from '../../../lib/prisma';
import { getSignedInHomePath } from '../../../lib/userAccess';
import { getVisitContinueTarget, type VisitFormOrigin } from '../../../lib/visitConfirmation';

export default async function VisitConfirmedPage({
  searchParams,
}: {
  searchParams?: Promise<{
    origin?: string;
    status?: string;
    visitId?: string;
  }>;
}) {
  const [params, user] = await Promise.all([(await searchParams) ?? {}, requireUser({ allowTaster: true })]);
  const visitId = String(params.visitId ?? '').trim();

  if (!visitId) {
    redirect(getSignedInHomePath(user.role));
  }

  const visit = await prisma.loggedVisit.findFirst({
    where: {
      id: visitId,
      createdByUserId: user.id,
    },
    select: {
      agencyId: true,
      locationType: true,
      wholesaleAccountId: true,
    },
  });

  if (!visit) {
    redirect(getSignedInHomePath(user.role));
  }

  const formOrigin: VisitFormOrigin = params.origin === 'worklist' ? 'worklist' : 'visits';
  const continueTarget = getVisitContinueTarget({
    formOrigin,
    isTaster: user.role === UserRole.TASTER,
    visit,
  });
  const photoUploadFailed = params.status === 'photo-upload-failed';

  return (
    <section aria-live="polite" className="card visit-confirmation" role="status">
      <div aria-hidden="true" className="visit-confirmation-icon">
        ✓
      </div>
      <h1>Visit logged successfully</h1>
      <p>
        {photoUploadFailed
          ? 'The visit was saved, but one or more photos could not be uploaded.'
          : user.role === UserRole.TASTER
            ? 'Your agency visit, comments, and picture were saved.'
            : `Your ${visit.locationType === 'wholesale' ? 'wholesale' : 'agency'} visit was saved.`}
      </p>
      <div className="visit-confirmation-actions">
        <Link className="btn" href={continueTarget.href}>
          {continueTarget.label}
        </Link>
        {user.role !== UserRole.TASTER ? (
          <Link className="btn secondary" href="/visits/new">
            Log another visit
          </Link>
        ) : null}
      </div>
    </section>
  );
}
