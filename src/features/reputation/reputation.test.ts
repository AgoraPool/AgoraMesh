import { bytesToHex } from '@noble/hashes/utils';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { createSignedAttestation, verifyAttestation } from '../../lib/crypto/attestations';

describe('reputation attestations', () => {
  it('signs and verifies contextual reputation', () => {
    const privateKey = generateSecretKey();
    const reviewerPublicKey = getPublicKey(privateKey);
    const attestation = createSignedAttestation(
      {
        reviewerPublicKey,
        subjectPublicKey: 'b'.repeat(64),
        agreementHash: 'c'.repeat(64),
        role: 'seller',
        tags: ['fulfilled-agreement', 'clear-communication'],
        text: 'Delivered as agreed.'
      },
      bytesToHex(privateKey)
    );

    expect(verifyAttestation(attestation)).toBe(true);
    expect(verifyAttestation({ ...attestation, text: 'tampered' })).toBe(false);
  });
});
