import { OrganizationAuditAction, OrganizationStatus, Prisma, UserRole } from '@prisma/client';
import { notFound, redirect } from 'next/navigation';
import { FEATURE_KEYS, getEnvironmentFeatureKeys, type FeatureKey, validateFeatureSelection } from './featureRegistry';
import { prisma } from './prisma';
import { ECHO_ORGANIZATION_ID, hasEchoAccess } from './echoAccess';

export { ECHO_ORGANIZATION_ID } from './echoAccess';

export async function getOrganizationContext(user: { id: string; organizationId: string | null; role: UserRole }) {
  if (!hasEchoAccess(user)) return null;
  const organization = await prisma.organization.findFirst({ where: { id: ECHO_ORGANIZATION_ID, active: true, accountStatus: { notIn: [OrganizationStatus.SUSPENDED, OrganizationStatus.CANCELLED] } } });
  return organization ? { organization, isSupportView: false, organizationId: organization.id } : null;
}

export async function requireOrganizationContext(user: { id: string; organizationId: string | null; role: UserRole }) {
  const context = await getOrganizationContext(user);
  if (!context) {
    redirect('/login?status=organization-unavailable');
  }
  return context;
}

export async function getOrganizationFeatures(organizationId: string) {
  const rows = await prisma.organizationFeature.findMany({ where: { organizationId, enabled: true }, select: { featureKey: true } });
  return new Set(getEnvironmentFeatureKeys(rows.map((row) => row.featureKey).filter((key): key is FeatureKey => FEATURE_KEYS.includes(key as FeatureKey)), process.env));
}

export async function hasFeature(organizationId: string, featureKey: FeatureKey) {
  if (getEnvironmentFeatureKeys([], process.env).includes(featureKey)) return true;
  return Boolean(await prisma.organizationFeature.findFirst({ where: { organizationId, featureKey, enabled: true }, select: { id: true } }));
}

export async function requireFeatureForUser(user: { id: string; organizationId: string | null; role: UserRole }, featureKey: FeatureKey) {
  const context = await requireOrganizationContext(user);
  if (!(await hasFeature(context.organizationId, featureKey))) notFound();
  return context;
}

export function assertFeatureDependencies(keys: readonly string[]) {
  const result = validateFeatureSelection(keys);
  if (result.missing.length) throw new Error(result.missing.map(({ feature, dependency }) => `${feature} requires ${dependency}`).join(', '));
  return result.enabled;
}

export async function writeOrganizationAudit(actorUserId: string, organizationId: string | null, action: OrganizationAuditAction, metadata?: Record<string, unknown>) {
  await prisma.organizationAuditEvent.create({ data: { actorUserId, organizationId, action, metadata: metadata as Prisma.InputJsonValue | undefined } });
}
