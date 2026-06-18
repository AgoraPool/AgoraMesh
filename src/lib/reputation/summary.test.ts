import { bytesToHex } from '@noble/hashes/utils';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { describe, expect, it } from 'vitest';
import type { Agreement, AgreementAcceptanceReceipt, CommunityAllowlistEntry, Listing, ReputationAttestation, SyncedPublicRecord } from '../../types/domain';
import { createSignedAttestation } from '../crypto/attestations';
import { generateAgreementHash } from '../crypto/hash';
import {
  agreementReputationCandidates,
  dedupeReputationRows,
  filterReputationRows,
  listingReviewCoordinate,
  listingReviewMatches,
  listingReviewRows,
  reputationRows,
  reputationSubjectSummaries
} from './summary';

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

function listingFixture(overrides: Partial<Listing> = {}): Listing {
  return {
    id: 'listing_1',
    title: 'Repair work',
    description: 'Fix a bike.',
    type: 'offer',
    category: 'services',
    price: { amount: '100', currency: 'SAT' },
    region: 'Prague',
    fulfillmentType: 'local-pickup',
    fulfillmentNotes: '',
    contactMethod: { id: 'contact_1', kind: 'nostr', value: 'f'.repeat(64) },
    paymentPreferences: ['lightning'],
    barterAccepted: false,
    status: 'active',
    visibility: 'public',
    authorPublicKey: 'a'.repeat(64),
    createdAt: '2026-05-31T00:00:00.000Z',
    updatedAt: '2026-05-31T00:00:00.000Z',
    expiresAt: '2026-06-30T00:00:00.000Z',
    tags: [],
    ...overrides
  };
}

function syncedRecord(attestation: ReputationAttestation, overrides: Partial<SyncedPublicRecord<ReputationAttestation>> = {}): SyncedPublicRecord<ReputationAttestation> {
  return {
    id: `synced_${attestation.id}`,
    eventId: attestation.eventId,
    kind: 39004,
    authorPublicKey: attestation.reviewerPublicKey,
    relayUrls: ['wss://relay.example'],
    receivedAt: '2026-05-31T00:00:00.000Z',
    importedAt: '2026-05-31T00:00:00.000Z',
    payload: attestation,
    trusted: false,
    hidden: false,
    ...overrides
  };
}

