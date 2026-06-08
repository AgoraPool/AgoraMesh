import Dexie, { type Table } from 'dexie';
import type {
  Agreement,
  AgreementAcceptanceReceipt,
  AppBackup,
  BlossomServerConfig,
  CommunityAllowlistEntry,
  CommunityCurationList,
  DisputeCase,
  IdentityRecord,
  Listing,
  MediatorProfile,
  NostrReviewItem,
  PublicDisputeOutcome,
  PublicProfile,
  PublishReceipt,
  RelayConfig,
  RelayHealth,
  ReputationAttestation,
  SyncSettings,
  SyncedPublicRecord
} from '../../types/domain';
import {
  AGORAMESH_EVENT_KINDS,
  importablePayloadFromReviewItem,
  parseNostrEvent,
  reviewItemFromEvent,
  syncedRecordFromReviewItem,
  validateBackup
} from '../nostr/events';
import { listingSchema, syncSettingsSchema } from '../validation/schemas';

export const defaultRelays: RelayConfig[] = [
  { url: 'wss://relay.damus.io', enabled: true },
  { url: 'wss://nos.lol', enabled: true },
  { url: 'wss://relay.primal.net', enabled: false }
];

export const defaultSyncSettings: SyncSettings = {
  id: 'default',
  liveSyncEnabled: false,
  showDataSource: true,
  defaultBrowseSource: 'combined',
  listingDiscoveryScope: 'agoramesh-native'
};

export class AgoraMeshDb extends Dexie {
  identity!: Table<IdentityRecord, string>;
  profile!: Table<PublicProfile, string>;
  listings!: Table<Listing, string>;
  agreements!: Table<Agreement, string>;
  agreementReceipts!: Table<AgreementAcceptanceReceipt, string>;
  mediators!: Table<MediatorProfile, string>;
  disputes!: Table<DisputeCase, string>;
  attestations!: Table<ReputationAttestation, string>;
  relays!: Table<RelayConfig, string>;
  nostrReview!: Table<NostrReviewItem, string>;
  publicProfiles!: Table<PublicProfile, string>;
  syncedProfiles!: Table<SyncedPublicRecord<PublicProfile>, string>;
  syncedListings!: Table<SyncedPublicRecord<Listing>, string>;
  syncedMediators!: Table<SyncedPublicRecord<MediatorProfile>, string>;
  syncedAttestations!: Table<SyncedPublicRecord<ReputationAttestation>, string>;
  syncedDisputeOutcomes!: Table<SyncedPublicRecord<PublicDisputeOutcome>, string>;
  communityLists!: Table<CommunityCurationList, string>;
  syncedCommunityLists!: Table<SyncedPublicRecord<CommunityCurationList>, string>;
  relayHealth!: Table<RelayHealth, string>;
  publishReceipts!: Table<PublishReceipt, string>;
  allowlist!: Table<CommunityAllowlistEntry, string>;
  syncSettings!: Table<SyncSettings, string>;
  blossomServers!: Table<BlossomServerConfig, string>;

