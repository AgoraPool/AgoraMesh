import { describe, expect, it } from 'vitest';
import { createExtensionIdentity, identityCanUseLocalUnlock, activeSigningPublicKey, signerIdentityStatus } from './identity';
import { identityRecordSchema } from '../validation/schemas';
import type { IdentityRecord, NostrSignerState } from '../../types/domain';

const encryptedPrivateKey = {
  ciphertext: 'encrypted',
  iv: 'iv',
  salt: 'salt',
  iterations: 310000,
  algorithm: 'AES-GCM',
  kdf: 'PBKDF2-SHA-256'
} as const;

const localIdentity: IdentityRecord = {
  id: 'identity_local',
  displayName: 'Local',
  publicKey: 'a'.repeat(64),
  keySource: 'local',
  encryptedPrivateKey,
  createdAt: '2026-06-02T00:00:00.000Z',
  updatedAt: '2026-06-02T00:00:00.000Z'
};

const disconnectedSigner: NostrSignerState = { available: true, connected: false };

describe('identity models', () => {
  it('requires encrypted private key material for local identities', () => {
    expect(identityRecordSchema.parse(localIdentity)).toMatchObject({ keySource: 'local' });
    expect(() => identityRecordSchema.parse({ ...localIdentity, encryptedPrivateKey: undefined })).toThrow();
    expect(identityCanUseLocalUnlock(localIdentity)).toBe(true);
  });

  it('creates extension identities without persisted private key material', () => {
    const identity = createExtensionIdentity('b'.repeat(64), 'Existing account');

    expect(identityRecordSchema.parse(identity)).toMatchObject({
      keySource: 'nostr-extension',
      publicKey: 'b'.repeat(64)
    });
    expect(JSON.stringify(identity)).not.toContain('encryptedPrivateKey');
    expect(identityCanUseLocalUnlock(identity)).toBe(false);
    expect(() => identityRecordSchema.parse({ ...identity, encryptedPrivateKey })).toThrow();
  });

  it('selects only a matching active signing key', () => {
    const matchingSigner: NostrSignerState = { available: true, connected: true, publicKey: 'b'.repeat(64) };
    const mismatchedSigner: NostrSignerState = { available: true, connected: true, publicKey: 'c'.repeat(64) };

    expect(activeSigningPublicKey(localIdentity, matchingSigner, 'private', 'b'.repeat(64))).toBe('b'.repeat(64));
    expect(activeSigningPublicKey(localIdentity, mismatchedSigner, 'private', localIdentity.publicKey)).toBe(localIdentity.publicKey);
    expect(activeSigningPublicKey(localIdentity, disconnectedSigner, 'private', localIdentity.publicKey)).toBe(localIdentity.publicKey);
    expect(activeSigningPublicKey(localIdentity, disconnectedSigner, '', localIdentity.publicKey)).toBeUndefined();
  });

  it('reports signer identity status states', () => {
    expect(signerIdentityStatus(undefined, { available: false, connected: false }).state).toBe('unavailable');
    expect(signerIdentityStatus(undefined, { available: true, connected: false }).state).toBe('available');
    expect(signerIdentityStatus(undefined, { available: true, connected: true, publicKey: 'b'.repeat(64) }).state).toBe('connected');
    expect(signerIdentityStatus(localIdentity, { available: true, connected: true, publicKey: localIdentity.publicKey }).state).toBe('active-identity');
    expect(signerIdentityStatus(localIdentity, { available: true, connected: true, publicKey: 'c'.repeat(64) }).state).toBe('connected-mismatch');
  });
});
