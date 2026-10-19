import { SupportError } from './support';

export const supportHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

export function checkSupportOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) throw new SupportError('Please send this request from Neat.', 403);
}

export async function readSupportBody(request: Request, maxBytes: number) {
  if (Number(request.headers.get('content-length') ?? 0) > maxBytes) throw new SupportError('This request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new SupportError('Add the report details.');
  const parts: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    length += result.value.length;
    if (length > maxBytes) { await reader.cancel(); throw new SupportError('This request is too large.', 413); }
    parts.push(result.value);
  }
  return Buffer.concat(parts);
}

export function supportFailure(error: unknown) {
  if (error instanceof SupportError) return Response.json({ error: error.message, fields: error.fields }, { status: error.status, headers: supportHeaders });
  if (error instanceof SyntaxError || error instanceof TypeError) return Response.json({ error: 'Check the report details and try again.' }, { status: 400, headers: supportHeaders });
  // Never log reports, images, database errors with query parameters, or diagnostics.
  console.error('[support] Request failed');
  return Response.json({ error: 'Support could not save this request. Your text is still here; please try again.' }, { status: 503, headers: supportHeaders });
}