  constructor() {
    super('agoramesh');
    this.version(1).stores({
      identity: 'id, publicKey',
      profile: 'id, publicKey, mediatorAvailable',
      listings: 'id, authorPublicKey, type, category, region, visibility, createdAt, expiresAt',
      agreements: 'id, hash, createdAt',
      mediators: 'id, publicKey, region',
      disputes: 'id, state, agreementHash, createdAt',
      attestations: 'id, reviewerPublicKey, subjectPublicKey, agreementHash, eventId',
      relays: 'url, enabled'
    });
    this.version(2).stores({
      identity: 'id, publicKey',
      profile: 'id, publicKey, mediatorAvailable',
      listings: 'id, authorPublicKey, type, category, region, visibility, createdAt, expiresAt',
      agreements: 'id, hash, createdAt',
      mediators: 'id, publicKey, region',
      disputes: 'id, state, agreementHash, createdAt',
      attestations: 'id, reviewerPublicKey, subjectPublicKey, agreementHash, eventId',
      relays: 'url, enabled',
      nostrReview: 'id, eventId, kind, relay, importStatus, receivedAt',
      publicProfiles: 'id, publicKey, mediatorAvailable'
    });
    this.version(3).stores({
      identity: 'id, publicKey',
      profile: 'id, publicKey, mediatorAvailable',
      listings: 'id, authorPublicKey, type, category, region, visibility, createdAt, expiresAt',
      agreements: 'id, hash, createdAt',
      mediators: 'id, publicKey, region',
      disputes: 'id, state, agreementHash, createdAt',
      attestations: 'id, reviewerPublicKey, subjectPublicKey, agreementHash, eventId',
      relays: 'url, enabled',
      nostrReview: 'id, eventId, kind, relay, importStatus, receivedAt, authorPublicKey',
      publicProfiles: 'id, publicKey, mediatorAvailable',
      syncedProfiles: 'id, eventId, kind, authorPublicKey, importedAt, trusted, hidden',
      syncedListings: 'id, eventId, kind, authorPublicKey, importedAt, trusted, hidden',
      syncedMediators: 'id, eventId, kind, authorPublicKey, importedAt, trusted, hidden',
      syncedAttestations: 'id, eventId, kind, authorPublicKey, importedAt, trusted, hidden',
      syncedDisputeOutcomes: 'id, eventId, kind, authorPublicKey, importedAt, trusted, hidden',
      relayHealth: 'url, enabled, lastConnectedAt, consecutiveFailures',
      publishReceipts: 'id, objectType, objectId, eventId, relayUrl, status, at',
      allowlist: 'id, publicKey, label, createdAt',
      syncSettings: 'id'
    });
    this.version(4).stores({
      identity: 'id, publicKey',
      profile: 'id, publicKey, mediatorAvailable',
      listings: 'id, authorPublicKey, type, category, region, visibility, createdAt, expiresAt',
      agreements: 'id, hash, createdAt',
      mediators: 'id, publicKey, region',
      disputes: 'id, state, agreementHash, createdAt',
      attestations: 'id, reviewerPublicKey, subjectPublicKey, agreementHash, eventId',
      relays: 'url, enabled',
      nostrReview: 'id, eventId, kind, relay, importStatus, receivedAt, authorPublicKey',
      publicProfiles: 'id, publicKey, mediatorAvailable',
      syncedProfiles: 'id, eventId, kind, authorPublicKey, importedAt, trusted, hidden',
      syncedListings: 'id, eventId, kind, authorPublicKey, importedAt, trusted, hidden',
      syncedMediators: 'id, eventId, kind, authorPublicKey, importedAt, trusted, hidden',
      syncedAttestations: 'id, eventId, kind, authorPublicKey, importedAt, trusted, hidden',
      syncedDisputeOutcomes: 'id, eventId, kind, authorPublicKey, importedAt, trusted, hidden',
      communityLists: 'id, authorPublicKey, updatedAt',
      syncedCommunityLists: 'id, eventId, kind, authorPublicKey, importedAt, trusted, hidden',
      relayHealth: 'url, enabled, lastConnectedAt, consecutiveFailures',
      publishReceipts: 'id, objectType, objectId, eventId, relayUrl, status, at',
      allowlist: 'id, publicKey, label, createdAt',
      syncSettings: 'id'
    });
    this.version(5).stores({
      identity: 'id, publicKey',
      profile: 'id, publicKey, mediatorAvailable',
      listings: 'id, authorPublicKey, type, category, region, visibility, createdAt, expiresAt',
      agreements: 'id, hash, createdAt',
      agreementReceipts: 'id, agreementHash, role, signerPublicKey, acceptedAt',
      mediators: 'id, publicKey, region',
      disputes: 'id, state, agreementHash, createdAt',
      attestations: 'id, reviewerPublicKey, subjectPublicKey, agreementHash, eventId',
      relays: 'url, enabled',
      nostrReview: 'id, eventId, kind, relay, importStatus, receivedAt, authorPublicKey',
      publicProfiles: 'id, publicKey, mediatorAvailable',
      syncedProfiles: 'id, eventId, kind, authorPublicKey, importedAt, trusted, hidden',
      syncedListings: 'id, eventId, kind, authorPublicKey, importedAt, trusted, hidden',
      syncedMediators: 'id, eventId, kind, authorPublicKey, importedAt, trusted, hidden',
      syncedAttestations: 'id, eventId, kind, authorPublicKey, importedAt, trusted, hidden',
      syncedDisputeOutcomes: 'id, eventId, kind, authorPublicKey, importedAt, trusted, hidden',
      communityLists: 'id, authorPublicKey, updatedAt',
      syncedCommunityLists: 'id, eventId, kind, authorPublicKey, importedAt, trusted, hidden',
      relayHealth: 'url, enabled, lastConnectedAt, consecutiveFailures',
      publishReceipts: 'id, objectType, objectId, eventId, relayUrl, status, at',
      allowlist: 'id, publicKey, label, createdAt',
      syncSettings: 'id'
    });
    this.version(6).stores({
      identity: 'id, publicKey',
      profile: 'id, publicKey, mediatorAvailable',
      listings: 'id, authorPublicKey, type, category, region, visibility, createdAt, expiresAt',
      agreements: 'id, hash, createdAt',
      agreementReceipts: 'id, agreementHash, role, signerPublicKey, acceptedAt',
      mediators: 'id, publicKey, region',
      disputes: 'id, state, agreementHash, createdAt',
      attestations: 'id, reviewerPublicKey, subjectPublicKey, agreementHash, eventId',
      relays: 'url, enabled',
      nostrReview: 'id, eventId, kind, relay, importStatus, receivedAt, authorPublicKey',
      publicProfiles: 'id, publicKey, mediatorAvailable',
      syncedProfiles: 'id, eventId, kind, authorPublicKey, importedAt, trusted, hidden',
      syncedListings: 'id, eventId, kind, authorPublicKey, importedAt, trusted, hidden',
      syncedMediators: 'id, eventId, kind, authorPublicKey, importedAt, trusted, hidden',
      syncedAttestations: 'id, eventId, kind, authorPublicKey, importedAt, trusted, hidden',
      syncedDisputeOutcomes: 'id, eventId, kind, authorPublicKey, importedAt, trusted, hidden',
      communityLists: 'id, authorPublicKey, updatedAt',
      syncedCommunityLists: 'id, eventId, kind, authorPublicKey, importedAt, trusted, hidden',
      relayHealth: 'url, enabled, lastConnectedAt, consecutiveFailures',
      publishReceipts: 'id, objectType, objectId, eventId, relayUrl, status, at',
      allowlist: 'id, publicKey, label, createdAt',
      syncSettings: 'id',
      blossomServers: 'id, url, enabled'
    });
    this.version(7)
      .stores({
        identity: 'id, publicKey',
        profile: 'id, publicKey, mediatorAvailable',
        listings: 'id, authorPublicKey, type, category, region, visibility, status, createdAt, expiresAt',
        agreements: 'id, hash, createdAt',
        agreementReceipts: 'id, agreementHash, role, signerPublicKey, acceptedAt',
        mediators: 'id, publicKey, region',
        disputes: 'id, state, agreementHash, createdAt',
        attestations: 'id, reviewerPublicKey, subjectPublicKey, agreementHash, eventId',
        relays: 'url, enabled',
        nostrReview: 'id, eventId, kind, relay, importStatus, receivedAt, authorPublicKey',
        publicProfiles: 'id, publicKey, mediatorAvailable',
        syncedProfiles: 'id, eventId, kind, authorPublicKey, importedAt, trusted, hidden',
        syncedListings: 'id, eventId, kind, authorPublicKey, importedAt, trusted, hidden',
        syncedMediators: 'id, eventId, kind, authorPublicKey, importedAt, trusted, hidden',
        syncedAttestations: 'id, eventId, kind, authorPublicKey, importedAt, trusted, hidden',
        syncedDisputeOutcomes: 'id, eventId, kind, authorPublicKey, importedAt, trusted, hidden',
        communityLists: 'id, authorPublicKey, updatedAt',
        syncedCommunityLists: 'id, eventId, kind, authorPublicKey, importedAt, trusted, hidden',
        relayHealth: 'url, enabled, lastConnectedAt, consecutiveFailures',
        publishReceipts: 'id, objectType, objectId, eventId, relayUrl, status, at',
        allowlist: 'id, publicKey, label, createdAt',
        syncSettings: 'id',
        blossomServers: 'id, url, enabled'
      })
      .upgrade(async (transaction) => {
        await transaction.table('listings').toCollection().modify((listing) => {
          Object.assign(listing, listingSchema.parse(listing));
        });
        await transaction.table('syncedListings').where('kind').notEqual(AGORAMESH_EVENT_KINDS.listing).delete();
        await transaction.table('syncedListings').toCollection().modify((record) => {
          record.payload = listingSchema.parse(record.payload);
        });
      });
    this.version(8).upgrade(async (transaction) => {
      await transaction.table('syncedListings').where('kind').notEqual(AGORAMESH_EVENT_KINDS.listing).delete();
      await transaction.table('syncedListings').toCollection().modify((record) => {
        record.payload = listingSchema.parse(record.payload);
      });
    });
    this.version(9).upgrade(async (transaction) => {
      await transaction.table('syncSettings').toCollection().modify((settings) => {
        Object.assign(settings, syncSettingsSchema.parse({ ...defaultSyncSettings, ...settings }));
      });
    });
  }
}

