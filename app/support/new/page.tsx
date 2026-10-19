import { requireUserSession } from '../../../lib/auth';
import { buildPageMetadata } from '../../../lib/appBrand';
import { isSideEffectEnabled } from '../../../lib/appEnvironment';
import { getOrganizationContext, requireOrganizationContext } from '../../../lib/organizations';
import { prisma } from '../../../lib/prisma';
import { PageHeader } from '../../components/PageChrome';
import { SupportReportForm } from '../SupportReportForm';

export const dynamic = 'force-dynamic';
export const metadata = buildPageMetadata('New support ticket');
export default async function NewSupportPage() {
  const { user } = await requireUserSession({ allowTaster: true });
  const platform = user.role === 'PLATFORM_ADMIN';
  const context = platform ? await getOrganizationContext(user) : await requireOrganizationContext(user);
  const organizations = platform ? await prisma.organization.findMany({ orderBy: [{ displayName: 'asc' }, { id: 'asc' }], select: { id: true, displayName: true } }) : undefined;
  return <><PageHeader eyebrow="Support" title="New support ticket" description={platform ? 'Choose the organization this ticket belongs to, then tell us what you need. You will be its reporter.' : 'Tell us what you need. We already know who you are and your organization.'} /><SupportReportForm scope={`${user.id}:${context?.organizationId ?? ''}`} screenshotsEnabled={isSideEffectEnabled('fileUploads')} organizations={organizations} initialOrganizationId={context?.organizationId ?? ''} /></>;
}
