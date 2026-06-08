import type { EncryptedRelayContentEnvelope } from '../../types/domain';
import { encryptedRelayContentEnvelopeSchema } from '../validation/schemas';
import { base64FromBytes, bytesFromBase64, bytesToUtf8, canonicalJson, nowIso, utf8ToBytes } from './encoding';

const iterations = 310_000;

async function deriveContentKey(passphrase: string, salt: Uint8Array, keyIterations: number): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', utf8ToBytes(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: keyIterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptRelayContent(payload: unknown, passphrase: string): Promise<EncryptedRelayContentEnvelope> {
  if (passphrase.length < 10) {
    throw new Error('Passphrase must be at least 10 characters.');
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveContentKey(passphrase, salt, iterations);
  const plaintext = canonicalJson({ schemaVersion: 1, kind: 'agoramesh-relay-payload', payload });
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, utf8ToBytes(plaintext));

  return {
    schemaVersion: 1,
    kind: 'encrypted-relay-content',
    createdAt: nowIso(),
    kdf: 'PBKDF2-SHA-256',
    algorithm: 'AES-GCM',
    iterations,
    salt: base64FromBytes(salt),
    iv: base64FromBytes(iv),
    ciphertext: base64FromBytes(new Uint8Array(ciphertext))
  };
}

export async function decryptRelayContent(envelope: EncryptedRelayContentEnvelope | unknown, passphrase: string): Promise<unknown> {
  const parsedEnvelope = encryptedRelayContentEnvelopeSchema.parse(envelope);
  const key = await deriveContentKey(passphrase, bytesFromBase64(parsedEnvelope.salt), parsedEnvelope.iterations);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytesFromBase64(parsedEnvelope.iv) },
    key,
    bytesFromBase64(parsedEnvelope.ciphertext)
  );
  const parsed: unknown = JSON.parse(bytesToUtf8(new Uint8Array(plaintext)));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid encrypted relay content.');
  }
  const record = parsed as Record<string, unknown>;
  if (record.schemaVersion !== 1 || record.kind !== 'agoramesh-relay-payload') {
    throw new Error('Unsupported encrypted relay content.');
  }
  return record.payload;
}

export function isEncryptedRelayContentEnvelope(value: unknown): value is EncryptedRelayContentEnvelope {
  return encryptedRelayContentEnvelopeSchema.safeParse(value).success;
}