export const db = new AgoraMeshDb();

export async function ensureDefaults(): Promise<void> {
  const count = await db.relays.count();
  if (count === 0) {
    await db.relays.bulkPut(defaultRelays);
  }
  const settings = await db.syncSettings.get('default');
  if (!settings) {
    await db.syncSettings.put(defaultSyncSettings);
  } else {
    await db.syncSettings.put(syncSettingsSchema.parse({ ...defaultSyncSettings, ...settings }));
  }
  const health = await db.relayHealth.toArray();
  const known = new Set(health.map((entry) => entry.url));
  await db.relayHealth.bulkPut(
    defaultRelays
      .filter((relay) => !known.has(relay.url))
      .map((relay) => ({
        url: relay.url,
        enabled: relay.enabled,
        eventsReceived: 0,
        eventsPublished: 0,
        consecutiveFailures: 0
      }))
  );
}

export async function exportAllData(): Promise<AppBackup> {
  await ensureDefaults();
  const identity = await db.identity.toCollection().first();
  const profile = await db.profile.toCollection().first();

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    identity,
    profile,
    listings: await db.listings.toArray(),
    agreements: await db.agreements.toArray(),
    agreementReceipts: await db.agreementReceipts.toArray(),
    mediators: await db.mediators.toArray(),
    disputes: await db.disputes.toArray(),
    attestations: await db.attestations.toArray(),
    relays: await db.relays.toArray(),
    nostrReview: await db.nostrReview.toArray(),
    publicProfiles: await db.publicProfiles.toArray(),
    syncedProfiles: await db.syncedProfiles.toArray(),
    syncedListings: await db.syncedListings.toArray(),
    syncedMediators: await db.syncedMediators.toArray(),
    syncedAttestations: await db.syncedAttestations.toArray(),
    syncedDisputeOutcomes: await db.syncedDisputeOutcomes.toArray(),
    communityLists: await db.communityLists.toArray(),
    syncedCommunityLists: await db.syncedCommunityLists.toArray(),
    relayHealth: await db.relayHealth.toArray(),
    publishReceipts: await db.publishReceipts.toArray(),
    allowlist: await db.allowlist.toArray(),
    syncSettings: await db.syncSettings.toArray(),
    blossomServers: await db.blossomServers.toArray()
  };
}

