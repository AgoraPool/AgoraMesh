import { describe, expect, it } from 'vitest';
import {
  applyHiddenFilter,
  exportCommunityAllowlist,
  findSyncedConflictGroups,
  filterReviewItems,
  dedupeMarketplaceListings,
  marketplaceActionabilityScore,
  mergeCommunityAllowlist,
  parseCommunityAllowlistEnvelope,
  rankMarketplaceListings,
  relayScoreFromHealth,
  relayScoresFromHealth,
  summarizeRelayFetch
} from './quality';
import type {
  CommunityAllowlistEntry,
  Listing,
  MediatorProfile,
  PublicDisputeOutcome,
  PublicProfile,
  RelayHealth,
  NostrReviewItem,
  ReputationAttestation,
  SyncedPublicRecord
} from '../../types/domain';

function record<T extends { id: string }>(payload: T, overrides: Partial<SyncedPublicRecord<T>> = {}): SyncedPublicRecord<T> {
  return {
    id: `synced_${overrides.eventId ?? 'event_1'}`,
    eventId: overrides.eventId ?? 'event_1',
    kind: overrides.kind ?? 30402,
    authorPublicKey: overrides.authorPublicKey ?? 'a'.repeat(64),
    relayUrls: ['wss://relay.example'],
    receivedAt: '2026-05-31T00:00:00.000Z',
    importedAt: '2026-05-31T00:00:00.000Z',
    payload,
    trusted: false,
    hidden: false,
    ...overrides
  };
}

function reviewItem(overrides: Partial<NostrReviewItem> = {}): NostrReviewItem {
  return {
    id: overrides.id ?? `review_${overrides.eventId ?? 'event_1'}`,
    eventId: overrides.eventId ?? 'event_1',
    kind: overrides.kind ?? 30402,
    relay: overrides.relay ?? 'wss://relay.example',
    authorPublicKey: overrides.authorPublicKey ?? 'a'.repeat(64),
    receivedAt: overrides.receivedAt ?? '2026-05-31T00:00:00.000Z',
    signatureValid: overrides.signatureValid ?? true,
    importStatus: overrides.importStatus ?? 'pending',
    payloadPreview: overrides.payloadPreview ?? 'Public listing preview.',
    rawEvent: overrides.rawEvent ?? '{}'
  };
}

