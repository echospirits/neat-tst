import { UserRole } from '@prisma/client';
import { notFound } from 'next/navigation';
import { getOrganizationContext, requireFeatureForUser } from '../organizations';
import { prisma } from '../prisma';

type Actor = { id: string; organizationId: string | null; role: UserRole };
export type ForecastOrganization = { id: string; displayName: string };
const services = {
  tenant: (user: Actor) => requireFeatureForUser(user, 'PRODUCTION_FORECASTING'),
  current: getOrganizationContext,
  organizations: () => prisma.organization.findMany({
    where: { active: true, accountStatus: { notIn: ['SUSPENDED', 'CANCELLED'] }, features: { some: { featureKey: 'PRODUCTION_FORECASTING', enabled: true } } },
    orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
    select: { id: true, displayName: true },
  }),
};

/** Platform authority selects an explicit enrolled tenant for this feature only.
 * It neither enables other tenants nor changes the global Support View cookie. */
export async function requireProductionForecastContext(user: Actor, requestedOrganization?: string, dependencies: {
  tenant: (user: Actor) => Promise<{ organizationId: string; organization: ForecastOrganization }>;
  current: (user: Actor) => Promise<{ organizationId: string } | null>;
  organizations: () => Promise<ForecastOrganization[]>;
} = services) {
  if (user.role !== UserRole.PLATFORM_ADMIN) {
    const context = await dependencies.tenant(user);
    if (requestedOrganization && requestedOrganization !== context.organizationId) notFound();
    return { organization: context.organization, organizations: [] as ForecastOrganization[], platform: false };
  }
  const [current, organizations] = await Promise.all([dependencies.current(user), dependencies.organizations()]);
  const organization = requestedOrganization
    ? organizations.find(o => o.id === requestedOrganization)
    : organizations.find(o => o.id === current?.organizationId) ?? organizations[0];
  if (requestedOrganization && !organization) notFound();
  return { organization: organization ?? null, organizations, platform: true };
}
