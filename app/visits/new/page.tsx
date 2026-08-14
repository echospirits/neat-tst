export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { UserRole } from '@prisma/client';
import { getUserDisplayName, requireUser } from '../../../lib/auth';
import { prisma } from '../../../lib/prisma';
import { PageHeader } from '../../components/PageChrome';
import {
  getAgenciesForVisitPicker,
  getAgencyVisitPickerOptionById,
  getInitialVisitLocationType,
  getWholesaleAccountsForVisitPicker,
  getWholesaleVisitPickerOptionById,
  sortVisitPickerOptions,
} from '../../../lib/visitPickerOptions';
import { createVisit } from '../actions';
import { LogVisitForm } from '../LogVisitForm';
import { TasterVisitForm } from '../TasterVisitForm';

const statusMessages: Record<string, string> = {
  'invalid-agency': 'Select an agency before logging an agency visit.',
  'invalid-wholesale': 'Select an existing wholesale account or create one before logging a wholesale visit.',
  'invalid-contact': 'Select a contact tied to the selected account.',
  'invalid-photo': 'Photos must be image files.',
  'photo-too-large': 'Each uploaded photo must be 5 MB or smaller.',
  'storage-not-configured': 'Photo object storage is not configured yet.',
  'photo-upload-failed': 'The picture could not be uploaded, so the visit was not saved. Try again.',
  'photo-verification-failed': 'The picture could not be verified, so the visit was not saved. Try uploading it again.',
  'comments-required': 'Enter comments before logging the visit.',
  'photo-required': 'Add one picture before logging the visit.',
  'visit-logged': 'Agency visit logged.',
};

export default async function NewVisitPage({
  searchParams,
}: {
  searchParams?: Promise<{
    status?: string;
    type?: string;
    agencyId?: string;
    wholesaleAccountId?: string;
    voice?: string;
  }>;
}) {
  const [params, user] = await Promise.all([(await searchParams) ?? {}, requireUser({ allowTaster: true })]);

  if (user.role === UserRole.TASTER) {
    const agencies = (
      await prisma.agency.findMany({
        orderBy: { name: 'asc' },
        take: 750,
        select: {
          agencyId: true,
          city: true,
          county: true,
          id: true,
          name: true,
          phone: true,
        },
      })
    ).map((agency) => ({ ...agency, lastVisitAt: null }));

    return (
      <>
        <PageHeader
          description="Choose the agency, leave your comments, and add one picture."
          eyebrow="Field activity"
          title="Log Agency Visit"
        />
        {params.status ? <p className="toast-notice page-status">{statusMessages[params.status] ?? params.status}</p> : null}

        <div className="workflow-shell"><div className="card">
          <TasterVisitForm action={createVisit} agencies={agencies} />
        </div></div>
      </>
    );
  }

  const [agencyOptions, wholesaleAccountOptions, contacts, tags] = await Promise.all([
    getAgenciesForVisitPicker(),
    getWholesaleAccountsForVisitPicker(),
    prisma.locationContact.findMany({
      orderBy: { name: 'asc' },
      take: 1000,
      select: {
        id: true,
        name: true,
        role: true,
        phone: true,
        email: true,
        agencyId: true,
        wholesaleAccountId: true,
      },
    }),
    prisma.tag.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        color: true,
      },
    }),
  ]);
  const initialLocationType = getInitialVisitLocationType(params);
  const [selectedAgency, selectedWholesaleAccount] = await Promise.all([
    params.agencyId && !agencyOptions.some((agency) => agency.id === params.agencyId)
      ? getAgencyVisitPickerOptionById({ id: params.agencyId })
      : null,
    params.wholesaleAccountId &&
        !wholesaleAccountOptions.some((account) => account.id === params.wholesaleAccountId)
      ? getWholesaleVisitPickerOptionById({ id: params.wholesaleAccountId })
      : null,
  ]);
  const agencies = sortVisitPickerOptions(
    selectedAgency && !agencyOptions.some((agency) => agency.id === selectedAgency.id)
      ? [selectedAgency, ...agencyOptions]
      : agencyOptions,
  );
  const wholesaleAccounts = sortVisitPickerOptions(
    selectedWholesaleAccount && !wholesaleAccountOptions.some((account) => account.id === selectedWholesaleAccount.id)
      ? [selectedWholesaleAccount, ...wholesaleAccountOptions]
      : wholesaleAccountOptions,
  );

  return (
    <>
      <PageHeader
        description="Pick the account, tap what happened, and save. Add detail only when it helps."
        eyebrow="Field activity"
        title="Log Visit"
      />
      {params.status ? <p className="toast-notice page-status">{statusMessages[params.status] ?? params.status}</p> : null}

      <div className="workflow-shell"><div className="card">
        <LogVisitForm
          action={createVisit}
          actorName={getUserDisplayName(user)}
          agencies={agencies}
          contacts={contacts}
          initialValues={{
            locationType: initialLocationType,
            agencyId: params.agencyId ?? null,
            locationLocked: Boolean(params.agencyId || params.wholesaleAccountId),
            startVoiceNote: params.voice === '1',
            wholesaleAccountId: params.wholesaleAccountId ?? null,
          }}
          tags={tags}
          wholesaleAccounts={wholesaleAccounts}
        />
      </div></div>
    </>
  );
}