export async function importAllData(raw: unknown): Promise<void> {
  const backup = validateBackup(raw);
  const verifiedSynced = await verifiedSyncedCacheFromBackup(backup);

  await db.transaction(
    'rw',
    [
      db.identity,
      db.profile,
      db.listings,
      db.agreements,
      db.agreementReceipts,
      db.mediators,
      db.disputes,
      db.attestations,
      db.relays,
      db.nostrReview,
      db.publicProfiles,
      db.syncedProfiles,
      db.syncedListings,
      db.syncedMediators,
      db.syncedAttestations,
      db.syncedDisputeOutcomes,
      db.communityLists,
      db.syncedCommunityLists,
      db.relayHealth,
      db.publishReceipts,
      db.allowlist,
      db.syncSettings,
      db.blossomServers
    ],
    async () => {
      await Promise.all([
        db.identity.clear(),
        db.profile.clear(),
        db.listings.clear(),
        db.agreements.clear(),
        db.agreementReceipts.clear(),
        db.mediators.clear(),
        db.disputes.clear(),
        db.attestations.clear(),
        db.relays.clear(),
        db.nostrReview.clear(),
        db.publicProfiles.clear(),
        db.syncedProfiles.clear(),
        db.syncedListings.clear(),
        db.syncedMediators.clear(),
        db.syncedAttestations.clear(),
        db.syncedDisputeOutcomes.clear(),
        db.communityLists.clear(),
        db.syncedCommunityLists.clear(),
        db.relayHealth.clear(),
        db.publishReceipts.clear(),
        db.allowlist.clear(),
        db.syncSettings.clear(),
        db.blossomServers.clear()
      ]);

      if (backup.identity) await db.identity.put(backup.identity);
      if (backup.profile) await db.profile.put(backup.profile);

      await Promise.all([
        db.listings.bulkPut(backup.listings.map((listing) => listingSchema.parse(listing))),
        db.agreements.bulkPut(backup.agreements),
        db.agreementReceipts.bulkPut(backup.agreementReceipts),
        db.mediators.bulkPut(backup.mediators),
        db.disputes.bulkPut(backup.disputes),
        db.attestations.bulkPut(backup.attestations),
        db.relays.bulkPut(backup.relays),
        db.nostrReview.bulkPut(backup.nostrReview),
        db.publicProfiles.bulkPut(backup.publicProfiles),
        db.syncedProfiles.bulkPut(verifiedSynced.profiles),
        db.syncedListings.bulkPut(verifiedSynced.listings),
        db.syncedMediators.bulkPut(verifiedSynced.mediators),
        db.syncedAttestations.bulkPut(verifiedSynced.attestations),
        db.syncedDisputeOutcomes.bulkPut(verifiedSynced.disputeOutcomes),
        db.communityLists.bulkPut(backup.communityLists),
        db.syncedCommunityLists.bulkPut(verifiedSynced.communityLists),
        db.relayHealth.bulkPut(backup.relayHealth),
        db.publishReceipts.bulkPut(backup.publishReceipts),
        db.allowlist.bulkPut(backup.allowlist),
        db.syncSettings.bulkPut(
          (backup.syncSettings.length > 0 ? backup.syncSettings : [defaultSyncSettings]).map((settings) =>
            syncSettingsSchema.parse({ ...defaultSyncSettings, ...settings })
          )
        ),
        db.blossomServers.bulkPut(backup.blossomServers)
      ]);
    }
  );

  await ensureDefaults();
}

