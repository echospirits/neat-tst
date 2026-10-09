import { getSupportScreenshot } from '../../../../../lib/support';
import { supportFailure, supportHeaders } from '../../../../../lib/supportHttp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const screenshot = await getSupportScreenshot((await context.params).id);
    return new Response(new Uint8Array(screenshot.bytes), { headers: { ...supportHeaders, 'Content-Type': screenshot.contentType, 'Content-Disposition': 'inline', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
  } catch (error) { return supportFailure(error); }
}
