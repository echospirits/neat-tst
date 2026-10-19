import { CrmError, type CrmDb } from "./activity";

export async function communicationsPilotEnabled(
  db: CrmDb,
  organizationId: string,
) {
  return Boolean(
    await db.organizationFeature.findFirst({
      where: { organizationId, featureKey: "COMMUNICATIONS", enabled: true },
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