describe('reputation summaries', () => {
  it('groups local and synced attestations by subject key with trust and verification context', () => {
    const reviewer = keypair();
    const trustedReviewer = keypair();
    const subject = 'a'.repeat(64);
    const local = createSignedAttestation(
      {
        reviewerPublicKey: reviewer.publicKey,
        subjectPublicKey: subject,
        role: 'seller',
        score: 4,
        listingId: 'listing_1',
        listingTitle: 'Repair work',
        listingCoordinate: `30402:${subject}:listing_1`,
        tags: ['fulfilled-agreement', 'clear-communication'],
        text: 'Completed as agreed.'
      },
      reviewer.privateKeyHex
    );
    const synced = createSignedAttestation(
      {
        reviewerPublicKey: trustedReviewer.publicKey,
        subjectPublicKey: subject,
        role: 'seller',
        score: 5,
        listingId: 'listing_1',
        listingTitle: 'Repair work',
        listingCoordinate: `30402:${subject}:listing_1`,
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
      averageScore: 4.5,
      scoreCount: 2,
      trustedAuthors: 1,
      untrustedAuthors: 1,
      notVerifiedIdentity: true
    });
    expect(summaries[0].tags.find((entry) => entry.tag === 'fulfilled-agreement')?.count).toBe(2);
    expect(summaries[0].recentReviews).toHaveLength(2);
    expect(filterReputationRows(rows, { query: 'reliable', role: 'all', tag: 'all', minScore: '4', source: 'combined', trust: 'all', hidden: 'visible', verification: 'verified' })).toHaveLength(1);
  });

  it('keeps the newest verified review per reviewer, subject, and strongest context', () => {
    const reviewer = keypair();
    const subject = 'a'.repeat(64);
    const agreementHash = 'e'.repeat(64);
    const older = createSignedAttestation(
      {
        reviewerPublicKey: reviewer.publicKey,
        subjectPublicKey: subject,
        agreementHash,
        role: 'seller',
        score: 2,
        listingCoordinate: `30402:${subject}:listing_1`,
        tags: ['late'],
        text: 'Slow.'
      },
      reviewer.privateKeyHex
    );
    const newer = createSignedAttestation(
      {
        reviewerPublicKey: reviewer.publicKey,
        subjectPublicKey: subject,
        agreementHash,
        role: 'seller',
        score: 5,
        listingCoordinate: `30402:${subject}:listing_1`,
        tags: ['fulfilled-agreement'],
        text: 'Updated after resolution.'
      },
      reviewer.privateKeyHex
    );
    const rows = reputationRows([{ ...older, timestamp: 1 }, { ...newer, timestamp: 2 }], [], 'visible');

    expect(dedupeReputationRows(rows)).toHaveLength(1);
    expect(dedupeReputationRows(rows)[0].attestation.score).toBe(5);
  });

  it('aggregates generic seller reviews without agreement or listing context', () => {
    const reviewer = keypair();
    const subject = 'a'.repeat(64);
    const review = createSignedAttestation(
      {
        reviewerPublicKey: reviewer.publicKey,
        subjectPublicKey: subject,
        role: 'seller',
        score: 5,
        tags: ['clear-communication'],
        text: 'Easy to coordinate with.'
      },
      reviewer.privateKeyHex
    );
    const rows = reputationRows([review], [], 'visible');

    expect(review.agreementHash).toBeUndefined();
    expect(reputationSubjectSummaries(rows, [])[0]).toMatchObject({
      subjectPublicKey: subject,
      averageScore: 5,
      scoreCount: 1,
      verified: 1
    });
  });

  it('creates agreement candidates without exposing private terms beyond local UI fields', () => {
    const agreement = agreementFixture();
    const candidates = agreementReputationCandidates([agreement], [] as AgreementAcceptanceReceipt[]);

    expect(candidates[0]).toMatchObject({
      agreementHash: agreement.hash,
      receiptStatus: 'draft',
      buyerPublicKey: agreement.buyerPublicKey,
      sellerPublicKey: agreement.sellerPublicKey,
      mediatorPublicKey: agreement.mediator,
      listingId: agreement.listingId,
      listingCoordinate: `${30402}:${agreement.sellerPublicKey}:${agreement.listingId}`
    });
  });

  it('matches listing reviews by coordinate first, then listing id, and requires the seller subject', () => {
    const reviewer = keypair();
    const idOnlyReviewer = keypair();
    const wrongSubjectReviewer = keypair();
    const wrongCoordinateReviewer = keypair();
    const listing = listingFixture();
    const coordinateReview = createSignedAttestation(
      {
        reviewerPublicKey: reviewer.publicKey,
        subjectPublicKey: listing.authorPublicKey,
        role: 'seller',
        score: 5,
        listingId: 'wrong_id',
        listingTitle: listing.title,
        listingCoordinate: listingReviewCoordinate(listing),
        tags: ['clear-communication'],
        text: 'Clear and reliable.'
      },
      reviewer.privateKeyHex
    );
    const idOnlyReview = createSignedAttestation(
      {
        reviewerPublicKey: idOnlyReviewer.publicKey,
        subjectPublicKey: listing.authorPublicKey,
        role: 'seller',
        score: 4,
        listingId: listing.id,
        tags: ['fulfilled-agreement'],
        text: 'Matched by id.'
      },
      idOnlyReviewer.privateKeyHex
    );
    const wrongSubject = createSignedAttestation(
      {
        reviewerPublicKey: wrongSubjectReviewer.publicKey,
        subjectPublicKey: 'b'.repeat(64),
        role: 'seller',
        score: 5,
        listingCoordinate: listingReviewCoordinate(listing),
        tags: ['fulfilled-agreement'],
        text: 'Wrong seller.'
      },
      wrongSubjectReviewer.privateKeyHex
    );
    const wrongCoordinate = createSignedAttestation(
      {
        reviewerPublicKey: wrongCoordinateReviewer.publicKey,
        subjectPublicKey: listing.authorPublicKey,
        role: 'seller',
        score: 3,
        listingId: listing.id,
        listingCoordinate: `30402:${listing.authorPublicKey}:other_listing`,
        tags: ['other'],
        text: 'Wrong coordinate.'
      },
      wrongCoordinateReviewer.privateKeyHex
    );

    expect(listingReviewMatches(listing, coordinateReview)).toBe(true);
    expect(listingReviewMatches(listing, wrongCoordinate)).toBe(false);
    expect(listingReviewRows(listing, [coordinateReview, idOnlyReview, wrongSubject, wrongCoordinate], [])).toHaveLength(2);
  });

  it('dedupes listing reviews, prefers verified rows, and sorts newest first', () => {
    const listing = listingFixture();
    const reviewer = keypair();
    const trustedReviewer = keypair();
    const older = createSignedAttestation(
      {
        reviewerPublicKey: reviewer.publicKey,
        subjectPublicKey: listing.authorPublicKey,
        role: 'seller',
        score: 2,
        listingId: listing.id,
        listingCoordinate: listingReviewCoordinate(listing),
        tags: ['late'],
        text: 'Older review.'
      },
      reviewer.privateKeyHex
    );
    const newer = createSignedAttestation(
      {
        reviewerPublicKey: reviewer.publicKey,
        subjectPublicKey: listing.authorPublicKey,
        role: 'seller',
        score: 5,
        listingId: listing.id,
        listingCoordinate: listingReviewCoordinate(listing),
        tags: ['fulfilled-agreement'],
        text: 'Updated review.'
      },
      reviewer.privateKeyHex
    );
    const trusted = createSignedAttestation(
      {
        reviewerPublicKey: trustedReviewer.publicKey,
        subjectPublicKey: listing.authorPublicKey,
        role: 'seller',
        score: 4,
        listingId: listing.id,
        listingCoordinate: listingReviewCoordinate(listing),
        tags: ['clear-communication'],
        text: 'Synced review.'
      },
      trustedReviewer.privateKeyHex
    );
    const tampered = { ...newer, id: 'tampered', signature: older.signature, timestamp: newer.timestamp + 10 };

    const rows = listingReviewRows(
      listing,
      [{ ...older, timestamp: 1 }, tampered],
      [syncedRecord({ ...newer, timestamp: 2 }, { trusted: true }), syncedRecord({ ...trusted, timestamp: 3 }, { trusted: true })]
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].attestation.text).toBe('Synced review.');
    expect(rows[0].verified).toBe(true);
    expect(rows[1].attestation.text).toBe('Updated review.');
    expect(rows[1].verified).toBe(true);
  });
});
