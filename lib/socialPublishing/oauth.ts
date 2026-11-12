import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { encryptCalendarToken, decryptCalendarToken } from '../calendar/crypto';
import { assertSocialActor, type SocialDb } from './service';
import type { SocialActor } from './access';
import {
  getSocialProvider,
  buildOAuthAuthorizationUrl,
  exchangeOAuthCode,
  getOAuthConfiguration,
} from './providers';
import type { SocialProvider } from './types';
export const socialOAuthProviders = {
  meta: 'FACEBOOK',
  google: 'GOOGLE_BUSINESS',
  linkedin: 'LINKEDIN',
} as const;
export type SocialOAuthFamily = keyof typeof socialOAuthProviders;
export function socialOAuthFamily(value: string): SocialOAuthFamily {
  if (!Object.hasOwn(socialOAuthProviders, value))
    throw new Error('Unknown social provider.');
  return value as SocialOAuthFamily;
}
const stateHash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export async function startSocialOAuth(
  db: SocialDb,
  actor: SocialActor,
  sessionHash: string,
  family: SocialOAuthFamily,
) {
  await assertSocialActor(db, actor, true);
  const provider = socialOAuthProviders[family];
  const base = process.env.APP_BASE_URL;
  if (!base) throw new Error('Configure APP_BASE_URL before connecting.');
  const config = getOAuthConfiguration(provider, base);
  if (!config.configured)
    throw new Error(`Missing ${config.missing.join(', ')}.`);
  if (
    !process.env.CALENDAR_TOKEN_ENCRYPTION_KEY ||
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY.length < 32
  )
    throw new Error(
      'Configure CALENDAR_TOKEN_ENCRYPTION_KEY before connecting.',
    );
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  await db.socialOAuthState.create({
    data: {
      id: stateHash(state),
      organizationId: actor.organizationId,
      userId: actor.userId,
      sessionHash,
      provider,
      verifierEncrypted: encryptCalendarToken(verifier),
      expiresAt: new Date(Date.now() + 600_000),
    },
  });
  return buildOAuthAuthorizationUrl(provider, {
    state,
    redirectUri: config.callbackUrl,
    codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
  });
}
export async function consumeSocialOAuthState(
  db: SocialDb,
  actor: SocialActor,
  sessionHash: string,
  family: SocialOAuthFamily,
  state: string,
) {
  await assertSocialActor(db, actor, true);
  if (!/^[A-Za-z0-9_-]{43}$/.test(state))
    throw new Error('Authorization state invalid.');
  const stored = await db.socialOAuthState.findFirst({
    where: {
      id: stateHash(state),
      organizationId: actor.organizationId,
      userId: actor.userId,
      sessionHash,
      provider: socialOAuthProviders[family],
      expiresAt: { gt: new Date() },
    },
  });
  if (!stored)
    throw new Error('Authorization expired or belongs to another session.');
  const consumed = await db.socialOAuthState.deleteMany({
    where: { id: stored.id, sessionHash },
  });
  if (consumed.count !== 1) throw new Error('Authorization already used.');
  return stored;
}
export async function completeSocialOAuth(
  actor: SocialActor,
  family: SocialOAuthFamily,
  code: string,
  state: Awaited<ReturnType<typeof consumeSocialOAuthState>>,
  db: import('@prisma/client').PrismaClient,
) {
  const provider = socialOAuthProviders[family];
  const base = process.env.APP_BASE_URL!;
  const credentials = await exchangeOAuthCode(provider, {
    code,
    redirectUri: getOAuthConfiguration(provider, base).callbackUrl,
    codeVerifier: state.verifierEncrypted
      ? decryptCalendarToken(state.verifierEncrypted)
      : undefined,
  });
  const providers: SocialProvider[] =
    family === 'meta' ? ['FACEBOOK', 'INSTAGRAM'] : [provider];
  let discovered = 0;
  let discoveryFailures = 0;
  for (const key of providers) {
    let destinations: Awaited<
      ReturnType<ReturnType<typeof getSocialProvider>['discover']>
    >;
    try {
      destinations = await getSocialProvider(key).discover(credentials);
    } catch {
      discoveryFailures++;
      continue;
    }
    for (const destination of destinations) {
      await db.$transaction(
        async (tx) => {
          await assertSocialActor(tx, actor, true);
          const token = destination.credentials ?? credentials;
          const old = await tx.socialDestination.findUnique({
            where: {
              organizationId_provider_externalId: {
                organizationId: actor.organizationId,
                provider: destination.provider,
                externalId: destination.externalId,
              },
            },
          });
          const data = {
            organizationId: actor.organizationId,
            provider: destination.provider,
            authorizationOwnerId: token.ownerId ?? actor.userId,
            credentialsEncrypted: encryptCalendarToken(JSON.stringify(token)),
            scopes: token.scopes,
            expiresAt: token.expiresAt ? new Date(token.expiresAt) : null,
            health: 'CONNECTED_UNVERIFIED',
          };
          const credential = old
            ? await tx.socialCredential.update({
                where: { id: old.credentialId },
                data,
              })
            : await tx.socialCredential.create({ data });
          const metadata = {
            displayName: destination.displayName,
            handle: destination.handle,
            profileImageUrl: destination.profileImageUrl,
            metadata: destination.metadata as Prisma.InputJsonValue,
            health: 'CONNECTED_UNVERIFIED',
            enabled: true,
            credentialId: credential.id,
          };
          await tx.socialDestination.upsert({
            where: {
              organizationId_provider_externalId: {
                organizationId: actor.organizationId,
                provider: destination.provider,
                externalId: destination.externalId,
              },
            },
            create: {
              organizationId: actor.organizationId,
              provider: destination.provider,
              externalId: destination.externalId,
              ...metadata,
            },
            update: metadata,
          });
        },
        { timeout: 15000 },
      );
      discovered++;
    }
  }
  return { discovered, discoveryFailures };
}
