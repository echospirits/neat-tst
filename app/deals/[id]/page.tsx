import { redirect } from 'next/navigation';
import { requireCrmActor } from '../../../lib/crm/auth';
export default async function LegacyDealPage() { await requireCrmActor(); redirect('/pipeline'); }
