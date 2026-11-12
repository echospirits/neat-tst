import { requireUser } from '../auth';
import { requireFeatureForUser } from '../organizations';
import { isAdminRole } from '../userAccess';
import { socialTesterEnabled } from './model';
import { notFound } from 'next/navigation';
export type SocialActor = {
  organizationId: string;
  userId: string;
  role: import('@prisma/client').UserRole;
};
export async function requireSocialActor(manage = false) {
  const user = await requireUser();
  const context = await requireFeatureForUser(user, 'SOCIAL_PUBLISHING');
  if (
    context.isSupportView ||
    !socialTesterEnabled(user.id) ||
    (manage && !isAdminRole(user.role))
  )
    notFound();
  return {
    user,
    context,
    actor: {
      organizationId: context.organizationId,
      userId: user.id,
      role: user.role,
    },
    canManage: isAdminRole(user.role),
  };
}
