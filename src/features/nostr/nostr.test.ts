import { bytesToHex } from '@noble/hashes/utils';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import {
  AGORAMESH_EVENT_KINDS,
  communityCurationListPayload,
  parseAgoraEventPayload,
  publicDisputeOutcomePayload,
  publicListingPayload,
  publicMediatorPayload,
  publicProfileFromNostrMetadata,
  profileFromNostrMetadata,
  signCommunityCurationList,
  signListing,
  signMediator,
  unsignedListing,
  verifyNostrEvent
} from '../../lib/nostr/events';
import { relayConfigSchema } from '../../lib/validation/schemas';
import type { CommunityCurationList, DisputeCase, Listing, MediatorProfile } from '../../types/domain';

describe('Nostr event serialization', () => {
  it('requires secure relay URLs', () => {
    expect(() => relayConfigSchema.parse({ url: 'ws://relay.example', enabled: true })).toThrow(/wss/i);
    expect(relayConfigSchema.parse({ url: 'wss://relay.example', enabled: true })).toMatchObject({ enabled: true });
  });

  it('signs and validates a public listing without private fields', () => {
    const privateKey = generateSecretKey();
    const publicKey = getPublicKey(privateKey);
    const listing: Listing = {
      id: 'listing_1',
      authorPublicKey: publicKey,
      title: 'Translation help',
      type: 'offer',
      category: 'translation-language-exchange',
      description: 'English to Czech proofreading.',
      region: 'Brno',
      status: 'active',
      price: { amount: '0', currency: 'FREE', note: 'Barter welcome' },
      paymentPreferences: ['barter'],
      images: [
        {
          id: 'image_1',
          url: 'https://media.example/listing.webp',
          sha256: '1'.repeat(64),
          mimeType: 'image/webp',
          sizeBytes: 2048,
          altText: 'Translation notes on a desk',
          blossomServerUrl: 'https://media.example',
          uploadedAt: '2026-05-31T00:00:00.000Z'
        }
      ],
      barterAccepted: true,
      tags: ['language'],
      expiresAt: '2026-06-30',
      contactMethod: { id: 'contact_1', kind: 'matrix', value: '@translator:matrix.org' },
      visibility: 'public',
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z'
    };

    const event = signListing(listing, bytesToHex(privateKey));
    const payload = parseAgoraEventPayload(event);
    const serialized = JSON.stringify(payload);

    expect(event.kind).toBe(30402);
    expect(event.content).toBe('English to Czech proofreading.');
    expect(event.tags).toContainEqual(['d', 'listing_1']);
    expect(event.tags).toContainEqual(['title', 'Translation help']);
    expect(event.tags).toContainEqual(['location', 'Brno']);
    expect(event.tags).toContainEqual(['price', '0', 'FREE']);
    expect(event.tags).toContainEqual(['status', 'active']);
    expect(event.tags).toContainEqual(['client', 'agoramesh']);
    expect(event.tags).toContainEqual(['t', 'agoramesh']);
    expect(event.tags).toContainEqual(['t', 'language']);
    expect(event.tags).toContainEqual([
      'image',
      'https://media.example/listing.webp',
      'Translation notes on a desk',
      '1'.repeat(64),
      'image/webp',
      '2048',
      'https://media.example',
      '2026-05-31T00:00:00.000Z'
    ]);
    expect(verifyNostrEvent(event)).toBe(true);
    expect(serialized).not.toContain('privateKey');
    expect(serialized).not.toContain('encryptedPrivateKey');
    expect(serialized).not.toContain('localFilename');
    expect(serialized).toContain('Translation help');
    expect(serialized).toContain('https://media.example/listing.webp');
  });

  it('includes public payment intents and fulfillment hints, and rejects secret or custodial wording', () => {
    const privateKey = generateSecretKey();
    const publicKey = getPublicKey(privateKey);
    const listing: Listing = {
      id: 'listing_payment',
      authorPublicKey: publicKey,
      title: 'Repair help',
      type: 'offer',
      category: 'repairs',
      description: 'Public repair help.',
      region: 'Prague',
      status: 'active',
      price: { amount: '1000', currency: 'CZK' },
      paymentPreferences: ['lightning', 'cashu'],
      paymentIntents: [{ id: 'payment_1', method: 'cashu', value: 'cashuAexample', note: 'Public token instruction' }],
      fulfillmentType: 'local-pickup',
      fulfillmentNotes: 'Public meetup area.',
      barterAccepted: false,
      tags: ['repair'],
      expiresAt: '2026-06-30',
      contactMethod: { id: 'contact_1', kind: 'matrix', value: '@repair:matrix.org' },
      visibility: 'public',
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z'
    };

    expect(publicListingPayload(listing)).toMatchObject({
      paymentIntents: [{ method: 'cashu', value: 'cashuAexample' }],
      fulfillmentType: 'local-pickup',
      fulfillmentNotes: 'Public meetup area.'
    });
    expect(() =>
      publicListingPayload({
        ...listing,
        price: { amount: '1000', currency: 'CZK', note: 'escrow custody available' }
      })
    ).toThrow(/custod|escrow/i);
    expect(() =>
      publicListingPayload({
        ...listing,
        paymentIntents: [{ id: 'payment_2', method: 'bitcoin', value: 'escrow custody address', note: 'private memo' }]
      })
    ).toThrow(/custod|escrow|private/i);
    for (const [index, blocked] of ['wallet seed', 'cashu secret', 'refund secret', 'private invoice memo', 'private settlement'].entries()) {
      expect(() =>
        publicListingPayload({
          ...listing,
          paymentIntents: [{ id: `payment_blocked_${index}`, method: 'other', value: blocked, note: 'public note' }]
        })
      ).toThrow(/private|secret|seed|memo/i);
    }
  });

  it('publishes community curation lists as NIP-51-style kind 30004 events', () => {
    const privateKey = generateSecretKey();
    const publicKey = getPublicKey(privateKey);
    const list: CommunityCurationList = {
      id: 'curation_1',
      title: 'Useful repair listings',
      description: 'Public records grouped for local repair discovery.',
      authorPublicKey: publicKey,
      referencedCoordinates: [`${AGORAMESH_EVENT_KINDS.listing}:${publicKey}:listing_1`],
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z'
    };

    const event = signCommunityCurationList(list, bytesToHex(privateKey));

    expect(event.kind).toBe(30004);
    expect(event.tags).toContainEqual(['d', 'curation_1']);
    expect(event.tags).toContainEqual(['title', 'Useful repair listings']);
    expect(event.tags).toContainEqual(['a', `${AGORAMESH_EVENT_KINDS.listing}:${publicKey}:listing_1`]);
    expect(communityCurationListPayload(list)).toMatchObject({ title: 'Useful repair listings' });
    expect(verifyNostrEvent(event)).toBe(true);
  });

  it('publishes mediator profiles as separate signed marketplace records', () => {
    const privateKey = generateSecretKey();
    const publicKey = getPublicKey(privateKey);
    const mediator: MediatorProfile = {
      id: 'mediator_1',
      displayName: 'Alice Mediator',
      publicKey,
      region: 'Brno',
      languages: ['en', 'cs'],
      specialties: ['marketplace disputes'],
      feeModel: 'Sliding scale',
      mediationStyle: 'Written facilitation with conflict disclosure.',
      responseTime: 'Within 24 hours',
      caseCount: 0,
      contactMethods: [{ id: 'contact_1', kind: 'matrix', value: '@alice:matrix.org' }],
      procedure: 'Both parties provide signed receipts and public-safe evidence summaries.',
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z'
    };

    const event = signMediator(mediator, bytesToHex(privateKey));

    expect(event.kind).toBe(AGORAMESH_EVENT_KINDS.mediator);
    expect(event.tags).toContainEqual(['d', 'mediator_1']);
    expect(publicMediatorPayload(mediator)).toMatchObject({ publicKey, procedure: mediator.procedure });
    expect(verifyNostrEvent(event)).toBe(true);
  });

  it('parses standard Nostr profile metadata into public-safe profile fields', () => {
    const metadata = profileFromNostrMetadata(
      JSON.stringify({
        name: 'alice',
        display_name: 'Alice Nostr',
        about: 'Public profile text',
        picture: 'https://example.test/avatar.png',
        secret: 'ignored'
      })
    );

    expect(publicProfileFromNostrMetadata(metadata, { id: 'profile_1', displayName: 'Fallback', publicKey: 'a'.repeat(64) })).toMatchObject({
      displayName: 'Alice Nostr',
      publicKey: 'a'.repeat(64),
      avatarUrl: 'https://example.test/avatar.png',
      bio: 'Public profile text'
    });
  });

  it('builds unsigned NIP-99 listing events for extension signing', () => {
    const { listing } = {
      listing: {
        id: 'listing_unsigned_encrypted',
        authorPublicKey: 'a'.repeat(64),
        title: 'Private contact listing',
        type: 'offer',
        category: 'repairs',
        description: 'Contact details should be encrypted.',
        region: 'Prague',
        status: 'active',
        price: { amount: '0', currency: 'FREE' },
        paymentPreferences: ['cash'],
        barterAccepted: false,
        tags: [],
        expiresAt: '2026-06-30',
        contactMethod: { id: 'contact_1', kind: 'matrix', value: '@alice:matrix.org' },
        visibility: 'public',
        createdAt: '2026-05-31T00:00:00.000Z',
        updatedAt: '2026-05-31T00:00:00.000Z'
      } satisfies Listing
    };
    const unsigned = unsignedListing(listing);

    expect(unsigned.kind).toBe(AGORAMESH_EVENT_KINDS.listing);
    expect(unsigned.tags).toContainEqual(['title', listing.title]);
    expect(unsigned.content).toBe(listing.description);
  });

  it('publishes only the explicit dispute outcome subset', () => {
    const dispute: DisputeCase = {
      id: 'dispute_1',
      state: 'resolved',
      agreementHash: 'd'.repeat(64),
      claimant: 'alice',
      respondent: 'bob',
      claimSummary: 'Claim details are private',
      requestedResolution: 'Private request',
      timeline: [{ id: 'timeline_1', at: '2026-05-31T00:00:00.000Z', note: 'opened' }],
      evidence: [{ id: 'evidence_1', title: 'Receipt', description: 'Private', date: '2026-05-31', source: 'local' }],
      outcomeSummary: 'Resolved by refund.',
      publishOutcomeAttestation: true,
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z'
    };

    const signerPublicKey = 'e'.repeat(64);
    const payload = publicDisputeOutcomePayload(dispute, signerPublicKey);
    const serialized = JSON.stringify(payload);
    expect(serialized).toContain('Resolved by refund.');
    expect(payload.signerPublicKey).toBe(signerPublicKey);
    expect(serialized).not.toContain('Receipt');
    expect(serialized).not.toContain('Claim details');
  });
});
