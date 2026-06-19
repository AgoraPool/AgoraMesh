import { db, deleteLocalData, exportAllData, importAllData } from './db';
import type {
  AgreementAcceptanceReceipt,
  CommunityCurationList,
  IdentityRecord,
  LightningPaymentAttempt,
  Listing,
  MediatorProfile,
  NwcConnection,
  PublicProfile,
  SyncedPublicRecord,
  TradeRoom,
  TradeRoomDelivery
} from '../../types/domain';
import { bytesToHex } from '@noble/hashes/utils';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { importablePayloadFromReviewItem, reviewItemFromEvent, signCommunityCurationList, syncedRecordFromReviewItem } from '../nostr/events';

describe('import/export round trip', () => {
  beforeEach(async () => {
    await deleteLocalData();
  });

  it('exports and imports stable backup JSON', async () => {
    const listing: Listing = {
      id: 'listing_roundtrip',
      authorPublicKey: 'e'.repeat(64),
      title: 'Self-hosting help',
      type: 'offer',
      category: 'home-server-self-hosting-help',
      description: 'Set up a local server.',
      region: 'Ostrava',
      status: 'active',
      price: { amount: '0', currency: 'FREE' },
      paymentPreferences: ['mutual-credit'],
      barterAccepted: false,
      tags: ['server'],
      expiresAt: '2026-06-30',
      contactMethod: { id: 'contact_1', kind: 'simplex', value: 'simplex-address' },
      visibility: 'local',
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z'
    };
    const receipt: AgreementAcceptanceReceipt = {
      id: 'receipt_roundtrip',
      schemaVersion: 1,
      kind: 'agreement-acceptance-receipt',
      agreementHash: 'a'.repeat(64),
      role: 'buyer',
      signerPublicKey: 'e'.repeat(64),
      acceptedAt: '2026-05-31T00:00:00.000Z',
      eventId: 'event_receipt',
      signature: 'signature'
    };
    const room: TradeRoom = {
      id: 'trade_room_roundtrip',
      buyerPublicKey: 'e'.repeat(64),
      sellerPublicKey: 'f'.repeat(64),
      buyerLabel: 'Buyer',
      sellerLabel: 'Seller',
      listingId: listing.id,
      listingTitle: listing.title,
      state: 'intent',
      paymentState: 'none',
      deliveryState: 'none',
      relatedPaymentAttemptIds: [],
      relatedZapReceiptIds: [],
      relatedMessageThreadIds: [],
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z'
    };
    const delivery: TradeRoomDelivery = {
      id: 'trade_delivery_roundtrip',
      roomId: room.id,
      senderPublicKey: room.sellerPublicKey,
      fileName: 'manual.pdf',
      fileHash: 'sha256:abc123',
      note: 'Private file handoff.',
      url: 'https://example.test/manual.pdf',
      status: 'sent',
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z'
    };

    await db.listings.put(listing);
    await db.agreementReceipts.put(receipt);
    await db.tradeRooms.put(room);
    await db.tradeRoomDeliveries.put(delivery);
    const backup = await exportAllData();
    await deleteLocalData();
    await importAllData(backup);

    await expect(db.listings.get('listing_roundtrip')).resolves.toMatchObject({ title: 'Self-hosting help' });
    await expect(db.agreementReceipts.get('receipt_roundtrip')).resolves.toMatchObject({ agreementHash: 'a'.repeat(64) });
    await expect(db.tradeRooms.get('trade_room_roundtrip')).resolves.toMatchObject({ listingId: listing.id, state: 'intent' });
    await expect(db.tradeRoomDeliveries.get('trade_delivery_roundtrip')).resolves.toMatchObject({ roomId: room.id, status: 'sent' });
  });

  it('keeps local public profile and mediator profile as separate backup records', async () => {
    const profile: PublicProfile = {
      id: 'profile_roundtrip',
      displayName: 'Alice',
      publicKey: 'a'.repeat(64),
      avatarUrl: '',
      bio: 'Marketplace profile.',
      region: 'Brno',
      languages: ['en', 'cs'],
      contactMethods: [{ id: 'contact_profile', kind: 'matrix', value: '@alice:matrix.org' }],
      skills: ['mediation'],
      mediatorAvailable: true,
      publicVisibility: true,
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z'
    };
    const mediator: MediatorProfile = {
      id: 'mediator_profile_roundtrip',
      displayName: 'Alice',
      publicKey: profile.publicKey,
      region: 'Brno',
      languages: ['en', 'cs'],
      specialties: ['marketplace disputes'],
      feeModel: 'Sliding scale',
      mediationStyle: 'Written voluntary mediation.',
      responseTime: 'Within 24 hours',
      caseCount: 0,
      contactMethods: profile.contactMethods,
      procedure: 'Both parties share signed trade context.',
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z'
    };

    await db.profile.put(profile);
    await db.mediators.put(mediator);
    const backup = await exportAllData();
    await deleteLocalData();
    await importAllData(backup);

    await expect(db.profile.toCollection().first()).resolves.toMatchObject({ id: 'profile_roundtrip', mediatorAvailable: true });
    await expect(db.mediators.toCollection().first()).resolves.toMatchObject({ id: 'mediator_profile_roundtrip', publicKey: profile.publicKey });
  });

  it('imports reviewed community lists only into the synced public cache', async () => {
    const privateKey = generateSecretKey();
    const publicKey = getPublicKey(privateKey);
    const list: CommunityCurationList = {
      id: 'curation_1',
      title: 'Public repair list',
      description: 'Reviewed public references.',
      authorPublicKey: publicKey,
      referencedCoordinates: ['30402:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:listing_1'],
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z'
    };
    const item = reviewItemFromEvent(signCommunityCurationList(list, bytesToHex(privateKey)), 'wss://relay.example');
    const payload = await importablePayloadFromReviewItem(item);
    const syncedList = syncedRecordFromReviewItem(item, [], payload) as SyncedPublicRecord<CommunityCurationList>;
    const backup = await exportAllData();
    await importAllData({
      ...backup,
      communityLists: [],
      syncedCommunityLists: [syncedList]
    });

    await expect(db.syncedCommunityLists.count()).resolves.toBe(1);
    await expect(db.communityLists.count()).resolves.toBe(0);
    await expect(db.listings.count()).resolves.toBe(0);
  });

  it('drops synced public cache backup rows that cannot be reverified from a raw event', async () => {
    const forged: SyncedPublicRecord<CommunityCurationList> = {
      id: 'synced_forged',
      eventId: 'event_forged',
      kind: 30004,
      authorPublicKey: 'f'.repeat(64),
      relayUrls: ['wss://relay.example'],
      receivedAt: '2026-05-31T00:00:00.000Z',
      importedAt: '2026-05-31T00:00:00.000Z',
      trusted: true,
      hidden: false,
      payload: {
        id: 'curation_forged',
        title: 'Forged public list',
        description: 'No signed raw event backs this cache row.',
        authorPublicKey: 'f'.repeat(64),
        referencedCoordinates: ['30402:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:listing_1'],
        createdAt: '2026-05-31T00:00:00.000Z',
        updatedAt: '2026-05-31T00:00:00.000Z'
      }
    };
    const backup = await exportAllData();

    await importAllData({ ...backup, syncedCommunityLists: [forged] });

    await expect(db.syncedCommunityLists.count()).resolves.toBe(0);
  });

  it('drops insecure relay URLs during backup import instead of failing the restore', async () => {
    const backup = await exportAllData();

    await importAllData({
      ...backup,
      relays: [{ url: 'ws://relay.example', enabled: true }]
    });

    const relays = await db.relays.toArray();
    expect(relays).not.toHaveLength(0);
    expect(relays.every((relay) => relay.url.startsWith('wss://'))).toBe(true);
  });

  it('exports and imports extension-backed identities without private key material', async () => {
    const identity: IdentityRecord = {
      id: 'identity_extension',
      displayName: 'Existing Nostr',
      publicKey: 'b'.repeat(64),
      keySource: 'nostr-extension',
      createdAt: '2026-06-02T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z'
    };

    await db.identity.put(identity);
    const backup = await exportAllData();
    await deleteLocalData();
    await importAllData(backup);

    await expect(db.identity.get('identity_extension')).resolves.toMatchObject({ keySource: 'nostr-extension', publicKey: 'b'.repeat(64) });
    expect(JSON.stringify(backup.identity)).not.toContain('encryptedPrivateKey');
  });

  it('exports and imports Lightning payment attempt metadata only', async () => {
    const attempt: LightningPaymentAttempt = {
      id: 'lightning_payment_roundtrip',
      buyerPublicKey: 'a'.repeat(64),
      sellerPublicKey: 'b'.repeat(64),
      listingId: 'listing_1',
      listingTitle: 'Coffee beans',
      amountSats: 21,
      amountMsats: 21000,
      lnurlSource: 'seller@example.com',
      callbackUrl: 'https://pay.example/callback',
      sellerWalletPubkey: 'c'.repeat(64),
      zapRequestId: 'zap_request_1',
      zapRequest: '{"kind":9734}',
      bolt11: 'lnbc1exampleinvoice',
      receiptRelayUrls: [],
      status: 'invoice-created',
      createdAt: '2026-06-12T00:00:00.000Z',
      updatedAt: '2026-06-12T00:00:00.000Z'
    };

    await db.lightningPaymentAttempts.put(attempt);
    const backup = await exportAllData();
    await deleteLocalData();
    await importAllData(backup);

    await expect(db.lightningPaymentAttempts.get('lightning_payment_roundtrip')).resolves.toMatchObject({
      amountSats: 21,
      bolt11: 'lnbc1exampleinvoice'
    });
    expect(JSON.stringify(backup.lightningPaymentAttempts)).not.toMatch(/preimage|seed|private trade/i);
  });

  it('keeps NWC wallet connections out of backups and backup imports', async () => {
    const connection: NwcConnection = {
      id: 'nwc_default',
      label: 'Test wallet',
      walletPublicKey: 'd'.repeat(64),
      clientPublicKey: 'e'.repeat(64),
      relayUrls: ['wss://wallet.example'],
      encryptedSecret: {
        ciphertext: 'encrypted-wallet-secret',
        iv: 'iv',
        salt: 'salt',
        iterations: 310000,
        algorithm: 'AES-GCM',
        kdf: 'PBKDF2-SHA-256'
      },
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:00.000Z'
    };

    await db.nwcConnections.put(connection);
    const backup = await exportAllData();

    expect(JSON.stringify(backup)).not.toContain('encrypted-wallet-secret');
    expect('nwcConnections' in backup).toBe(false);

    await importAllData(backup);
    await expect(db.nwcConnections.get('nwc_default')).resolves.toMatchObject({ walletPublicKey: 'd'.repeat(64) });
  });
});
