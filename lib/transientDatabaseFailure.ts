// Restrict uncoded initialization recovery to the observed transport failures;
// Prisma also uses InitializationError for permanent authentication/schema errors.
export function transientDatabaseFailureCode(error: unknown): string | null {
  const value = error as { code?: string; errorCode?: string; name?: string; message?: string } | null;
  const code = value?.code ?? value?.errorCode;
  if (code) return ['P1001', 'P1002', 'P1008', 'P1017', 'P2024'].includes(code) ? code : null;
  if (value?.name === 'PrismaClientInitializationError' && /Can't reach database server|Connection terminated unexpectedly|Server has closed the connection/i.test(value.message ?? '')) return 'DATABASE_CONNECTION';
  return null;
}
