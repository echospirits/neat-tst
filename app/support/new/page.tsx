import { requireUserSession } from '../../../lib/auth';
import { buildPageMetadata } from '../../../lib/appBrand';
import { isSideEffectEnabled } from '../../../lib/appEnvironment';
import { requireOrganizationContext } from '../../../lib/organizations';
import { PageHeader } from '../../components/PageChrome';
import { SupportReportForm } from '../SupportReportForm';

export const dynamic = 'force-dynamic';
export const metadata = buildPageMetadata('Report an issue');
export default async function NewSupportPage() {
  const { user } = await requireUserSession({ allowTaster: true });
  const context = await requireOrganizationContext(user);
  return <><PageHeader eyebrow="Support" title="Report an issue" description="Tell us what you need. We already know who you are and your organization." /><SupportReportForm scope={`${user.id}:${context.organizationId}`} screenshotsEnabled={isSideEffectEnabled('fileUploads')} /></>;
}
