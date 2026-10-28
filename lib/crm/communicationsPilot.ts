import { CrmError, type CrmDb } from "./activity";
import { ECHO_ORGANIZATION_ID } from '../echoAccess';

export async function communicationsPilotEnabled(
  db: CrmDb,
  organizationId: string,
) {
  if (organizationId !== ECHO_ORGANIZATION_ID) return false;
  return Boolean(
    await db.organizationFeature.findFirst({
      where: { organizationId, featureKey: "COMMUNICATIONS", enabled: true,
        organization: { active: true, accountStatus: { notIn: ['SUSPENDED', 'CANCELLED'] } } },
      select: { id: true },
    }),
  );
}

export async function requireCommunicationsPilot(
  db: CrmDb,
  organizationId: string,
) {
  if (!(await communicationsPilotEnabled(db, organizationId)))
    throw new CrmError(
      "Communications pilot access is not enabled for this organization.",
    );
}
