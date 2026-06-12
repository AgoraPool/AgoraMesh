import type { EncryptedSecret } from '../../types/domain';
import { base64FromBytes, bytesFromBase64, bytesToUtf8, utf8ToBytes } from './encoding';

const iterations = 310_000;

async function deriveLocalSecretKey(passphrase: string, salt: Uint8Array, keyIterations: number): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', utf8ToBytes(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: keyIterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptLocalSecret(plaintext: string, passphrase: string): Promise<EncryptedSecret> {
  if (passphrase.length < 10) {
    throw new Error('Passphrase must be at least 10 characters.');
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveLocalSecretKey(passphrase, salt, iterations);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, utf8ToBytes(plaintext));
  return {
    ciphertext: base64FromBytes(new Uint8Array(ciphertext)),
    iv: base64FromBytes(iv),
    salt: base64FromBytes(salt),
    iterations,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA-256'
  };
}

export async function decryptLocalSecret(secret: EncryptedSecret, passphrase: string): Promise<string> {
  const key = await deriveLocalSecretKey(passphrase, bytesFromBase64(secret.salt), secret.iterations);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytesFromBase64(secret.iv) },
    key,
    bytesFromBase64(secret.ciphertext)
  );
  return bytesToUtf8(new Uint8Array(plaintext));
}

