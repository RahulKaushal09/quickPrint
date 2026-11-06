// Encrypts shop payment secrets before they reach the database (AES-256-GCM).
// Losing ENCRYPTION_KEY means every shop must reconnect Razorpay.

import crypto from 'node:crypto';
import { config } from './config';

const key = crypto.createHash('sha256').update(config.encryptionKey).digest();

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(value: string): string {
  const [iv, tag, data] = value.split('.').map((p) => Buffer.from(p, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv!);
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(data!), decipher.final()]).toString('utf8');
}
