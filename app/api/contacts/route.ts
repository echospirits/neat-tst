import { createAccountContactRecord } from "../../../lib/crm/contactCreation";
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../lib/auth';
import { accountExists, getAccountLocation } from '../../../lib/accountMemory';
import { requireOrganizationContext } from '../../../lib/organizations';
import { prisma } from '../../../lib/prisma';

const optional = (value: unknown) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
};

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { organizationId } = await requireOrganizationContext(user);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = optional(body?.name);
  const accountId = optional(body?.accountId);
  const location = accountId ? getAccountLocation(String(body?.accountType ?? ''), accountId) : null;
  if (!name || !location || !(await accountExists(prisma, location))) return NextResponse.json({ error: 'A valid account and name are required.' }, { status: 400 });
  const row = await prisma.$transaction(tx=>createAccountContactRecord(tx,{organizationId,userId:user.id},{
    name, role: optional(body?.role), email: optional(body?.email), phone: optional(body?.phone),
    ...(location.accountType === 'AGENCY' ? { agencyId: location.agencyId } : { wholesaleAccountId: location.wholesaleAccountId }),
  }));
  const {id,role,email,phone,agencyId,wholesaleAccountId,active,isPrimary}=row;
  const contact={id,name:row.name,role,email,phone,agencyId,wholesaleAccountId,active,isPrimary};
  return NextResponse.json(contact, { status: 201 });
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role === 'TASTER') return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { organizationId } = await requireOrganizationContext(user);
  const q = request.nextUrl.searchParams.get('q')?.trim().slice(0, 200) ?? '';
  if (q.length < 2) return NextResponse.json([]);
  const exclude = request.nextUrl.searchParams.get('exclude') ?? '';
  const current = exclude ? await prisma.locationContact.findFirst({ where: { organizationId, id: exclude }, select: { personKey: true } }) : null;
  const rows = await prisma.locationContact.findMany({ where: { organizationId, active: true, mergedIntoContactId: null, id: { not: exclude }, OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { emailAliases: { has: q.toLowerCase() } }, ...(current?.personKey ? [{ personKey: current.personKey }] : [])] }, take: 20, orderBy: { name: 'asc' }, select: { id: true, name: true, email: true, agencyId: true, wholesaleAccountId: true } });
  const [agencies, wholesale] = await Promise.all([
    prisma.agency.findMany({ where: { id: { in: rows.map(row => row.agencyId).filter((id): id is string => Boolean(id)) } }, select: { id: true, name: true } }),
    prisma.wholesaleAccount.findMany({ where: { id: { in: rows.map(row => row.wholesaleAccountId).filter((id): id is string => Boolean(id)) } }, select: { id: true, name: true } }),
  ]);
  const names = new Map([...agencies, ...wholesale].map(row => [row.id, row.name]));
  return NextResponse.json(rows.map(row => ({ id: row.id, name: row.name, email: row.email, accountType: row.agencyId ? "AGENCY" : "WHOLESALE", accountId: row.agencyId ?? row.wholesaleAccountId, accountName: names.get(row.agencyId ?? row.wholesaleAccountId ?? '') ?? 'Account' })));
}
