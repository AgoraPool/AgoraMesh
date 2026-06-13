import { bytesToHex } from '@noble/hashes/utils';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { describe, expect, it } from 'vitest';
import { createSignedAttestation, verifyAttestation } from './attestations';

describe('reputation review attestations', () => {
  it('keeps old unscored attestations valid', () => {
    const reviewerKey = generateSecretKey();
    const reviewerPublicKey = getPublicKey(reviewerKey);
    const attestation = createSignedAttestation(
      {
        reviewerPublicKey,
        subjectPublicKey: 'a'.repeat(64),
        agreementHash: 'b'.repeat(64),
        role: 'seller',
        tags: ['fulfilled-agreement'],
        text: 'Completed as agreed.'
      },
      bytesToHex(reviewerKey)
    );

    expect(attestation.score).toBeUndefined();
    expect(verifyAttestation(attestation)).toBe(true);
  });

  it('binds score and listing context into the attestation signature', () => {
    const reviewerKey = generateSecretKey();
    const reviewerPublicKey = getPublicKey(reviewerKey);
    const attestation = createSignedAttestation(
      {
        reviewerPublicKey,
        subjectPublicKey: 'a'.repeat(64),
        agreementHash: 'b'.repeat(64),
        role: 'seller',
        score: 5,
        listingId: 'listing_1',
        listingTitle: 'Repair work',
        listingCoordinate: `30402:${'a'.repeat(64)}:listing_1`,
        tags: ['fulfilled-agreement', 'clear-communication'],
        text: 'Reliable seller.'
      },
      bytesToHex(reviewerKey)
    );

    expect(verifyAttestation(attestation)).toBe(true);
    expect(verifyAttestation({ ...attestation, score: 4 })).toBe(false);
    expect(verifyAttestation({ ...attestation, listingCoordinate: `30402:${'a'.repeat(64)}:other` })).toBe(false);
    expect(verifyAttestation({ ...attestation, text: 'Changed.' })).toBe(false);
  });

  it('signs and verifies seller/listing reviews without agreement context', () => {
    const reviewerKey = generateSecretKey();
    const reviewerPublicKey = getPublicKey(reviewerKey);
    const subjectPublicKey = 'a'.repeat(64);
    const attestation = createSignedAttestation(
      {
        reviewerPublicKey,
        subjectPublicKey,
        role: 'seller',
        score: 4,
        listingCoordinate: `30402:${subjectPublicKey}:listing_1`,
        tags: ['clear-communication'],
        text: 'Good marketplace interaction.'
      },
      bytesToHex(reviewerKey)
    );

    expect(attestation.agreementHash).toBeUndefined();
    expect(verifyAttestation(attestation)).toBe(true);
    expect(verifyAttestation({ ...attestation, agreementHash: 'b'.repeat(64) })).toBe(false);
  });
});
