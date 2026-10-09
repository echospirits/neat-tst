import { acknowledgeSupportUpdate, getSupportActor, removeSupportScreenshot, replyToSupportTicket } from '../../../../lib/support';
import { checkSupportOrigin, readSupportBody, supportFailure, supportHeaders } from '../../../../lib/supportHttp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    checkSupportOrigin(request);
    await getSupportActor();
    const { id } = await context.params;
    const input = JSON.parse((await readSupportBody(request, 32 * 1024)).toString('utf8'));
    if (input.action === 'seen') await acknowledgeSupportUpdate(id, input.version);
    else if (input.action === 'remove-screenshot') await removeSupportScreenshot(id);
    else await replyToSupportTicket(id, input);
    return Response.json({ saved: true }, { headers: supportHeaders });
  } catch (error) { return supportFailure(error); }
}
