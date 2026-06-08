import { bytesToHex } from '@noble/hashes/utils';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { describe, expect, it } from 'vitest';
import type { Agreement, AgreementAcceptanceReceipt, CommunityAllowlistEntry, SyncedPublicRecord } from '../../types/domain';
import { createSignedAttestation } from '../crypto/attestations';
import { generateAgreementHash } from '../crypto/hash';
import { agreementReputationCandidates, filterReputationRows, reputationRows, reputationSubjectSummaries } from './summary';

function keypair(): { privateKeyHex: string; publicKey: string } {
  const privateKey = generateSecretKey();
  return { privateKeyHex: bytesToHex(privateKey), publicKey: getPublicKey(privateKey) };
}

function agreementFixture(overrides: Partial<Agreement> = {}): Agreement {
  const agreement = {
    id: 'agreement_1',
    buyer: 'Buyer',
    seller: 'Seller',
    buyerPublicKey: 'b'.repeat(64),
    sellerPublicKey: 'c'.repeat(64),
    buyerLabel: 'Buyer',
    sellerLabel: 'Seller',
    listingId: 'listing_1',
    exchangeDescription: 'Repair work',
    priceAndPayment: 'Cash',
    fulfillmentTerms: 'Meet locally',
    deadline: '2026-06-30',
    refundTerms: 'Refund if not completed',
    mediator: 'd'.repeat(64),
    evidenceExpectations: 'Receipt and messages',
    buyerAccepted: true,
    sellerAccepted: true,
    hash: '',
    createdAt: '2026-05-31T00:00:00.000Z',
    updatedAt: '2026-05-31T00:00:00.000Z',
    ...overrides
  } satisfies Agreement;
  return { ...agreement, hash: generateAgreementHash(agreement) };
}

describe('reputation summaries', () => {
  it('groups local and synced attestations by subject key with trust and verification context', () => {
    const reviewer = keypair();
    const trustedReviewer = keypair();
    const subject = 'a'.repeat(64);
    const agreementHash = 'e'.repeat(64);
    const local = createSignedAttestation(
      {
        reviewerPublicKey: reviewer.publicKey,
        subjectPublicKey: subject,
        agreementHash,
        role: 'seller',
        tags: ['fulfilled-agreement', 'clear-communication'],
        text: 'Completed as agreed.'
      },
      reviewer.privateKeyHex
    );
    const synced = createSignedAttestation(
      {
        reviewerPublicKey: trustedReviewer.publicKey,
        subjectPublicKey: subject,
        agreementHash,
        role: 'seller',
        tags: ['fulfilled-agreement'],
        text: 'Reliable.'
      },
      trustedReviewer.privateKeyHex
    );
    const syncedRecord: SyncedPublicRecord<typeof synced> = {
      id: 'synced_1',
      eventId: synced.eventId,
      kind: 39004,
      authorPublicKey: trustedReviewer.publicKey,
      relayUrls: ['wss://relay.example'],
      receivedAt: '2026-05-31T00:00:00.000Z',
      importedAt: '2026-05-31T00:00:00.000Z',
      payload: synced,
      trusted: true,
      hidden: false
    };
    const allowlist: CommunityAllowlistEntry[] = [
      { id: 'allow_1', publicKey: trustedReviewer.publicKey, label: 'Known reviewer', note: '', createdAt: '2026-05-31T00:00:00.000Z' }
    ];

    const rows = reputationRows([local], [syncedRecord], 'visible');
    const summaries = reputationSubjectSummaries(rows, allowlist);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      subjectPublicKey: subject,
      total: 2,
      verified: 2,
      local: 1,
      synced: 1,
      trustedAuthors: 1,
      untrustedAuthors: 1,
      notVerifiedIdentity: true
    });
    expect(summaries[0].tags.find((entry) => entry.tag === 'fulfilled-agreement')?.count).toBe(2);
    expect(filterReputationRows(rows, { query: 'reliable', role: 'all', tag: 'all', source: 'combined', trust: 'all', hidden: 'visible', verification: 'verified' })).toHaveLength(1);
  });

  it('creates agreement candidates without exposing private terms beyond local UI fields', () => {
    const agreement = agreementFixture();
    const candidates = agreementReputationCandidates([agreement], [] as AgreementAcceptanceReceipt[]);

    expect(candidates[0]).toMatchObject({
      agreementHash: agreement.hash,
      receiptStatus: 'draft',
      buyerPublicKey: agreement.buyerPublicKey,
      sellerPublicKey: agreement.sellerPublicKey,
      mediatorPublicKey: agreement.mediator
    });
  });
});
