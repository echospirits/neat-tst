import { UserRole } from '@prisma/client';
import { notFound } from 'next/navigation';
import { requireFeatureForUser } from '../organizations';
import { ECHO_ORGANIZATION_ID, hasEchoAccess } from '../echoAccess';

type Actor = { id: string; organizationId: string | null; role: UserRole };
export type ForecastOrganization = { id: string; displayName: string };
const services = {
  tenant: (user: Actor) => requireFeatureForUser(user, 'PRODUCTION_FORECASTING'),
};

/** Every role uses the active, entitled Echo context. Explicit foreign targets fail closed. */
export async function requireProductionForecastContext(user: Actor, requestedOrganization?: string, dependencies: {
  tenant: (user: Actor) => Promise<{ organizationId: string; organization: ForecastOrganization }>;
} = services) {
  if (!hasEchoAccess(user)) notFound();
  const context = await dependencies.tenant(user);
  if (context.organizationId !== ECHO_ORGANIZATION_ID || (requestedOrganization && requestedOrganization !== context.organizationId)) notFound();
  return { organization: context.organization, organizations: [] as ForecastOrganization[], platform: false };
}
