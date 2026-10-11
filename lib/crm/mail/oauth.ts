import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { getAppEnvironment } from "../../appEnvironment";
import {
  encryptCalendarToken,
  decryptCalendarToken,
} from "../../calendar/crypto";
import { prisma } from "../../prisma";
import { CrmError, type CrmActor } from "../activity";
import { MailProviderError, providerJson, type MailProvider } from "./types";

export const providerInput = z.enum(["GOOGLE", "MICROSOFT"]);
export const hashOAuthState = (state: string) =>
  createHash("sha256").update(state).digest("hex");
export function mailConfig(
  provider: Exclude<MailProvider, "MOCK">,
  env: NodeJS.ProcessEnv = process.env,
) {
  const google = provider === "GOOGLE";
  const clientId =
    env[google ? "CRM_GOOGLE_CLIENT_ID" : "CRM_MICROSOFT_CLIENT_ID"];
  const secret =
    env[google ? "CRM_GOOGLE_CLIENT_SECRET" : "CRM_MICROSOFT_CLIENT_SECRET"];
  const base = env.APP_BASE_URL?.replace(/\/+$/, "");
  if (
    env.CRM_MAIL_ENABLED !== "true" ||
    !clientId ||
    !secret ||
    !base ||
    !env.CALENDAR_TOKEN_ENCRYPTION_KEY
  )
    throw new MailProviderError("NOT_CONFIGURED");
  if (env.OAUTH_ENVIRONMENT !== getAppEnvironment(env))
    throw new MailProviderError("NOT_CONFIGURED");
  const url = new URL(base);
  if (
    url.protocol !== "https:" &&
    !(getAppEnvironment(env) === "development" && url.hostname === "localhost")
  )
    throw new MailProviderError("NOT_CONFIGURED");
  return {
    clientId,
    secret,
    redirectUri: `${base}/api/crm/mail/${provider.toLowerCase()}/callback`,
    authorize: google
      ? "https://accounts.google.com/o/oauth2/v2/auth"
      : "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: google
      ? "https://oauth2.googleapis.com/token"
      : "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: google
      ? "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events.readonly"
      : "offline_access User.Read Mail.ReadBasic Calendars.Read",
  };
}
export async function beginMailboxOAuth(
  actor: CrmActor,
  provider: Exclude<MailProvider, "MOCK">,
) {
  const config = mailConfig(provider),
    state = randomBytes(32).toString("base64url"),
    verifier = randomBytes(48).toString("base64url");
  await prisma.$transaction(async (tx) => {
    await tx.mailboxOAuthState.deleteMany({ where: { ...actor, provider } });
    await tx.mailboxOAuthState.create({
      data: {
        ...actor,
        userId: actor.userId,
        provider,
        stateHash: hashOAuthState(state),
        verifierEncrypted: encryptCalendarToken(verifier),
        expiresAt: new Date(Date.now() + 10 * 60000),
      },
    });
  });
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: config.scope,
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    ...(provider === "GOOGLE"
      ? { access_type: "offline", prompt: "consent" }
      : { response_mode: "query" }),
  });
  return `${config.authorize}?${params}`;
}
const tokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  expires_in: z.number().positive(),
  scope: z.string().optional(),
});
async function tokenRequest(
  provider: Exclude<MailProvider, "MOCK">,
  values: Record<string, string>,
  fetcher: typeof fetch = fetch,
) {
  const config = mailConfig(provider);
  let response: Response;
  try {
    response = await fetcher(config.token, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.secret,
        ...values,
      }),
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
  } catch {
    throw new MailProviderError("RETRY");
  }
  if (!response.ok)
    throw new MailProviderError(
      response.status === 400 || response.status === 401
        ? "RECONNECT"
        : "RETRY",
    );
  return tokensSchema.parse(await response.json());
}
export async function finishMailboxOAuth(
  actor: CrmActor,
  provider: Exclude<MailProvider, "MOCK">,
  state: string,
  code: string,
) {
  const config = mailConfig(provider),
    stateHash = hashOAuthState(state);
  const stored = await prisma.mailboxOAuthState.findFirst({
    where: { stateHash, ...actor, provider, expiresAt: { gt: new Date() } },
  });
  if (!stored) throw new CrmError("Authorization expired. Connect again.");
  const tokens = await tokenRequest(provider, {
    code,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
    code_verifier: decryptCalendarToken(stored.verifierEncrypted),
  });
  const granted = new Set(
    (tokens.scope ?? "")
      .split(/\s+/)
      .map((scope) =>
        provider === "MICROSOFT"
          ? scope.replace(/^https:\/\/graph\.microsoft\.com\//, "")
          : scope,
      ),
  );
  const required =
    provider === "GOOGLE"
      ? config.scope.split(" ")
      : ["User.Read", "Mail.ReadBasic", "Calendars.Read"];
  if (!required.every((scope) => granted.has(scope)))
    throw new CrmError("Required read permissions were not granted.");
  let providerAccountId: string, email: string;
  if (provider === "GOOGLE") {
    const profile = z
      .object({ emailAddress: z.string().email() })
      .parse(
        await providerJson(
          "https://gmail.googleapis.com/gmail/v1/users/me/profile",
          tokens.access_token,
        ),
      );
    email = profile.emailAddress.toLowerCase();
    providerAccountId = email;
  } else {
    const profile = z
      .object({
        id: z.string(),
        mail: z.string().nullable().optional(),
        userPrincipalName: z.string(),
      })
      .parse(
        await providerJson(
          "https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName",
          tokens.access_token,
        ),
      );
    providerAccountId = profile.id;
    email = z
      .string()
      .email()
      .parse(profile.mail || profile.userPrincipalName)
      .toLowerCase();
  }
  await prisma.$transaction(
    async (tx) => {
      // Consume only while committing the connection. Disconnect cancels this state,
      // including callbacks whose provider requests were already in flight.
      const consumed = await tx.mailboxOAuthState.deleteMany({
        where: { id: stored.id, ...actor, expiresAt: { gt: new Date() } },
      });
      if (consumed.count !== 1)
        throw new CrmError(
          "Authorization expired or cancelled. Connect again.",
        );
      const member = await tx.user.findFirst({
        where: {
          id: actor.userId,
          organizationId: actor.organizationId,
          isActive: true,
        },
      });
      if (!member)
        throw new CrmError("Organization membership changed. Sign in again.");
      const existing = await tx.mailboxConnection.findUnique({
        where: { organizationId_userId_provider: { ...actor, provider } },
      });
      if (existing && existing.providerAccountId !== providerAccountId)
        throw new CrmError(
          "Disconnect and delete the old connection before changing mailbox identity.",
        );
      if (existing?.leaseUntil && existing.leaseUntil > new Date())
        throw new CrmError(
          "Synchronization is active. Retry the connection shortly.",
        );
      const data = {
        providerAccountId,
        email,
        accessTokenEncrypted: encryptCalendarToken(tokens.access_token),
        refreshTokenEncrypted: tokens.refresh_token
          ? encryptCalendarToken(tokens.refresh_token)
          : (existing?.refreshTokenEncrypted ?? null),
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        scope: tokens.scope ?? config.scope,
        enabled: true,
        errorCode: null,
      };
      if (!data.refreshTokenEncrypted)
        throw new CrmError(
          "Offline access was not granted. Reconnect and approve offline access.",
        );
      await tx.mailboxConnection.upsert({
        where: { organizationId_userId_provider: { ...actor, provider } },
        create: { ...actor, provider, ...data },
        update: data,
      });
    },
    { isolationLevel: "Serializable" },
  );
}
export async function mailboxAccessToken(
  connection: {
    id: string;
    organizationId: string;
    provider: string;
    accessTokenEncrypted: string | null;
    refreshTokenEncrypted: string | null;
    tokenExpiresAt: Date | null;
  },
  leaseId: string,
) {
  if (
    connection.accessTokenEncrypted &&
    connection.tokenExpiresAt &&
    connection.tokenExpiresAt.getTime() > Date.now() + 60000
  )
    return decryptCalendarToken(connection.accessTokenEncrypted);
  if (!connection.refreshTokenEncrypted)
    throw new MailProviderError("RECONNECT");
  const provider = providerInput.parse(connection.provider);
  const tokens = await tokenRequest(provider, {
    grant_type: "refresh_token",
    refresh_token: decryptCalendarToken(connection.refreshTokenEncrypted),
    ...(provider === "MICROSOFT" ? { scope: mailConfig(provider).scope } : {}),
  });
  const updated = await prisma.mailboxConnection.updateMany({
    where: {
      id: connection.id,
      organizationId: connection.organizationId,
      enabled: true,
      leaseId,
    },
    data: {
      accessTokenEncrypted: encryptCalendarToken(tokens.access_token),
      ...(tokens.refresh_token
        ? { refreshTokenEncrypted: encryptCalendarToken(tokens.refresh_token) }
        : {}),
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    },
  });
  if (!updated.count)
    throw new CrmError("Connection changed while synchronizing.");
  return tokens.access_token;
}
