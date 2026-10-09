import { getUnreadSupportUpdates } from '../../../../lib/support';
import { supportFailure, supportHeaders } from '../../../../lib/supportHttp';

export const dynamic = 'force-dynamic';
export async function GET() {
  try { return Response.json({ updates: await getUnreadSupportUpdates() }, { headers: supportHeaders }); }
  catch (error) { return supportFailure(error); }
}
