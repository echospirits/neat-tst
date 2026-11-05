import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '../../components/PageChrome';
import { requireTastingActor } from '../../../lib/tastings/auth';
import { tastingEditorOptions } from '../../../lib/tastings/queries';
import { getUserDisplayName } from '../../../lib/auth';
import { prisma } from '../../../lib/prisma';
import { TastingEditor } from '../TastingEditor';

export default async function NewTasting({ searchParams }: { searchParams: Promise<{ agencyId?: string }> }) {
  const { actor, coordinator } = await requireTastingActor();
  if (!coordinator) notFound();
  const { agencyId } = await searchParams;
  const [users, agency] = await Promise.all([tastingEditorOptions(actor), agencyId ? prisma.agency.findFirst({ where: { id: agencyId, state: 'OH' }, select: { id: true, name: true } }) : null]);
  return <div className="tastings-page"><PageHeader title="New tasting" actions={<Link href="/tastings">Back to tastings</Link>} /><section className="card tasting-editor"><TastingEditor users={users.map(user => ({ value: user.id, label: getUserDisplayName(user) }))} initialAgency={agency ?? undefined} /></section></div>;
}
