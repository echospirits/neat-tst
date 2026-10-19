// Organization.id defaults to a Prisma CUID; only these two seed paths assign IDs.
export function assertOrganizationId(organizationId: string): void {
  const match = /^(c[a-z0-9]{24}|org_echo_spirits|org_neat_staging)$/.exec(organizationId);
  if (match?.[0] !== organizationId) {
    throw new Error('Pass a generated organization CUID or an existing seeded organization ID.');
  }
}
