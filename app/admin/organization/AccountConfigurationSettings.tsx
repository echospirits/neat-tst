import { prisma } from "../../../lib/prisma";
import { getUserDisplayName } from "../../../lib/auth";
import { readAccountConfiguration } from "../../../lib/crm/accountConfiguration";
import { AccountConfigurationEditor } from "./AccountConfigurationEditor";
export async function AccountConfigurationSettings({
  organizationId,
}: {
  organizationId: string;
}) {
  const [org, users] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { crmPreferences: true },
    }),
    prisma.user.findMany({
      where: {
        organizationId,
        isActive: true,
        role: { not: "PLATFORM_ADMIN" },
      },
      select: { id: true, name: true, email: true },
    }),
  ]);
  const c = readAccountConfiguration(org.crmPreferences);
  return (
    <AccountConfigurationEditor
      key={c.version}
      configuration={c}
      users={users.map((u) => ({ id: u.id, name: getUserDisplayName(u) }))}
    />
  );
}
