export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { getCurrentSession } from '../../../../lib/auth';
import { getOrganizationContext } from '../../../../lib/organizations';
import { isAdminRole } from '../../../../lib/userAccess';
import { getCurrentOhlqBailmentReport } from '../../../../lib/ohlqBailmentReportStorage';

const privateHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
  Vary: 'Cookie',
  'X-Content-Type-Options': 'nosniff',
};

const failure = (status: number, message: string) => new Response(message, {
  status,
  headers: { ...privateHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
});

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) return failure(401, 'Sign in to download this report.');
    if (!isAdminRole(session.user.role)) return failure(403, 'Administrator access is required.');

    const context = await getOrganizationContext(session.user);
    if (!context || context.isSupportView || !session.user.organizationId
      || context.organizationId !== session.user.organizationId) {
      return failure(403, 'This report is available only to administrators of its organization.');
    }

    const report = await getCurrentOhlqBailmentReport(context.organizationId);
    if (!report) return failure(404, 'No saved Bailment PO and Invoice report is available yet.');

    return new Response(new Uint8Array(report.csvBuffer), {
      headers: {
        ...privateHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="ohlq-bailment-po-and-invoice.csv"',
      },
    });
  } catch {
    // Provider errors and financial contents must never reach the response or logs.
    return failure(503, 'The saved report could not be loaded. Try again shortly.');
  }
}
