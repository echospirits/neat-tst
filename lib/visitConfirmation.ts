export type ConfirmedVisit = {
  agencyId: string | null;
  locationType: string;
  wholesaleAccountId: string | null;
};

export type VisitFormOrigin = 'visits' | 'worklist';

export function getVisitContinueTarget({
  formOrigin,
  isTaster,
  visit,
}: {
  formOrigin: VisitFormOrigin;
  isTaster: boolean;
  visit: ConfirmedVisit;
}) {
  if (isTaster) {
    return {
      href: '/visits/new',
      label: 'Log another agency visit',
    };
  }

  if (formOrigin === 'worklist') {
    return {
      href: '/alerts',
      label: 'Return to worklist',
    };
  }

  if (visit.locationType === 'wholesale' && visit.wholesaleAccountId) {
    return {
      href: `/wholesale/${visit.wholesaleAccountId}`,
      label: 'Continue to wholesale account',
    };
  }

  if (visit.locationType === 'agency' && visit.agencyId) {
    return {
      href: `/agencies/${visit.agencyId}`,
      label: 'Continue to agency',
    };
  }

  return {
    href: '/visits',
    label: 'Continue to visits',
  };
}
