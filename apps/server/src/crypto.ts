// SPDX-License-Identifier: Apache-2.0
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
export const generateKey = () => `pk_${randomBytes(32).toString('base64url')}`;
export function encrypt(value: string, key: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'base64'), iv);
  return Buffer.concat([
    iv,
    cipher.update(value, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString('base64');
}
export function decrypt(value: string, key: string) {
  const data = Buffer.from(value, 'base64');
  const cipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(key, 'base64'),
    data.subarray(0, 12),
  );
  cipher.setAuthTag(data.subarray(-16));
  return Buffer.concat([
    cipher.update(data.subarray(12, -16)),
    cipher.final(),
  ]).toString('utf8');
}
