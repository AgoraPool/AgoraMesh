import type { DisputeCase, EncryptedExportEnvelope } from '../../types/domain';
import { disputeCaseSchema, encryptedExportEnvelopeSchema } from '../validation/schemas';
import { base64FromBytes, bytesFromBase64, bytesToUtf8, nowIso, utf8ToBytes } from './encoding';

const iterations = 310_000;

async function deriveExportKey(passphrase: string, salt: Uint8Array, keyIterations: number): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', utf8ToBytes(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: keyIterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptDisputeBundle(dispute: DisputeCase, passphrase: string): Promise<EncryptedExportEnvelope> {
  if (passphrase.length < 10) {
    throw new Error('Passphrase must be at least 10 characters.');
  }

  const parsed = disputeCaseSchema.parse(dispute);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveExportKey(passphrase, salt, iterations);
  const plaintext = JSON.stringify({ schemaVersion: 1, kind: 'dispute-bundle', dispute: parsed });
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, utf8ToBytes(plaintext));

  return {
    schemaVersion: 1,
    kind: 'encrypted-dispute-bundle',
    createdAt: nowIso(),
    kdf: 'PBKDF2-SHA-256',
    algorithm: 'AES-GCM',
    iterations,
    salt: base64FromBytes(salt),
    iv: base64FromBytes(iv),
    ciphertext: base64FromBytes(new Uint8Array(ciphertext))
  };
}

export async function decryptDisputeBundle(envelope: EncryptedExportEnvelope | unknown, passphrase: string): Promise<DisputeCase> {
  const parsedEnvelope = encryptedExportEnvelopeSchema.parse(envelope);
  const key = await deriveExportKey(passphrase, bytesFromBase64(parsedEnvelope.salt), parsedEnvelope.iterations);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytesFromBase64(parsedEnvelope.iv) },
    key,
    bytesFromBase64(parsedEnvelope.ciphertext)
  );
  const parsed: unknown = JSON.parse(bytesToUtf8(new Uint8Array(plaintext)));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid dispute bundle.');
  }
  const record = parsed as Record<string, unknown>;
  if (record.schemaVersion !== 1 || record.kind !== 'dispute-bundle') {
    throw new Error('Unsupported dispute bundle.');
  }
  return disputeCaseSchema.parse(record.dispute);
}
