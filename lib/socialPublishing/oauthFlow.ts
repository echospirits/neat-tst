import type { PrismaClient } from '@prisma/client';
import type { SocialActor } from './access';
import { completeSocialOAuth, consumeSocialOAuthState, startSocialOAuth, type SocialOAuthFamily } from './oauth';

export type SocialOAuthFlowDependencies = {
  db: PrismaClient;
  withScope: <T>(organizationId: string, work: () => Promise<T>) => Promise<T>;
};

/** Load the existing account-state scope before an interactive transaction holds a pool connection. */
export function startScopedSocialOAuth(actor: SocialActor, sessionHash: string, family: SocialOAuthFamily, dependencies: SocialOAuthFlowDependencies) {
  return dependencies.withScope(actor.organizationId, () => dependencies.db.$transaction(tx => startSocialOAuth(tx, actor, sessionHash, family)));
}

/** Keep the same primed policy context through state consumption and every destination-persistence transaction. */
export function completeScopedSocialOAuth(actor: SocialActor, sessionHash: string, family: SocialOAuthFamily, input: { state: string; code: string | null; denied: boolean }, dependencies: SocialOAuthFlowDependencies) {
  return dependencies.withScope(actor.organizationId, async () => {
    const state = await dependencies.db.$transaction(tx => consumeSocialOAuthState(tx, actor, sessionHash, family, input.state));
    if (input.denied || !input.code) throw new Error('Authorization not granted.');
    return completeSocialOAuth(actor, family, input.code, state, dependencies.db);
  });
}
