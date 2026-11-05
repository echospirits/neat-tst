import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireTastingActor } from '../../../../lib/tastings/auth';

export async function GET(request: NextRequest) {
  const { actor, coordinator } = await requireTastingActor();
  if (!coordinator) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  const agencyId = request.nextUrl.searchParams.get('agencyId')?.slice(0, 100);
  const agency = agencyId ? await prisma.agency.findUnique({ where: { id: agencyId }, select: { id: true, agencyId: true } }) : null;
  if (!agency) return NextResponse.json({ contacts: [] });
  const contacts = await prisma.locationContact.findMany({ where: { organizationId: actor.organizationId, agencyId: { in: [agency.id, agency.agencyId] }, active: true, mergedIntoContactId: null }, orderBy: { name: 'asc' }, take: 250, select: { id: true, name: true, role: true } });
  return NextResponse.json({ contacts: contacts.map(row => ({ value: row.id, label: [row.name, row.role].filter(Boolean).join(' · ') })) });
}
