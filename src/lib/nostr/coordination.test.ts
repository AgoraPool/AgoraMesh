import { describe, expect, it } from 'vitest';
import { encodeBuyerRequestOfferMessage } from '../marketplace/buyerRequestOffers';
import { encodeTradeRoomUpdateMessage } from '../tradeRooms';
import type { NostrContactReceipt, NostrInboxCursor, NostrMessageRecord, RelayConfig, TradeRoom } from '../../types/domain';
import {
  coordinationReceiptStatus,
  deriveTradeRoomCoordinationStatus,
  selectNostrCoordinationRelays,
  summarizeNostrCoordinationPayload
} from './coordination';

const buyer = 'a'.repeat(64);
const seller = 'b'.repeat(64);

function room(overrides: Partial<TradeRoom> = {}): TradeRoom {
  return {
    id: 'room_1',
    buyerPublicKey: buyer,
    sellerPublicKey: seller,
    listingId: 'listing_1',
    listingCoordinate: `30402:${seller}:listing_1`,
    listingTitle: 'Listing',
    state: 'offer',
    paymentState: 'none',
    deliveryState: 'none',
    relatedPaymentAttemptIds: [],
    relatedZapReceiptIds: [],
    relatedMessageThreadIds: [],
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides
  };
}

function message(overrides: Partial<NostrMessageRecord> = {}): NostrMessageRecord {
  return {
    id: 'message_1',
    ownerPublicKey: buyer,
    eventId: 'event_1',
    wrapPublicKey: 'c'.repeat(64),
    senderPublicKey: seller,
    recipientPublicKey: buyer,
    counterpartPublicKey: seller,
    direction: 'incoming',
    threadKey: 'thread_1',
    contextType: 'trade-room',
    contextId: 'room_1',
    wrapCreatedAt: '2026-06-01T00:00:00.000Z',
    messageCreatedAt: '2026-06-01T00:00:00.000Z',
    receivedAt: '2026-06-01T00:00:00.000Z',
    relayUrls: ['wss://relay.example'],
    rawEvent: '{}',
    encryptedPlaintext: {
      ciphertext: '',
      iv: '',
      salt: '',
      iterations: 1,
      algorithm: 'AES-GCM',
      kdf: 'PBKDF2-SHA-256'
    },
    read: false,
    archived: false,
    ...overrides
  };
}

function receipt(overrides: Partial<NostrContactReceipt> = {}): NostrContactReceipt {
  return {
    id: 'receipt_1',
    senderPublicKey: buyer,
    recipientPublicKey: seller,
    recipientNpub: 'npub1test',
    contextType: 'trade-room',
    contextId: 'room_1',
    contextTitle: 'Listing',
    eventIds: ['event_1'],
    relayReceipts: [{ relay: 'wss://relay.example', ok: true, message: 'ok', at: '2026-06-01T00:00:00.000Z' }],
    status: 'accepted',
    sentAt: '2026-06-01T00:00:00.000Z',
    ...overrides
  };
}

function cursor(overrides: Partial<NostrInboxCursor> = {}): NostrInboxCursor {
  return {
    id: 'cursor_1',
    ownerPublicKey: buyer,
    relayUrl: 'wss://relay.example',
    since: 1,
    newestCreatedAt: 2,
    lastFetchedAt: '2026-06-01T00:00:00.000Z',
    ...overrides
  };
}

describe('Nostr coordination helpers', () => {
  it('summarizes buyer-request offer and trade-room payload blocks', () => {
    const offerSummary = summarizeNostrCoordinationPayload(
      encodeBuyerRequestOfferMessage({
        schemaVersion: 1,
        kind: 'buyer-request-offer',
        requestListingId: 'request_1',
        requestCoordinate: `30402:${buyer}:request_1`,
        requestTitle: 'Need repair',
        buyerPublicKey: buyer,
        sellerPublicKey: seller,
        amount: '1000',
        currency: 'CZK',
        fulfillmentNotes: 'Friday',
        timeline: 'This week',
        paymentPreferences: ['lightning'],
        message: 'I can help.',
        createdAt: '2026-06-01T00:00:00.000Z'
      })
    );
    expect(offerSummary).toMatchObject({ kind: 'buyer-request-offer', requestListingId: 'request_1', sellerPublicKey: seller });

    const updateSummary = summarizeNostrCoordinationPayload(
      encodeTradeRoomUpdateMessage({
        schemaVersion: 1,
        kind: 'trade-room-update',
        roomId: 'room_1',
        senderPublicKey: buyer,
        state: 'paid',
        paymentState: 'paid',
        createdAt: '2026-06-01T00:00:00.000Z'
      })
    );
    expect(updateSummary).toMatchObject({ kind: 'trade-room-update', roomId: 'room_1', state: 'paid', paymentState: 'paid' });
    expect(summarizeNostrCoordinationPayload('ordinary private message')).toEqual({ kind: 'message' });
  });

  it('selects enabled relays and valid websocket hints without duplicates', () => {
    const relays: RelayConfig[] = [
      { url: 'wss://relay.example', enabled: true },
      { url: 'wss://disabled.example', enabled: false }
    ];
    expect(selectNostrCoordinationRelays(relays, ['wss://relay.example', 'wss://hint.example', 'https://bad.example']).map((entry) => entry.url)).toEqual([
      'wss://relay.example',
      'wss://hint.example'
    ]);
  });

  it('derives room coordination status from receipts, messages, cursors, and live state', () => {
    expect(deriveTradeRoomCoordinationStatus({ room: room(), receipts: [], messages: [], cursors: [] })).toBe('needs-fetch');
    expect(deriveTradeRoomCoordinationStatus({ room: room(), receipts: [], messages: [], cursors: [cursor()] })).toBe('not-acknowledged');
    expect(deriveTradeRoomCoordinationStatus({ room: room(), receipts: [receipt()], messages: [], cursors: [] })).toBe('sent');
    expect(deriveTradeRoomCoordinationStatus({ room: room(), receipts: [], messages: [message()], cursors: [] })).toBe('received');
    expect(
      deriveTradeRoomCoordinationStatus({
        room: room(),
        receipts: [receipt()],
        messages: [message(), message({ id: 'message_2', direction: 'outgoing', senderPublicKey: buyer, recipientPublicKey: seller })],
        cursors: []
      })
    ).toBe('synced');
    expect(deriveTradeRoomCoordinationStatus({ room: room(), receipts: [receipt({ status: 'failed' })], messages: [], cursors: [] })).toBe('failed');
    expect(
      deriveTradeRoomCoordinationStatus({
        room: room(),
        receipts: [],
        messages: [],
        cursors: [],
        liveState: { status: 'listening', relays: 1, imported: 0, duplicates: 0, failed: 0 }
      })
    ).toBe('not-acknowledged');
  });

  it('summarizes relay receipt status for retry diagnostics', () => {
    expect(coordinationReceiptStatus([])).toBe('failed');
    expect(coordinationReceiptStatus([{ relay: 'wss://relay.example', ok: true, message: 'ok', at: '2026-06-01T00:00:00.000Z' }])).toBe('accepted');
    expect(
      coordinationReceiptStatus([
        { relay: 'wss://relay.example', ok: true, message: 'ok', at: '2026-06-01T00:00:00.000Z' },
        { relay: 'wss://other.example', ok: false, message: 'failed', at: '2026-06-01T00:00:00.000Z' }
      ])
    ).toBe('partial');
  });
});
