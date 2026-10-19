import path from 'node:path';
import { getAppEnvironment, logEnvironmentEvent, validateRuntimeEnvironment } from '../lib/appEnvironment';
import { loadEnvironmentFile } from '../lib/environmentFile';
import { getEnvironmentFeatureKeys } from '../lib/featureRegistry';

const environmentFile = process.argv.find((argument) => argument.startsWith('--env-file='))?.slice('--env-file='.length);
if (environmentFile) loadEnvironmentFile(path.resolve(environmentFile));

async function main() {
  validateRuntimeEnvironment();
  if (getAppEnvironment() !== 'test') throw new Error('All-feature entitlement reconciliation is allowed only when APP_ENV=test.');
  const { prisma } = await import('../lib/prisma');
  try {
    const organizations = await prisma.organization.findMany({ select: { id: true } });
    const features = getEnvironmentFeatureKeys([]);
    await prisma.$transaction(organizations.flatMap(({ id: organizationId }) => features.map((featureKey) => prisma.organizationFeature.upsert({
      where: { organizationId_featureKey: { organizationId, featureKey } },
      create: { organizationId, featureKey, enabled: true, source: 'staging-environment' },
      update: { enabled: true, source: 'staging-environment' },
    }))));

    logEnvironmentEvent('features.staging-all-enabled', { featureCount: features.length, organizationCount: organizations.length });
  } finally {
    await prisma.$disconnect();
  }
}

main();
