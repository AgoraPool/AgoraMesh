import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import type { EncryptedSecret, IdentityRecord, LocalIdentityRecord, NostrSignerState, SignerIdentityStatus } from '../../types/domain';
import { base64FromBytes, bytesFromBase64, bytesToUtf8, newId, nowIso, utf8ToBytes } from './encoding';

const iterations = 310_000;

async function deriveAesKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', utf8ToBytes(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptPrivateKey(privateKeyHex: string, passphrase: string): Promise<EncryptedSecret> {
  if (passphrase.length < 10) {
    throw new Error('Passphrase must be at least 10 characters.');
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, utf8ToBytes(privateKeyHex));

  return {
    ciphertext: base64FromBytes(new Uint8Array(ciphertext)),
    iv: base64FromBytes(iv),
    salt: base64FromBytes(salt),
    iterations,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA-256'
  };
}

export async function decryptPrivateKey(secret: EncryptedSecret, passphrase: string): Promise<string> {
  const key = await deriveAesKey(passphrase, bytesFromBase64(secret.salt));
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytesFromBase64(secret.iv) },
    key,
    bytesFromBase64(secret.ciphertext)
  );
  return bytesToUtf8(new Uint8Array(plaintext));
}

export async function createIdentity(displayName: string, passphrase: string): Promise<IdentityRecord> {
  const privateKey = generateSecretKey();
  const privateKeyHex = bytesToHex(privateKey);
  const publicKey = getPublicKey(privateKey);
  const at = nowIso();

  return {
    id: newId('identity'),
    displayName,
    publicKey,
    keySource: 'local',
    encryptedPrivateKey: await encryptPrivateKey(privateKeyHex, passphrase),
    createdAt: at,
    updatedAt: at
  };
}

export function createExtensionIdentity(publicKey: string, displayName = 'Nostr account'): IdentityRecord {
  const at = nowIso();
  if (!/^[0-9a-f]{64}$/i.test(publicKey)) {
    throw new Error('Nostr signer public key must be 64 hex characters.');
  }
  return {
    id: newId('identity'),
    displayName: displayName.trim() || 'Nostr account',
    publicKey: publicKey.toLowerCase(),
    keySource: 'nostr-extension',
    createdAt: at,
    updatedAt: at
  };
}

export function identityCanUseLocalUnlock(identity?: IdentityRecord): identity is LocalIdentityRecord {
  return Boolean(identity && (identity.keySource ?? 'local') === 'local' && identity.encryptedPrivateKey);
}

export function activeSigningPublicKey(
  identity: IdentityRecord | undefined,
  signer: NostrSignerState,
  privateKeyHex: string,
  expectedPublicKey?: string
): string | undefined {
  if (signer.connected && signer.publicKey && (!expectedPublicKey || signer.publicKey.toLowerCase() === expectedPublicKey.toLowerCase())) {
    return signer.publicKey;
  }
  if (
    identityCanUseLocalUnlock(identity) &&
    privateKeyHex &&
    identity?.publicKey &&
    (!expectedPublicKey || identity.publicKey.toLowerCase() === expectedPublicKey.toLowerCase())
  ) {
    return identity.publicKey;
  }
  return undefined;
}

export function signerIdentityStatus(identity: IdentityRecord | undefined, signer: NostrSignerState): SignerIdentityStatus {
  if (!signer.available && !signer.connected) {
    return {
      state: 'unavailable',
      identityPublicKey: identity?.publicKey,
      message: 'Signer extension unavailable.'
    };
  }
  if (!signer.connected || !signer.publicKey) {
    return {
      state: 'available',
      identityPublicKey: identity?.publicKey,
      message: 'Signer extension available.'
    };
  }
  if (!identity) {
    return {
      state: 'connected',
      signerPublicKey: signer.publicKey,
      message: 'Signer connected but not saved as the active identity.'
    };
  }
  if (identity.publicKey.toLowerCase() === signer.publicKey.toLowerCase()) {
    return {
      state: 'active-identity',
      signerPublicKey: signer.publicKey,
      identityPublicKey: identity.publicKey,
      message: 'Signer is the active identity.'
    };
  }
  return {
    state: 'connected-mismatch',
    signerPublicKey: signer.publicKey,
    identityPublicKey: identity.publicKey,
    message: 'Signer is connected but does not match the active identity.'
  };
}

export function privateKeyBytes(privateKeyHex: string): Uint8Array {
  return hexToBytes(privateKeyHex);
}
