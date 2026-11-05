import { requireUser } from '../auth';
import { requireFeatureForUser } from '../organizations';
import { isAdminRole } from '../userAccess';

export async function requireTastingActor() {
  const user = await requireUser({ allowTaster: true });
  const context = await requireFeatureForUser(user, 'TASTING_MANAGEMENT');
  return {
    user,
    actor: { organizationId: context.organizationId, userId: user.id, role: user.role },
    coordinator: isAdminRole(user.role),
  };
}
