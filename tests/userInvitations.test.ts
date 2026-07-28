import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createUserInvitationToken,
  getUserInvitationUrl,
  hashUserInvitationToken,
  renderUserInvitationEmail,
  USER_INVITATION_HOURS,
} from '../lib/userInvitations';

test('user invitation tokens are hashed and expire after 72 hours', () => {
  const now = new Date('2026-07-28T12:00:00.000Z');
  const invitation = createUserInvitationToken(now);

  assert.notEqual(invitation.token, invitation.tokenHash);
  assert.equal(invitation.tokenHash, hashUserInvitationToken(invitation.token));
  assert.equal(
    invitation.expiresAt.getTime(),
    now.getTime() + USER_INVITATION_HOURS * 60 * 60 * 1000,
  );
});

test('invitation URL encodes the token and email includes the password setup action', () => {
  const inviteUrl = getUserInvitationUrl('token with spaces', 'https://crm.example.com/');
  const rendered = renderUserInvitationEmail({
    inviteUrl,
    recipientName: 'Alex & Taylor',
  });

  assert.equal(inviteUrl, 'https://crm.example.com/accept-invite?token=token%20with%20spaces');
  assert.match(rendered.subject, /invited/i);
  assert.match(rendered.text, /Create your .* password/i);
  assert.match(rendered.html, /Create my password/);
  assert.match(rendered.html, /Alex &amp; Taylor/);
});
