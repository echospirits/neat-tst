import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { decryptCalendarToken, encryptCalendarToken } from '../calendar/crypto';

type SocialEncryptionKeyName = 'SOCIAL_TOKEN_ENCRYPTION_KEY' | 'CALENDAR_TOKEN_ENCRYPTION_KEY';

/** Expose readiness and the selected variable name, never key material. */
export function getSocialCryptoConfiguration(): { keyName: SocialEncryptionKeyName; configured: boolean } {
  const dedicated = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY?.trim();
  const keyName = dedicated ? 'SOCIAL_TOKEN_ENCRYPTION_KEY' : 'CALENDAR_TOKEN_ENCRYPTION_KEY';
  return { keyName, configured: (process.env[keyName]?.trim().length ?? 0) >= 32 };
}

function dedicatedKey() {
  const value = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY?.trim();
  if (!value || value.length < 32) throw new Error('SOCIAL_TOKEN_ENCRYPTION_KEY must contain at least 32 characters.');
  return new Uint8Array(createHash('sha256').update(value).digest());
}

/** New dedicated ciphertext has its own version; absent override retains legacy writes. */
export function encryptSocialToken(plainText: string): string {
  if (getSocialCryptoConfiguration().keyName === 'CALENDAR_TOKEN_ENCRYPTION_KEY') return encryptCalendarToken(plainText);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', dedicatedKey(), new Uint8Array(iv));
  const encrypted = Buffer.concat([new Uint8Array(cipher.update(plainText, 'utf8')), new Uint8Array(cipher.final())]);
  return ['s1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptSocialToken(encoded: string): string {
  if (encoded.startsWith('v1.')) return decryptCalendarToken(encoded);
  const [version, ivValue, tagValue, encryptedValue, extra] = encoded.split('.');
  if (version !== 's1' || !ivValue || !tagValue || encryptedValue === undefined || extra !== undefined || ![ivValue, tagValue, encryptedValue].every(value => /^[A-Za-z0-9_-]*$/.test(value))) throw new Error('Invalid encrypted social token.');
  const iv = Buffer.from(ivValue, 'base64url');
  const tag = Buffer.from(tagValue, 'base64url');
  const encrypted = Buffer.from(encryptedValue, 'base64url');
  if (iv.length !== 12 || tag.length !== 16 || iv.toString('base64url') !== ivValue || tag.toString('base64url') !== tagValue || encrypted.toString('base64url') !== encryptedValue) throw new Error('Invalid encrypted social token.');
  const decipher = createDecipheriv('aes-256-gcm', dedicatedKey(), new Uint8Array(iv));
  decipher.setAuthTag(new Uint8Array(tag));
  return Buffer.concat([new Uint8Array(decipher.update(new Uint8Array(encrypted))), new Uint8Array(decipher.final())]).toString('utf8');
}
