import { bytesToHex } from '@noble/hashes/utils';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { describe, expect, it } from 'vitest';
import { createSignedAttestation } from '../crypto/attestations';
import { importablePayloadFromReviewItem, reviewItemFromEvent, signReputation, type NostrEvent } from './events';

describe('reputation review relay events', () => {
  it('publishes score and listing tags and rejects mismatched tag edits', async () => {
    const reviewerKey = generateSecretKey();
    const reviewerPublicKey = getPublicKey(reviewerKey);
    const subjectPublicKey = 'a'.repeat(64);
    const attestation = createSignedAttestation(
      {
        reviewerPublicKey,
        subjectPublicKey,
        agreementHash: 'b'.repeat(64),
        role: 'seller',
        score: 5,
        listingId: 'listing_1',
        listingTitle: 'Repair work',
        listingCoordinate: `30402:${subjectPublicKey}:listing_1`,
        tags: ['fulfilled-agreement'],
        text: 'Reliable seller.'
      },
      bytesToHex(reviewerKey)
    );
    const event = signReputation(attestation, bytesToHex(reviewerKey));

    expect(event.tags).toContainEqual(['score', '5']);
    expect(event.tags).toContainEqual(['a', `30402:${subjectPublicKey}:listing_1`]);
    await expect(importablePayloadFromReviewItem(reviewItemFromEvent(event, 'wss://relay.example'))).resolves.toMatchObject({
      score: 5,
      listingCoordinate: `30402:${subjectPublicKey}:listing_1`
    });

    const modified = finalizeEvent({
      kind: event.kind,
      created_at: event.created_at,
      tags: event.tags.map((tag) => (tag[0] === 'score' ? ['score', '4'] : tag)),
      content: event.content
    }, reviewerKey) as NostrEvent;
    await expect(importablePayloadFromReviewItem(reviewItemFromEvent(modified, 'wss://relay.example'))).rejects.toThrow(/score/i);
  });
});
