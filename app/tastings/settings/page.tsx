import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '../../../lib/prisma';
import { requireTastingActor } from '../../../lib/tastings/auth';
import { tastingMinimumDays } from '../../../lib/tastings/model';
import { PageHeader } from '../../components/PageChrome';
import { CrmForm } from '../../components/CrmForm';
import { saveTastingSpacing } from './actions';
export default async function TastingSettings() {
  const { actor, coordinator } = await requireTastingActor();
  if (!coordinator) notFound();
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { settings: true } });
  const minimumDays = tastingMinimumDays(organization.settings);
  return <div className="tastings-page"><PageHeader title="Tasting settings" actions={<Link href="/tastings">Back to tastings</Link>} /><section className="card tasting-editor"><CrmForm action={saveTastingSpacing} submitLabel="Save spacing"><input type="hidden" name="previousDays" value={minimumDays} /><label>Minimum days between tastings at the same Agency<input type="number" name="minimumDays" min={0} max={365} required defaultValue={minimumDays} /></label><p className="field-note">Applies when creating or rescheduling active proposals. Exactly this many days is allowed. Administrators can record a reason for an exception. Cancelled, denied and completed records do not block scheduling.</p></CrmForm></section></div>;
}
