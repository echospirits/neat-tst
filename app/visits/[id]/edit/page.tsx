export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { notFound } from 'next/navigation';
import { getUserDisplayName, requireUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';
import {
  getAgenciesForVisitPicker,
  getAgencyVisitPickerOptionById,
  getWholesaleAccountsForVisitPicker,
  getWholesaleVisitPickerOptionById,
  sortVisitPickerOptions,
} from '../../../../lib/visitPickerOptions';
import { normalizeFollowUpMode } from '../../../../lib/visitWorkflow';
import { PageHeader } from '../../../components/PageChrome';
import { LogVisitForm } from '../../LogVisitForm';
import { updateVisit } from '../../actions';

export default async function EditVisitPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  const visit = await prisma.loggedVisit.findUnique({ where: { id } });
  if (!visit) notFound();

  const [agencyOptions, wholesaleOptions, contacts] = await Promise.all([
    getAgenciesForVisitPicker(),
    getWholesaleAccountsForVisitPicker(),
    prisma.locationContact.findMany({
      orderBy: { name: 'asc' },
      take: 1000,
      select: { id: true, name: true, role: true, phone: true, email: true, agencyId: true, wholesaleAccountId: true },
    }),
  ]);
  const [selectedAgency, selectedWholesale] = await Promise.all([
    visit.agencyId && !agencyOptions.some((agency) => agency.id === visit.agencyId)
      ? getAgencyVisitPickerOptionById({ id: visit.agencyId })
      : null,
    visit.wholesaleAccountId && !wholesaleOptions.some((account) => account.id === visit.wholesaleAccountId)
      ? getWholesaleVisitPickerOptionById({ id: visit.wholesaleAccountId })
      : null,
  ]);
  const agencies = sortVisitPickerOptions(selectedAgency ? [selectedAgency, ...agencyOptions] : agencyOptions);
  const wholesaleAccounts = sortVisitPickerOptions(selectedWholesale ? [selectedWholesale, ...wholesaleOptions] : wholesaleOptions);
  const locationName =
    visit.locationType === 'agency'
      ? agencies.find((agency) => agency.id === visit.agencyId)?.name
      : wholesaleAccounts.find((account) => account.id === visit.wholesaleAccountId)?.name;
  const action = updateVisit.bind(null, visit.id);

  return (
    <>
      <PageHeader
        description="Update the useful details without creating another visit or duplicate follow-up task. Existing photos stay attached."
        eyebrow="Field activity"
        title="Edit Visit"
      />
      <div className="workflow-shell"><div className="card">
        <LogVisitForm
          action={action}
          actorName={getUserDisplayName(user)}
          agencies={agencies}
          contacts={contacts}
          initialValues={{
            agencyId: visit.agencyId,
            contactId: visit.contactId,
            followUpDate: visit.followUpDate?.toISOString().slice(0, 10),
            followUpMode: normalizeFollowUpMode(visit.followUpMode),
            locationLocked: true,
            locationName,
            locationType: visit.locationType === 'agency' ? 'agency' : 'wholesale',
            nextStep: visit.nextStep,
            outcomeCodes: visit.outcomeCodes,
            outcomes: visit.outcomes,
            summary: visit.summary,
            wholesaleAccountId: visit.wholesaleAccountId,
          }}
          mode="edit"
          submitLabel="Save changes"
          wholesaleAccounts={wholesaleAccounts}
        />
      </div></div>
    </>
  );
}
