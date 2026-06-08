import { describe, expect, it } from 'vitest';
import type { CommunityAllowlistEntry, Listing, PublicProfile, ReputationAttestation, SyncedPublicRecord } from '../../types/domain';
import { listingCategorySchema, listingSchema, paymentIntentSchema } from '../validation/schemas';
import {
  categoryLabelKeys,
  fulfillmentBadgeForListing,
  paymentMatchesListing,
  sellerSummaryForListing
} from './presentation';

const listing: Listing = {
  id: 'listing_marketplace',
  authorPublicKey: 'a'.repeat(64),
  title: 'Repair help',
  type: 'offer',
  category: 'repairs',
  description: 'Public repair help.',
  region: 'Brno',
  status: 'active',
  price: { amount: '0', currency: 'FREE' },
  paymentPreferences: ['cash'],
  paymentIntents: [{ id: 'payment_cashu', method: 'cashu', value: 'cashuAexample', note: 'Public token request' }],
  fulfillmentType: 'local-pickup',
  fulfillmentNotes: 'Public meetup area only.',
  barterAccepted: false,
  tags: ['repair'],
  expiresAt: '2026-06-30',
  contactMethod: { id: 'contact_1', kind: 'matrix', value: '@repair:matrix.org' },
  visibility: 'public',
  createdAt: '2026-05-31T00:00:00.000Z',
  updatedAt: '2026-05-31T00:00:00.000Z'
};

describe('marketplace presentation helpers', () => {
  it('has category label keys for every listing category', () => {
    expect(categoryLabelKeys()).toEqual(listingCategorySchema.options.map((category) => `category.${category}`));
  });

  it('accepts legacy listings without fulfillment fields and new listings with Cashu intents', () => {
    expect(listingSchema.parse({ ...listing, fulfillmentType: undefined, fulfillmentNotes: undefined })).toMatchObject({ id: listing.id });
    expect(paymentIntentSchema.parse({ id: 'payment_1', method: 'cashu', value: 'cashuAexample', note: 'Public note' })).toMatchObject({
      method: 'cashu'
    });
    expect(paymentMatchesListing(listing, 'cashu')).toBe(true);
    expect(fulfillmentBadgeForListing(listing, (key) => key)).toBe('fulfillment.local-pickup');
  });

  it('derives seller summary without treating context as identity verification', () => {
    const profile: PublicProfile = {
      id: 'profile_seller',
      displayName: 'Repair seller',
      publicKey: listing.authorPublicKey,
      avatarUrl: 'https://example.test/avatar.png',
      bio: '',
      region: '',
      languages: [],
      contactMethods: [],
      skills: [],
      mediatorAvailable: false,
      publicVisibility: true,
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z'
    };
    const attestation = {
      id: 'attestation_1',
      reviewerPublicKey: 'b'.repeat(64),
      subjectPublicKey: listing.authorPublicKey,
      agreementHash: 'c'.repeat(64),
      role: 'seller',
      tags: ['fulfilled-agreement'],
      text: 'Completed.',
      timestamp: 1_700_000_000,
      signature: 'sig',
      eventId: 'event_1'
    } as ReputationAttestation;
    const allowlist: CommunityAllowlistEntry[] = [
      { id: 'allow_1', publicKey: listing.authorPublicKey, label: 'Known seller', note: '', createdAt: '2026-05-31T00:00:00.000Z' }
    ];
    const syncedProfiles: SyncedPublicRecord<PublicProfile>[] = [];
    const syncedAttestations: SyncedPublicRecord<ReputationAttestation>[] = [];

    expect(sellerSummaryForListing(listing, [profile], syncedProfiles, [attestation], syncedAttestations, allowlist)).toMatchObject({
      displayName: 'Repair seller',
      trusted: true,
      reputationCount: 1,
      reputationTags: ['fulfilled-agreement'],
      verified: false
    });
  });
});
