import { createSupportTicket, getSupportActor } from '../../../lib/support';
import { checkSupportOrigin, readSupportBody, supportFailure, supportHeaders } from '../../../lib/supportHttp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    checkSupportOrigin(request);
    await getSupportActor();
    const bytes = await readSupportBody(request, 1024 * 1024);
    const form = await new Request(request.url, { method: 'POST', headers: { 'content-type': request.headers.get('content-type') ?? '' }, body: new Uint8Array(bytes) }).formData();
    const file = form.get('screenshot');
    const screenshot = file instanceof File && file.size ? { bytes: new Uint8Array(await file.arrayBuffer()), contentType: file.type } : undefined;
    const ticket = await createSupportTicket({ requestId: form.get('requestId'), title: form.get('title'), description: form.get('description'), category: form.get('category') },
      form.get('diagnostics') ? JSON.parse(String(form.get('diagnostics'))) : {}, screenshot);
    return Response.json(ticket, { status: 201, headers: supportHeaders });
  } catch (error) { return supportFailure(error); }
}
