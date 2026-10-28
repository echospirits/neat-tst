export async function productionForecastWorkflow() {
  'use workflow';
  const organizations = await forecastOrganizations();
  let completed = 0, failed = 0;
  for (const organizationId of organizations) { if (await refreshTenant(organizationId)) completed++; else failed++; }
  return { completed, failed };
}
async function forecastOrganizations() {
  'use step';
  const { prisma } = await import('../prisma');
  const { isSideEffectEnabled } = await import('../appEnvironment');
  const { ECHO_ORGANIZATION_ID } = await import('../echoAccess');
  if (!isSideEffectEnabled('cron')) return [];
  const organizations = await prisma.organization.findMany({ where: { id: ECHO_ORGANIZATION_ID, active: true, accountStatus: { notIn: ['SUSPENDED', 'CANCELLED'] }, features: { some: { featureKey: 'PRODUCTION_FORECASTING', enabled: true } } }, select: { id: true }, orderBy: { id: 'asc' } });
  return organizations.filter(o => o.id === ECHO_ORGANIZATION_ID).map(o => o.id);
}
async function refreshTenant(organizationId: string) {
  'use step';
  const { refreshProductionForecast } = await import('./service');
  const { isSideEffectEnabled } = await import('../appEnvironment');
  const { ECHO_ORGANIZATION_ID } = await import('../echoAccess');
  if (!isSideEffectEnabled('cron') || organizationId !== ECHO_ORGANIZATION_ID) return false;
  try { await refreshProductionForecast(organizationId); return true; }
  catch { console.error('Production forecast refresh failed for an enrolled organization.'); return false; }
}
