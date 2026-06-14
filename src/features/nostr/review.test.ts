import { bytesToHex } from '@noble/hashes/utils';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { vi } from 'vitest';
import {
  AGORAMESH_EVENT_KINDS,
  buildAgoraRelayFilter,
  buildAgoraRelayFilters,
  dedupeReviewItems,
  importablePayloadFromReviewItem,
  isAgoraMeshEvent,
  publishReceiptsFromStatuses,
  reviewItemFromMalformed,
  reviewItemFromEvent,
  signCommunityCurationList,
  signListing,
  subscribeToAgoraEvents,
  syncedRecordFromReviewItem,
  type NostrEvent
} from '../../lib/nostr/events';
import { canonicalJson } from '../../lib/crypto/encoding';
import type { CommunityCurationList, Listing } from '../../types/domain';

function publicListing(): { listing: Listing; privateKeyHex: string } {
  const privateKey = generateSecretKey();
  const publicKey = getPublicKey(privateKey);
  return {
    privateKeyHex: bytesToHex(privateKey),
    listing: {
      id: 'listing_review',
      authorPublicKey: publicKey,
      title: 'Books',
      type: 'offer',
      category: 'books-media',
      description: 'Local book exchange.',
      region: 'Brno',
      status: 'active',
      price: { amount: '0', currency: 'FREE' },
      paymentPreferences: ['barter'],
      barterAccepted: true,
      tags: ['books'],
      expiresAt: '2026-06-30',
      contactMethod: { id: 'contact_1', kind: 'simplex', value: 'simplex-address' },
      visibility: 'public',
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z'
    }
  };
}

