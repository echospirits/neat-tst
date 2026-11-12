import Link from 'next/link';
import { PageHeader } from '../../components/PageChrome';
import { prisma } from '../../../lib/prisma';
import { requireSocialActor } from '../../../lib/socialPublishing/access';
import { getSocialWorkspace } from '../../../lib/socialPublishing/service';
import { SocialComposer } from '../SocialComposer';
import { clientDestination, clientMedia } from '../view';

export const dynamic = 'force-dynamic';
export default async function NewSocialPost({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const { actor } = await requireSocialActor();
  const workspace = await getSocialWorkspace(prisma, actor);
  const params = await searchParams;
  const groupId = workspace.groups.find(group => group.id === params.group)?.id ?? workspace.groups[0]?.id ?? '';
  return <><PageHeader title="New social post" meta="Draft · America/New_York" actions={<Link className="btn secondary" href="/social">Back to posts</Link>} />{workspace.groups.length ? <SocialComposer groups={workspace.groups.map(({ id, label }) => ({ id, label }))} destinations={workspace.destinations.map(clientDestination)} initialMedia={workspace.media.map(clientMedia)} organizationId={actor.organizationId} userId={actor.userId} initial={{ version: 0, groupId, title: '', caption: '', note: '', proposedLocal: '', destinations: [] }} /> : <p>No brand groups are available. Ask an administrator to create the groups and grant access in Connections.</p>}</>;
}