async function verifiedSyncedCacheFromBackup(backup: AppBackup): Promise<{
  profiles: SyncedPublicRecord<PublicProfile>[];
  listings: SyncedPublicRecord<Listing>[];
  mediators: SyncedPublicRecord<MediatorProfile>[];
  attestations: SyncedPublicRecord<ReputationAttestation>[];
  disputeOutcomes: SyncedPublicRecord<PublicDisputeOutcome>[];
  communityLists: SyncedPublicRecord<CommunityCurationList>[];
}> {
  return {
    profiles: await verifiedSyncedRecords(backup.syncedProfiles, backup.allowlist, AGORAMESH_EVENT_KINDS.profile),
    listings: await verifiedSyncedRecords(backup.syncedListings, backup.allowlist, AGORAMESH_EVENT_KINDS.listing),
    mediators: await verifiedSyncedRecords(backup.syncedMediators, backup.allowlist, AGORAMESH_EVENT_KINDS.mediator),
    attestations: await verifiedSyncedRecords(backup.syncedAttestations, backup.allowlist, AGORAMESH_EVENT_KINDS.reputation),
    disputeOutcomes: await verifiedSyncedRecords(backup.syncedDisputeOutcomes, backup.allowlist, AGORAMESH_EVENT_KINDS.disputeOutcome),
    communityLists: await verifiedSyncedRecords(backup.syncedCommunityLists, backup.allowlist, AGORAMESH_EVENT_KINDS.communityList)
  };
}

async function verifiedSyncedRecords<T>(
  records: SyncedPublicRecord<T>[],
  allowlist: CommunityAllowlistEntry[],
  expectedKind: number
): Promise<SyncedPublicRecord<T>[]> {
  const verified: SyncedPublicRecord<T>[] = [];
  for (const record of records) {
    if (!record.rawEvent) continue;
    try {
      const event = parseNostrEvent(JSON.parse(record.rawEvent));
      const relay = record.relayUrls[0] ?? 'backup';
      const item = reviewItemFromEvent(event, relay, record.discoveryScope ?? 'all-nip99');
      if (item.eventId !== record.eventId || item.kind !== expectedKind) continue;
      const payload = await importablePayloadFromReviewItem(item);
      const restored = syncedRecordFromReviewItem(item, allowlist, payload) as SyncedPublicRecord<T>;
      verified.push({ ...restored, hidden: record.hidden });
    } catch {
      // Synced public cache is derived from relay events. If a backup entry cannot be
      // revalidated from its raw signed event, keep user-owned data and drop this cache row.
    }
  }
  return verified;
}

export async function deleteLocalData(): Promise<void> {
  await db.delete();
  await db.open();
  await ensureDefaults();
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
