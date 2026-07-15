export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { requireUser } from '../../../../../lib/auth';
import { getTargetAccountBriefing } from '../../../../../lib/targetAccountIntelligence';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const briefing = await getTargetAccountBriefing({ wholesaleAccountId: id });

  if (!briefing) {
    return Response.json({ error: 'Target account not found' }, { status: 404 });
  }

  return Response.json(briefing);
}
