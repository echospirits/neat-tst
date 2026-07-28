import { createHash, randomBytes } from 'crypto';
import { getEmailAppBaseUrl, sendEmail, type SendEmailFn } from './email/sendEmail';
import { getTenantConfig } from './tenantConfig';

export const USER_INVITATION_HOURS = 72;

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

export const hashUserInvitationToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

export function createUserInvitationToken(now = new Date()) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + USER_INVITATION_HOURS * 60 * 60 * 1000);

  return {
    expiresAt,
    token,
    tokenHash: hashUserInvitationToken(token),
  };
}

export const getUserInvitationUrl = (token: string, appBaseUrl = getEmailAppBaseUrl()) =>
  `${appBaseUrl.replace(/\/+$/, '')}/accept-invite?token=${encodeURIComponent(token)}`;

export function renderUserInvitationEmail({
  inviteUrl,
  recipientName,
}: {
  inviteUrl: string;
  recipientName: string;
}) {
  const { appName, entityName } = getTenantConfig();
  const safeName = escapeHtml(recipientName);
  const safeUrl = escapeHtml(inviteUrl);
  const safeAppName = escapeHtml(appName);
  const safeEntityName = escapeHtml(entityName);
  const subject = `You're invited to ${entityName}`;
  const text = [
    `Hello ${recipientName},`,
    '',
    `You've been invited to ${entityName}.`,
    `Create your ${appName} password using this link:`,
    inviteUrl,
    '',
    `This link expires in ${USER_INVITATION_HOURS} hours and can only be used once.`,
    'If you were not expecting this invitation, you can ignore this email.',
  ].join('\n');
  const html = `
    <!doctype html>
    <html>
      <body style="margin:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#172033;">
        <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
          <div style="background:#ffffff;border:1px solid #e1e6ed;border-radius:12px;padding:28px;">
            <h1 style="margin:0 0 16px;font-size:24px;">You're invited to ${safeEntityName}</h1>
            <p style="margin:0 0 12px;">Hello ${safeName},</p>
            <p style="margin:0 0 22px;line-height:1.5;">
              Create your ${safeAppName} password to finish setting up your account.
            </p>
            <p style="margin:0 0 24px;">
              <a href="${safeUrl}" style="display:inline-block;padding:12px 18px;background:#2458ff;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;">
                Create my password
              </a>
            </p>
            <p style="margin:0;color:#5f6b7a;font-size:13px;line-height:1.5;">
              This link expires in ${USER_INVITATION_HOURS} hours and can only be used once.
              If you were not expecting this invitation, you can ignore this email.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  return { html, subject, text };
}

export async function sendUserInvitationEmail({
  emailSender = sendEmail,
  invitationId,
  recipientEmail,
  recipientName,
  token,
}: {
  emailSender?: SendEmailFn;
  invitationId: string;
  recipientEmail: string;
  recipientName: string;
  token: string;
}) {
  const inviteUrl = getUserInvitationUrl(token);
  const rendered = renderUserInvitationEmail({ inviteUrl, recipientName });

  return emailSender({
    to: recipientEmail,
    ...rendered,
    idempotencyKey: `user-invitation-${invitationId}`,
  });
}
