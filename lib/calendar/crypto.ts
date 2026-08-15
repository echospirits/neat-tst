import { createCipheriv, createDecipheriv, createHash, randomBytes, type CipherKey } from 'crypto';

const getKey = () => {
  const configured = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY?.trim();
  if (!configured || configured.length < 32) {
    throw new Error('CALENDAR_TOKEN_ENCRYPTION_KEY must contain at least 32 characters.');
  }
  return createHash('sha256').update(configured).digest();
};

export const encryptCalendarToken = (plainText: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey() as unknown as CipherKey, iv as unknown as NodeJS.ArrayBufferView);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()] as unknown as Uint8Array[]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
};

export const decryptCalendarToken = (encoded: string) => {
  const [version, ivValue, tagValue, encryptedValue] = encoded.split('.');
  if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) throw new Error('Invalid encrypted calendar token.');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    getKey() as unknown as CipherKey,
    Buffer.from(ivValue, 'base64url') as unknown as NodeJS.ArrayBufferView,
  );
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url') as unknown as NodeJS.ArrayBufferView);
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url') as unknown as NodeJS.ArrayBufferView),
    decipher.final(),
  ] as unknown as Uint8Array[]).toString('utf8');
};
