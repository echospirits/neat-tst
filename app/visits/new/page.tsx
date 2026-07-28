export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { UserRole } from '@prisma/client';
import { getUserDisplayName, requireUser } from '../../../lib/auth';
import { prisma } from '../../../lib/prisma';
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
        <h1>Log Agency Visit</h1>
        <p className="muted">Choose the agency, leave your comments, and add one picture.</p>
        {params.status ? <p className="pill">{statusMessages[params.status] ?? params.status}</p> : null}

        <div className="card">
          <TasterVisitForm action={createVisit} agencies={agencies} />
        </div>
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
      <h1>Log Visit</h1>
      {params.status ? <p className="pill">{statusMessages[params.status] ?? params.status}</p> : null}

      <div className="card">
        <LogVisitForm
          action={createVisit}
          actorName={getUserDisplayName(user)}
          agencies={agencies}
          contacts={contacts}
          initialValues={{
            locationType: initialLocationType,
            agencyId: params.agencyId ?? null,
            startVoiceNote: params.voice === '1',
            wholesaleAccountId: params.wholesaleAccountId ?? null,
          }}
          tags={tags}
          wholesaleAccounts={wholesaleAccounts}
        />
      </div>
    </>
  );
}