describe('sync quality helpers', () => {
  it('scores healthy, disabled, high-latency, errored, and failing relays', () => {
    const healthy: RelayHealth = {
      url: 'wss://healthy.example',
      enabled: true,
      latencyMs: 300,
      eventsReceived: 10,
      eventsPublished: 5,
      consecutiveFailures: 0
    };
    const disabled: RelayHealth = {
      url: 'wss://disabled.example',
      enabled: false,
      eventsReceived: 0,
      eventsPublished: 0,
      consecutiveFailures: 0
    };
    const failing: RelayHealth = {
      url: 'wss://failing.example',
      enabled: true,
      latencyMs: 3200,
      lastError: 'timeout',
      eventsReceived: 1,
      eventsPublished: 0,
      consecutiveFailures: 3
    };

    expect(relayScoreFromHealth(healthy)).toMatchObject({ label: 'excellent', score: 100 });
    expect(relayScoreFromHealth(disabled)).toMatchObject({ label: 'offline' });
    expect(relayScoreFromHealth(failing).reasons).toEqual(expect.arrayContaining(['high-latency', 'last-error', 'failures']));
    expect(relayScoresFromHealth([failing, healthy, disabled])[0].url).toBe('wss://healthy.example');
  });

  it('detects conflicts for every synced public record type', () => {
    const profile = { id: 'profile_1', updatedAt: '2026-05-31T00:00:00.000Z' } as PublicProfile;
    const listing = { id: 'listing_1', updatedAt: '2026-05-31T00:00:00.000Z' } as Listing;
    const mediator = { id: 'mediator_1', updatedAt: '2026-05-31T00:00:00.000Z' } as MediatorProfile;
    const attestation = { id: 'attestation_1' } as ReputationAttestation;
    const outcome = { id: 'outcome_1', updatedAt: '2026-05-31T00:00:00.000Z' } as PublicDisputeOutcome;

    expect(findSyncedConflictGroups([record(profile, { kind: 39001 }), record(profile, { eventId: 'event_2', kind: 39001 })])).toHaveLength(1);
    expect(findSyncedConflictGroups([record(listing), record(listing, { eventId: 'event_3' })])).toHaveLength(1);
    expect(findSyncedConflictGroups([record(mediator, { kind: 39003 }), record(mediator, { eventId: 'event_4', kind: 39003 })])).toHaveLength(1);
    expect(
      findSyncedConflictGroups([record(attestation, { kind: 39004 }), record(attestation, { eventId: 'event_5', kind: 39004 })])
    ).toHaveLength(1);
    expect(findSyncedConflictGroups([record(outcome, { kind: 39005 }), record(outcome, { eventId: 'event_6', kind: 39005 })])).toHaveLength(1);
  });

  it('filters hidden synced records without changing local data', () => {
    const visible = record({ id: 'visible', updatedAt: '2026-05-31T00:00:00.000Z' });
    const hidden = record({ id: 'hidden', updatedAt: '2026-05-31T00:00:00.000Z' }, { hidden: true });

    expect(applyHiddenFilter([visible, hidden], 'visible')).toEqual([visible]);
    expect(applyHiddenFilter([visible, hidden], 'hidden')).toEqual([hidden]);
    expect(applyHiddenFilter([visible, hidden], 'all')).toEqual([visible, hidden]);
  });

  it('exports, parses, and merges community allowlists by public key', () => {
    const existing: CommunityAllowlistEntry[] = [
      {
        id: 'allow_1',
        publicKey: 'a'.repeat(64),
        label: 'Existing group',
        note: 'private local note',
        createdAt: '2026-05-31T00:00:00.000Z'
      }
    ];
    const exported = exportCommunityAllowlist([
      { id: 'allow_2', publicKey: 'b'.repeat(64), label: 'Imported group', note: 'shared note', createdAt: '2026-05-31T00:00:00.000Z' }
    ]);
    const parsed = parseCommunityAllowlistEnvelope(exported);
    const merged = mergeCommunityAllowlist(existing, {
      ...parsed,
      entries: [
        { publicKey: 'a'.repeat(64), label: 'Remote label', note: 'remote note' },
        ...parsed.entries
      ]
    });

    expect(merged).toHaveLength(2);
    expect(merged.find((entry) => entry.publicKey === 'a'.repeat(64))?.note).toBe('private local note');
    expect(merged.find((entry) => entry.publicKey === 'b'.repeat(64))?.label).toBe('Imported group');
  });

  it('filters review queue items by status, encryption, and trust', () => {
    const items: NostrReviewItem[] = [
      reviewItem({
        eventId: 'event_1',
        authorPublicKey: 'a'.repeat(64),
        payloadPreview: 'Encrypted AgoraMesh relay content.'
      }),
      reviewItem({
        eventId: 'event_2',
        authorPublicKey: 'b'.repeat(64),
        signatureValid: false,
        importStatus: 'invalid',
        payloadPreview: 'Invalid event.'
      })
    ];

    expect(filterReviewItems(items, { status: 'pending', encryption: 'encrypted', trust: 'trusted' }, ['a'.repeat(64)])).toHaveLength(1);
    expect(filterReviewItems(items, { status: 'invalid', encryption: 'plain', trust: 'untrusted' }, ['a'.repeat(64)])).toHaveLength(1);
  });

  it('summarizes relay fetches with duplicates and invalid counts', () => {
    const fetched = [
      reviewItem({ eventId: 'event_new', relay: 'wss://relay.example' }),
      reviewItem({ eventId: 'event_existing', relay: 'wss://relay.example', importStatus: 'invalid', signatureValid: false })
    ];
    const summary = summarizeRelayFetch(
      [{ url: 'wss://relay.example', enabled: true }],
      fetched,
      [{ ...fetched[1], eventId: 'event_existing' }],
      100,
      250
    )[0];

    expect(summary).toMatchObject({ received: 2, duplicates: 1, invalid: 1, elapsedMs: 150 });
  });

  it('deduplicates and ranks marketplace listings', () => {
    const older: Listing = {
      id: 'listing_1',
      authorPublicKey: 'a'.repeat(64),
      title: 'Repair help',
      type: 'offer',
      category: 'repairs',
      description: 'Older repair help.',
      region: 'Brno',
      status: 'active',
      price: { amount: '0', currency: 'FREE' },
      paymentPreferences: ['cash'],
      barterAccepted: false,
      tags: ['tools'],
      expiresAt: '2099-06-30',
      contactMethod: { id: 'contact_1', kind: 'matrix', value: '@a:example.org' },
      visibility: 'public',
      createdAt: '2026-05-30T00:00:00.000Z',
      updatedAt: '2026-05-30T00:00:00.000Z'
    };
    const newer = { ...older, description: 'Newer trusted repair help.', updatedAt: '2026-06-01T00:00:00.000Z' };
    const { visible, duplicates } = dedupeMarketplaceListings([
      { listing: older, source: 'local', trusted: true },
      { listing: newer, source: 'synced', trusted: true, record: record(newer) }
    ]);

    expect(visible).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
    expect(rankMarketplaceListings(visible, { query: 'repair', category: 'repairs', type: 'offer' })[0].rankReasons?.map((reason) => reason.code)).toContain(
      'title-match'
    );
  });

  it('scores actionable buyer requests with practical exchange metadata', () => {
    const request: Listing = {
      id: 'request_1',
      authorPublicKey: 'b'.repeat(64),
      title: 'Need private courier',
      type: 'request',
      category: 'logistics',
      description: 'Need a courier this week.',
      region: 'Prague',
      status: 'active',
      price: { amount: '5000', currency: 'CZK' },
      paymentPreferences: ['lightning'],
      fulfillmentType: 'delivery',
      fulfillmentNotes: 'Pickup and handoff in Prague.',
      paymentIntents: [],
      barterAccepted: false,
      tags: ['courier'],
      expiresAt: '2026-06-23',
      contactMethod: { id: 'contact_1', kind: 'nostr', value: 'b'.repeat(64) },
      visibility: 'public',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z'
    };
    const score = marketplaceActionabilityScore(
      { listing: request, source: 'synced', trusted: true, record: record(request, { trusted: true }) },
      { viewerPublicKey: 'a'.repeat(64), networkPublicKeys: ['b'.repeat(64)], now: new Date('2026-06-19T00:00:00.000Z').getTime() }
    );
    expect(score.reasons).toEqual(expect.arrayContaining(['buyer-request', 'trusted', 'network', 'payment', 'fulfillment', 'contact', 'expiring']));
    expect(score.score).toBeGreaterThanOrEqual(90);
    expect(
      rankMarketplaceListings([{ listing: request, source: 'synced', trusted: true, record: record(request, { trusted: true }) }])[0].rankReasons?.map((reason) => reason.code)
    ).toContain('buyer-request');
  });

  it('deduplicates exact copied marketplace listings across different authors', () => {
    const original: Listing = {
      id: 'listing_original',
      authorPublicKey: 'a'.repeat(64),
      title: 'Coldcard Q signing device',
      type: 'offer',
      category: 'other-peaceful-services',
      description: 'Full keyboard and QR scanner for Bitcoin signing.',
      region: 'Worldwide',
      status: 'active',
      price: { amount: '279', currency: 'USD' },
      paymentPreferences: ['other'],
      barterAccepted: false,
      tags: ['shopstr'],
      expiresAt: '2099-06-30',
      contactMethod: { id: 'contact_1', kind: 'nostr', value: 'a'.repeat(64) },
      visibility: 'public',
      createdAt: '2026-05-30T00:00:00.000Z',
      updatedAt: '2026-05-30T00:00:00.000Z'
    };
    const copiedByAnotherKey: Listing = {
      ...original,
      id: 'listing_copy',
      authorPublicKey: 'b'.repeat(64),
      contactMethod: { id: 'contact_2', kind: 'nostr', value: 'b'.repeat(64) },
      images: [{ id: 'image_copy', url: 'https://media.example/coldcard.webp' }],
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z'
    };

    const { visible, duplicates } = dedupeMarketplaceListings([
      { listing: original, source: 'synced', trusted: false, record: record(original, { eventId: 'event_original', authorPublicKey: original.authorPublicKey }) },
      {
        listing: copiedByAnotherKey,
        source: 'synced',
        trusted: true,
        record: record(copiedByAnotherKey, { eventId: 'event_copy', authorPublicKey: copiedByAnotherKey.authorPublicKey, trusted: true })
      }
    ]);

    expect(visible).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
    expect(visible[0].listing.id).toBe('listing_copy');
    expect(visible[0].duplicateCount).toBe(1);
  });

  it('keeps listings with only the same title visible when their content differs', () => {
    const base: Listing = {
      id: 'listing_base',
      authorPublicKey: 'a'.repeat(64),
      title: 'Repair help',
      type: 'offer',
      category: 'repairs',
      description: 'Bicycle repair in Brno.',
      region: 'Brno',
      status: 'active',
      price: { amount: '0', currency: 'FREE' },
      paymentPreferences: ['cash'],
      barterAccepted: false,
      tags: ['tools'],
      expiresAt: '2099-06-30',
      contactMethod: { id: 'contact_1', kind: 'matrix', value: '@a:example.org' },
      visibility: 'public',
      createdAt: '2026-05-30T00:00:00.000Z',
      updatedAt: '2026-05-30T00:00:00.000Z'
    };
    const differentDescription = { ...base, id: 'listing_other', authorPublicKey: 'b'.repeat(64), description: 'Laptop repair in Prague.', region: 'Prague' };

    const { visible, duplicates } = dedupeMarketplaceListings([
      { listing: base, source: 'synced', trusted: false, record: record(base, { eventId: 'event_base', authorPublicKey: base.authorPublicKey }) },
      {
        listing: differentDescription,
        source: 'synced',
        trusted: false,
        record: record(differentDescription, { eventId: 'event_other', authorPublicKey: differentDescription.authorPublicKey })
      }
    ]);

    expect(visible).toHaveLength(2);
    expect(duplicates).toHaveLength(0);
  });
});
