import { redirect } from 'next/navigation';
import { requireCrmActor } from '../../lib/crm/auth';
export default async function LegacyDealsPage() { await requireCrmActor(); redirect('/pipeline'); }