describe('Nostr review queue helpers', () => {
  it('builds relay filters with optional since timestamps', () => {
    expect(buildAgoraRelayFilter(1_700_000_000, 25)).toMatchObject({
      kinds: [39001, 30402, 39003, 39004, 39005, 30004],
      limit: 25,
      since: 1_700_000_000
    });
    expect(buildAgoraRelayFilter(undefined, 10)).not.toHaveProperty('since');
  });

  it('builds scoped listing discovery filters', () => {
    expect(buildAgoraRelayFilters('agoramesh-native', 1_700_000_000, 25)).toEqual([
      {
        kinds: [39001, 39003, 39004, 39005, 30004],
        limit: 25,
        since: 1_700_000_000
      },
      {
        kinds: [30402],
        '#t': ['agoramesh'],
        limit: 25,
        since: 1_700_000_000
      }
    ]);
    expect(buildAgoraRelayFilters('all-nip99', undefined, 10)).toEqual([
      {
        kinds: [39001, 30402, 39003, 39004, 39005, 30004],
        limit: 10
      }
    ]);
  });

  it('builds a pending review item for valid AgoraMesh events', async () => {
    const { listing, privateKeyHex } = publicListing();
    const event = signListing(listing, privateKeyHex);
    const item = reviewItemFromEvent(event, 'wss://relay.example');
    const broadFetchItem = reviewItemFromEvent(event, 'wss://relay.example', 'all-nip99');

    expect(item.signatureValid).toBe(true);
    expect(item.importStatus).toBe('pending');
    expect(broadFetchItem.discoveryScope).toBe('agoramesh-native');
    await expect(importablePayloadFromReviewItem(item)).resolves.toMatchObject({ id: 'listing_review' });
  });

  it('treats marketplace listings as NIP-99 classifieds only', () => {
    const { listing, privateKeyHex } = publicListing();
    const signed = signListing(listing, privateKeyHex);
    const filter = buildAgoraRelayFilter();

    expect(isAgoraMeshEvent(signed)).toBe(true);
    expect(signed.kind).toBe(AGORAMESH_EVENT_KINDS.listing);
    expect(filter.kinds.filter((kind) => kind === AGORAMESH_EVENT_KINDS.listing)).toHaveLength(1);
  });

  it('treats AgoraMesh-shaped NIP-99 listings as native even without explicit marker tags', () => {
    const privateKey = generateSecretKey();
    const publicKey = getPublicKey(privateKey);
    const event = finalizeEvent(
      {
        kind: AGORAMESH_EVENT_KINDS.listing,
        created_at: 1_700_000_000,
        tags: [
          ['d', 'agoramesh_shape'],
          ['title', 'AgoraMesh shaped listing'],
          ['published_at', '1700000000'],
          ['location', 'Prague'],
          ['price', '1000', 'SAT'],
          ['status', 'active'],
          ['category', 'repairs'],
          ['listing_type', 'offer'],
          ['expires_at', '2026-12-31'],
          ['contact', 'nostr', publicKey]
        ],
        content: 'Valid AgoraMesh-shaped NIP-99 listing.'
      },
      privateKey
    );

    expect(reviewItemFromEvent(event, 'wss://relay.example', 'all-nip99').discoveryScope).toBe('agoramesh-native');
  });

  it('keeps generic NIP-99 classifieds out of native scope unless broad discovery is selected', async () => {
    const privateKey = generateSecretKey();
    const publicKey = getPublicKey(privateKey);
    const event = finalizeEvent(
      {
        kind: AGORAMESH_EVENT_KINDS.listing,
        created_at: 1_700_000_000,
        tags: [
          ['d', 'generic_nip99'],
          ['title', 'Generic classified'],
          ['published_at', '1700000000'],
          ['location', 'Brno'],
          ['price', '10', 'CZK'],
          ['status', 'active']
        ],
        content: 'Valid generic NIP-99 listing.'
      },
      privateKey
    );

    const nativeItem = reviewItemFromEvent(event, 'wss://relay.example');
    const broadItem = reviewItemFromEvent(event, 'wss://relay.example', 'all-nip99');

    expect(nativeItem).toMatchObject({
      signatureValid: true,
      importStatus: 'invalid',
      discoveryScope: 'agoramesh-native'
    });
    expect(nativeItem.payloadPreview).toMatch(/outside/i);
    expect(broadItem).toMatchObject({
      signatureValid: true,
      importStatus: 'pending',
      discoveryScope: 'all-nip99'
    });
    await expect(importablePayloadFromReviewItem(broadItem)).resolves.toMatchObject({
      id: 'generic_nip99',
      authorPublicKey: publicKey,
      price: { amount: '10', currency: 'CZK' }
    });
  });

  it('keeps external HTTPS image tags from broad NIP-99 listings', async () => {
    const privateKey = generateSecretKey();
    const publicKey = getPublicKey(privateKey);
    const event = finalizeEvent(
      {
        kind: AGORAMESH_EVENT_KINDS.listing,
        created_at: 1_770_000_000,
        tags: [
          ['d', 'external_image_listing'],
          ['title', 'Coldcard Q'],
          ['published_at', '1770000000'],
          ['location', 'Worldwide'],
          ['price', '279', 'USD'],
          ['status', 'active'],
          ['image', 'https://shop.example/coldcard.webp']
        ],
        content: 'Bitcoin-only signing device.'
      },
      privateKey
    );

    const item = reviewItemFromEvent(event, 'wss://relay.example', 'all-nip99');
    const payload = (await importablePayloadFromReviewItem(item)) as Listing;

    expect(payload).toMatchObject({
      id: 'external_image_listing',
      authorPublicKey: publicKey,
      images: [{ url: 'https://shop.example/coldcard.webp' }]
    });
    expect((payload as Listing).images?.[0].sha256).toBeUndefined();
  });

  it('parses NIP-99 imeta images and ignores non-HTTPS image URLs', async () => {
    const privateKey = generateSecretKey();
    const event = finalizeEvent(
      {
        kind: AGORAMESH_EVENT_KINDS.listing,
        created_at: 1_770_000_000,
        tags: [
          ['d', 'imeta_listing'],
          ['title', 'Hardware wallet'],
          ['published_at', '1770000000'],
          ['location', 'Worldwide'],
          ['price', '279', 'USD'],
          ['status', 'active'],
          ['image', 'http://shop.example/ignored.webp'],
          ['imeta', 'url https://shop.example/frame.webp', 'm image/webp', `x ${'2'.repeat(64)}`, 'alt Product photo', 'dim 1200x800', 'size 4096']
        ],
        content: 'Signing device.'
      },
      privateKey
    );

    const item = reviewItemFromEvent(event, 'wss://relay.example', 'all-nip99');
    const payload = (await importablePayloadFromReviewItem(item)) as Listing;

    expect(payload.images).toHaveLength(1);
    expect(payload.images?.[0]).toMatchObject({
      url: 'https://shop.example/frame.webp',
      mimeType: 'image/webp',
      sha256: '2'.repeat(64),
      altText: 'Product photo',
      width: 1200,
      height: 800,
      sizeBytes: 4096
    });
  });

  it('keeps invalid signatures reviewable but not importable', async () => {
    const { listing, privateKeyHex } = publicListing();
    const event: NostrEvent = { ...signListing(listing, privateKeyHex), sig: '0'.repeat(128) };
    const item = reviewItemFromEvent(event, 'wss://relay.example');

    expect(item.signatureValid).toBe(false);
    expect(item.importStatus).toBe('invalid');
    await expect(importablePayloadFromReviewItem(item)).rejects.toThrow(/pending/i);
  });

  it('re-verifies raw events instead of trusting stored review flags', async () => {
    const { listing, privateKeyHex } = publicListing();
    const event: NostrEvent = { ...signListing(listing, privateKeyHex), sig: '0'.repeat(128) };
    const item = reviewItemFromEvent(event, 'wss://relay.example');

    await expect(importablePayloadFromReviewItem({ ...item, signatureValid: true, importStatus: 'pending' })).rejects.toThrow(/signature/i);
  });

  it('rejects malformed NIP-99 listings without required tags', async () => {
    const privateKey = generateSecretKey();
    const malformed = finalizeEvent(
      {
        kind: AGORAMESH_EVENT_KINDS.listing,
        created_at: 1_700_000_000,
        tags: [['d', 'missing_title']],
        content: 'Missing title.'
      },
      privateKey
    );
    const item = reviewItemFromEvent(malformed, 'wss://relay.example');

    expect(item.importStatus).toBe('invalid');
    await expect(importablePayloadFromReviewItem({ ...item, importStatus: 'pending' })).rejects.toThrow(/title/i);
  });

  it('rejects reputation payloads with invalid embedded attestation signatures', async () => {
    const privateKey = generateSecretKey();
    const publicKey = getPublicKey(privateKey);
    const attestation = {
      id: 'attestation_forged',
      reviewerPublicKey: publicKey,
      subjectPublicKey: 'b'.repeat(64),
      agreementHash: 'c'.repeat(64),
      role: 'seller' as const,
      tags: ['fulfilled-agreement' as const],
      text: 'Forged inner signature.',
      timestamp: 1_700_000_000,
      signature: '0'.repeat(128),
      eventId: '0'.repeat(64)
    };
    const event = finalizeEvent(
      {
        kind: AGORAMESH_EVENT_KINDS.reputation,
        created_at: attestation.timestamp,
        tags: [
          ['client', 'agoramesh'],
          ['d', attestation.id],
          ['p', attestation.subjectPublicKey],
          ['agreement', attestation.agreementHash]
        ],
        content: canonicalJson({ app: 'agoramesh', version: 1, payload: attestation })
      },
      privateKey
    );
    const item = reviewItemFromEvent(event, 'wss://relay.example');

    expect(item.importStatus).toBe('pending');
    await expect(importablePayloadFromReviewItem(item)).rejects.toThrow(/attestation signature/i);
  });

  it('deduplicates by event id', () => {
    const { listing, privateKeyHex } = publicListing();
    const event = signListing(listing, privateKeyHex);
    const first = reviewItemFromEvent(event, 'wss://one.example');
    const second = reviewItemFromEvent(event, 'wss://two.example');

    expect(dedupeReviewItems([first, second])).toHaveLength(1);
    expect(dedupeReviewItems([first], [event.id])).toHaveLength(0);
  });

  it('creates trusted synced cache records without writing local records', async () => {
    const { listing, privateKeyHex } = publicListing();
    const event = signListing(listing, privateKeyHex);
    const item = reviewItemFromEvent(event, 'wss://relay.example');
    const payload = await importablePayloadFromReviewItem(item);
    const record = syncedRecordFromReviewItem(item, [
      { id: 'allow_1', publicKey: listing.authorPublicKey, label: 'Local group', note: '', createdAt: '2026-05-31T00:00:00.000Z' }
    ], payload);

    expect(record).toMatchObject({
      eventId: event.id,
      authorPublicKey: listing.authorPublicKey,
      trusted: true,
      payload: { id: 'listing_review' }
    });
  });

  it('imports community curation lists into synced public records', async () => {
    const privateKey = generateSecretKey();
    const publicKey = getPublicKey(privateKey);
    const list: CommunityCurationList = {
      id: 'curation_review',
      title: 'Repair list',
      description: 'Reviewed public references.',
      authorPublicKey: publicKey,
      referencedCoordinates: [`30402:${publicKey}:listing_review`],
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z'
    };
    const event = signCommunityCurationList(list, bytesToHex(privateKey));
    const item = reviewItemFromEvent(event, 'wss://relay.example');
    const payload = await importablePayloadFromReviewItem(item);
    const record = syncedRecordFromReviewItem(item, [], payload);

    expect(item.importStatus).toBe('pending');
    expect(record).toMatchObject({
      eventId: event.id,
      kind: 30004,
      payload: { id: 'curation_review', title: 'Repair list' }
    });
  });

  it('creates invalid review items for malformed relay messages', () => {
    const item = reviewItemFromMalformed('not-json', 'wss://relay.example', 'Malformed relay message.');
    expect(item.importStatus).toBe('invalid');
    expect(item.kind).toBe(0);
    expect(item.eventId).toContain('malformed_');
  });

  it('returns a cleanup function for live subscriptions', () => {
    const close = vi.fn();
    class FakeWebSocket {
      onopen: (() => void) | null = null;
      onmessage: ((message: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(readonly url: string) {}
      send = vi.fn();
      close = close;
    }
    vi.stubGlobal('WebSocket', FakeWebSocket);

    const stop = subscribeToAgoraEvents([{ url: 'wss://relay.example', enabled: true }], vi.fn());
    stop();

    expect(close).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('reports live connection failures as status, not review items', () => {
    const close = vi.fn();
    const sockets: FakeWebSocket[] = [];
    class FakeWebSocket {
      onopen: (() => void) | null = null;
      onmessage: ((message: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(readonly url: string) {
        sockets.push(this);
      }
      send = vi.fn();
      close = close;
    }
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const onItem = vi.fn();
    const onStatus = vi.fn();

    const stop = subscribeToAgoraEvents([{ url: 'wss://relay.example', enabled: true }], onItem, {}, onStatus);
    sockets[0]?.onerror?.();
    stop();

    expect(onItem).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({ ok: false, message: 'Relay connection failed.' }));
    vi.unstubAllGlobals();
  });

  it('creates per-relay publish receipts from relay statuses', () => {
    const receipts = publishReceiptsFromStatuses('listing', 'listing_review', 'event_1', [
      { relay: 'wss://one.example', ok: true, message: 'accepted', at: '2026-05-31T00:00:00.000Z' },
      { relay: 'wss://two.example', ok: false, message: 'failed', at: '2026-05-31T00:00:01.000Z' }
    ]);

    expect(receipts).toHaveLength(2);
    expect(receipts[0]).toMatchObject({ relayUrl: 'wss://one.example', status: 'accepted' });
    expect(receipts[1]).toMatchObject({ relayUrl: 'wss://two.example', status: 'failed' });
  });
});
