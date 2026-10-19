import { redirect } from 'next/navigation';
import { requireCrmActor } from '../../lib/crm/auth';
import { accountInput, accountHref } from '../../lib/crm/activity';
export default async function LegacyActivitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireCrmActor();
  const account = accountInput.safeParse(await searchParams);
  redirect(account.success ? `${accountHref(account.data)}#activity` : '/visits/new');
}
