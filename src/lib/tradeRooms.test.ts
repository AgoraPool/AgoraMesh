import { describe, expect, it } from 'vitest';
import type { Agreement, AgreementAcceptanceReceipt, BuyerRequestOffer, Listing, LightningPaymentAttempt, ListingZapReceipt, TradeRoom, TradeRoomDelivery } from '../types/domain';
import { agreementTermsPacket } from './crypto/agreementReceipts';
import {
  applyAgreementReceiptStatus,
  applyTradeRoomUpdate,
  backfillTradeRoomsFromAgreements,
  deliveryFromUpdatePayload,
  derivePaymentState,
  deriveTradeRoomDealSheet,
  deriveTradeRoomWorkflow,
  encodeTradeRoomUpdateMessage,
  parseTradeRoomUpdatePayload,
  roomMatchesPrivateUpdate,
  stateForDelivery,
  stateForPayment,
  tradeRoomFromAgreement,
  tradeRoomFromPrivateTrade,
  tradeRoomFromSelectedOffer,
  tradeRoomListingCoordinate,
  tradeRoomMatchesPrivateTrade,
  upsertTradeRoom
} from './tradeRooms';

const buyer = 'a'.repeat(64);
const seller = 'b'.repeat(64);

function agreement(overrides: Partial<Agreement> = {}): Agreement {
  return {
    id: 'agreement_1',
    buyer,
    seller,
    buyerPublicKey: buyer,
    sellerPublicKey: seller,
    buyerLabel: 'Buyer',
    sellerLabel: 'Seller',
    listingId: 'listing_1',
    exchangeDescription: 'Repair laptop',
    priceAndPayment: '2100 CZK - lightning',
    fulfillmentTerms: 'Drop off locally',
    deadline: '2026-07-01',
    refundTerms: 'Mutual cancellation',
    mediator: '',
    evidenceExpectations: 'Keep receipts',
    buyerAccepted: false,
    sellerAccepted: false,
    hashVersion: 2,
    hash: 'c'.repeat(64),
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides
  };
}

function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: 'listing_1',
    authorPublicKey: buyer,
    title: 'Need laptop repaired',
    type: 'request',
    category: 'computer-repair',
    description: 'Broken hinge',
    region: 'Prague',
    status: 'active',
    price: { amount: '2100', currency: 'CZK' },
    paymentPreferences: ['lightning'],
    paymentIntents: [],
    images: [],
    barterAccepted: false,
    tags: [],
    expiresAt: '2026-07-01',
    contactMethod: { id: 'contact_1', kind: 'nostr', value: buyer },
    visibility: 'public',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides
  };
}

function offer(overrides: Partial<BuyerRequestOffer> = {}): BuyerRequestOffer {
  return {
    id: 'offer_1',
    requestListingId: 'listing_1',
    requestCoordinate: tradeRoomListingCoordinate(listing()),
    requestTitle: 'Need laptop repaired',
    buyerPublicKey: buyer,
    sellerPublicKey: seller,
    amount: '2100',
    currency: 'CZK',
    fulfillmentNotes: 'Can repair this week',
    timeline: 'Friday',
    paymentPreferences: ['lightning'],
    message: 'I can help.',
    sourceEventIds: ['event_1'],
    direction: 'incoming',
    status: 'selected',
    createdAt: '2026-06-01T01:00:00.000Z',
    updatedAt: '2026-06-01T01:00:00.000Z',
    selectedAt: '2026-06-01T01:00:00.000Z',
    ...overrides
  };
}

it('creates a room from an agreement and advances when mutually signed', () => {
  const room = tradeRoomFromAgreement(agreement());
  expect(room).toMatchObject({
    buyerPublicKey: buyer,
    sellerPublicKey: seller,
    listingId: 'listing_1',
    agreementHash: 'c'.repeat(64),
    state: 'intent'
  });
  expect(applyAgreementReceiptStatus(room, 'mutually-signed').state).toBe('accepted');
  expect(applyAgreementReceiptStatus(room, 'draft').state).toBe('intent');
});

describe('buyer request offer rooms', () => {
  it('preserves listing and offer links', () => {
    const room = tradeRoomFromSelectedOffer({
      offer: offer(),
      listing: listing(),
      agreement: agreement(),
      at: '2026-06-01T02:00:00.000Z'
    });
    expect(room).toMatchObject({
      buyerPublicKey: buyer,
      sellerPublicKey: seller,
      buyerRequestOfferId: 'offer_1',
      listingCoordinate: tradeRoomListingCoordinate(listing()),
      state: 'offer'
    });
  });
});

describe('room dedupe and agreement backfill', () => {
  it('skips legacy agreements without valid participant keys', () => {
    const rooms = backfillTradeRoomsFromAgreements(
      [agreement({ buyerPublicKey: '', sellerPublicKey: seller }), agreement()],
      [],
      [],
      () => 'draft'
    );
    expect(rooms).toHaveLength(1);
    expect(rooms[0].agreementHash).toBe('c'.repeat(64));
  });

  it('reuses one room for the same buyer, seller, and listing intent', () => {
    const first = tradeRoomFromPrivateTrade({
      listing: listing({ authorPublicKey: seller }),
      buyerPublicKey: buyer,
      at: '2026-06-01T01:00:00.000Z'
    });
    const second = tradeRoomFromPrivateTrade({
      listing: listing({ authorPublicKey: seller }),
      buyerPublicKey: buyer,
      at: '2026-06-01T02:00:00.000Z'
    });
    expect(tradeRoomMatchesPrivateTrade(first, listing({ authorPublicKey: seller }), buyer)).toBe(true);
    expect(upsertTradeRoom([first], second).id).toBe(first.id);
  });
});

describe('payment and delivery states', () => {
  const room: TradeRoom = tradeRoomFromAgreement(agreement());

  it('derives payment state from local attempts and zap receipts', () => {
    const attempt = { id: 'payment_1', status: 'invoice-created' } as LightningPaymentAttempt;
    expect(derivePaymentState([attempt], [])).toBe('payment-pending');
    expect(derivePaymentState([{ ...attempt, status: 'paid' } as LightningPaymentAttempt], [])).toBe('paid');
    expect(derivePaymentState([], [{ id: 'zap_1' } as ListingZapReceipt])).toBe('receipt-found');
  });

  it('advances the room state without moving backwards', () => {
    const pendingClaim = stateForPayment(room, 'payment-pending');
    expect(pendingClaim.state).toBe('intent');
    expect(pendingClaim.paymentState).toBe('payment-pending');
    const accepted = applyAgreementReceiptStatus(room, 'mutually-signed');
    expect(stateForPayment(accepted, 'payment-pending').state).toBe('payment-pending');
    const buyerPaid = stateForPayment(accepted, 'paid', '2026-06-01T03:00:00.000Z', buyer);
    expect(buyerPaid.state).toBe('payment-pending');
    expect(buyerPaid.paymentClaimedBy).toEqual([buyer]);
    expect(stateForPayment(buyerPaid, 'paid', '2026-06-01T03:03:00.000Z', 'd'.repeat(64)).paymentClaimedBy).toEqual([buyer]);
    const paid = stateForPayment(buyerPaid, 'paid', '2026-06-01T03:05:00.000Z', seller);
    expect(paid.state).toBe('paid');
    expect(paid.paymentClaimedBy?.sort()).toEqual([buyer, seller].sort());
    const sellerDelivered = stateForDelivery(paid, 'delivered', '2026-06-01T04:00:00.000Z', seller);
    expect(sellerDelivered.state).toBe('delivered');
    expect(sellerDelivered.deliveryState).toBe('delivered');
    const confirmed = stateForDelivery(sellerDelivered, 'confirmed', '2026-06-01T04:05:00.000Z', buyer);
    expect(confirmed.state).toBe('confirmed');
    expect(confirmed.deliveryState).toBe('confirmed');
  });
});

describe('deal sheet derivation', () => {
  it('derives the ordered voluntary trade workflow from room evidence', () => {
    const base = tradeRoomFromAgreement(agreement());
    const draftSheet = deriveTradeRoomDealSheet({
      room: base,
      listing: listing(),
      agreement: agreement(),
      receiptStatus: 'draft',
      hasIdentity: true,
      hasCounterparty: true,
      enabledRelayCount: 1
    });
    expect(draftSheet.nextAction).toBe('sign-agreement');
    expect(draftSheet.acceptanceStatus).toBe('draft');
    expect(draftSheet.blockers).toContain('acceptance');

    const accepted = applyAgreementReceiptStatus(base, 'mutually-signed');
    expect(
      deriveTradeRoomDealSheet({
        room: accepted,
        agreement: agreement(),
        receiptStatus: 'mutually-signed',
        hasIdentity: true,
        hasCounterparty: true,
        enabledRelayCount: 1
      }).nextAction
    ).toBe('start-payment');

    const buyerPaid = stateForPayment(accepted, 'paid', '2026-06-01T03:00:00.000Z', buyer);
    expect(
      deriveTradeRoomDealSheet({
        room: buyerPaid,
        agreement: agreement(),
        receiptStatus: 'mutually-signed',
        hasIdentity: true,
        hasCounterparty: true,
        enabledRelayCount: 1,
        actorPublicKey: seller
      }).nextAction
    ).toBe('confirm-payment');
    expect(
      deriveTradeRoomDealSheet({
        room: buyerPaid,
        agreement: agreement(),
        receiptStatus: 'mutually-signed',
        hasIdentity: true,
        hasCounterparty: true,
        enabledRelayCount: 1,
        actorPublicKey: buyer
      }).nextAction
    ).toBe('wait-payment');

    const paid = stateForPayment(buyerPaid, 'paid', '2026-06-01T03:05:00.000Z', seller);
    expect(
      deriveTradeRoomDealSheet({
        room: paid,
        agreement: agreement(),
        receiptStatus: 'mutually-signed',
        hasIdentity: true,
        hasCounterparty: true,
        enabledRelayCount: 1
      }).nextAction
    ).toBe('send-delivery');
    expect(
      deriveTradeRoomDealSheet({
        room: paid,
        agreement: agreement(),
        receiptStatus: 'mutually-signed',
        hasIdentity: true,
        hasCounterparty: true,
        enabledRelayCount: 1,
        actorPublicKey: buyer
      }).nextAction
    ).toBe('wait-delivery');

    const delivered = stateForDelivery(paid, 'delivered', '2026-06-01T04:00:00.000Z', seller);
    expect(
      deriveTradeRoomDealSheet({
        room: delivered,
        agreement: agreement(),
        receiptStatus: 'mutually-signed',
        deliveries: [
          {
            id: 'delivery_1',
            roomId: delivered.id,
            senderPublicKey: seller,
            fileName: 'proof.pdf',
            fileHash: 'sha256:abc',
            note: 'sent',
            status: 'sent',
            createdAt: '2026-06-01T04:00:00.000Z',
            updatedAt: '2026-06-01T04:00:00.000Z'
          } satisfies TradeRoomDelivery
        ],
        hasIdentity: true,
        hasCounterparty: true,
        enabledRelayCount: 1,
        actorPublicKey: buyer
      }).nextAction
    ).toBe('confirm-delivery');
    expect(
      deriveTradeRoomDealSheet({
        room: delivered,
        agreement: agreement(),
        receiptStatus: 'mutually-signed',
        deliveries: [
          {
            id: 'delivery_1',
            roomId: delivered.id,
            senderPublicKey: seller,
            fileName: 'proof.pdf',
            fileHash: 'sha256:abc',
            note: 'sent',
            status: 'sent',
            createdAt: '2026-06-01T04:00:00.000Z',
            updatedAt: '2026-06-01T04:00:00.000Z'
          } satisfies TradeRoomDelivery
        ],
        hasIdentity: true,
        hasCounterparty: true,
        enabledRelayCount: 1,
        actorPublicKey: seller
      }).nextAction
    ).toBe('wait-delivery');

    const confirmed = stateForDelivery(delivered, 'confirmed', '2026-06-01T04:05:00.000Z', buyer);
    expect(
      deriveTradeRoomDealSheet({
        room: confirmed,
        agreement: agreement(),
        receiptStatus: 'mutually-signed',
        reviewExists: false,
        hasIdentity: true,
        hasCounterparty: true,
        enabledRelayCount: 1
      }).nextAction
    ).toBe('write-review');
    expect(
      deriveTradeRoomDealSheet({
        room: confirmed,
        agreement: agreement(),
        receiptStatus: 'mutually-signed',
        reviewExists: true,
        hasIdentity: true,
        hasCounterparty: true,
        enabledRelayCount: 1
      }).nextAction
    ).toBe('complete');
  });

  it('maps selected buyer request offer terms into the deal sheet', () => {
    const room = tradeRoomFromSelectedOffer({ offer: offer(), listing: listing(), agreement: agreement(), at: '2026-06-01T02:00:00.000Z' });
    const sheet = deriveTradeRoomDealSheet({ room, listing: listing(), offer: offer(), hasIdentity: true, hasCounterparty: true, enabledRelayCount: 1 });
    expect(sheet.nextAction).toBe('create-agreement');
    expect(sheet.price).toBe('2100 CZK');
    expect(sheet.fulfillment).toContain('repair');
    expect(sheet.blockers).toContain('agreement');
  });

  it('derives cockpit workflow actions and sync capability', () => {
    const room = tradeRoomFromAgreement(agreement());
    const missingAgreement = deriveTradeRoomDealSheet({
      room,
      listing: listing(),
      hasIdentity: true,
      hasCounterparty: true,
      enabledRelayCount: 1
    });
    expect(
      deriveTradeRoomWorkflow({
        room,
        dealSheet: missingAgreement,
        hasIdentity: true,
        hasCounterparty: true,
        enabledRelayCount: 1
      })
    ).toMatchObject({
      step: 'agreement',
      primaryAction: 'create-agreement',
      canNotifyCounterparty: true
    });

    const accepted = applyAgreementReceiptStatus(room, 'mutually-signed');
    const acceptedSheet = deriveTradeRoomDealSheet({
      room: accepted,
      agreement: agreement(),
      receiptStatus: 'mutually-signed',
      hasIdentity: true,
      hasCounterparty: true,
      enabledRelayCount: 1
    });
    const acceptedWorkflow = deriveTradeRoomWorkflow({
      room: accepted,
      dealSheet: acceptedSheet,
      hasIdentity: true,
      hasCounterparty: true,
      enabledRelayCount: 1
    });
    expect(acceptedWorkflow.primaryAction).toBe('mark-payment-pending');
    expect(acceptedWorkflow.secondaryActions).toContain('mark-paid');

    const buyerPaid = stateForPayment(accepted, 'paid', '2026-06-01T03:00:00.000Z', buyer);
    const paid = stateForPayment(buyerPaid, 'paid', '2026-06-01T03:05:00.000Z', seller);
    const deliveryWorkflow = deriveTradeRoomWorkflow({
      room: paid,
      dealSheet: deriveTradeRoomDealSheet({
        room: paid,
        agreement: agreement(),
        receiptStatus: 'mutually-signed',
        hasIdentity: true,
        hasCounterparty: false,
        enabledRelayCount: 0
      })
    });
    expect(deliveryWorkflow.primaryAction).toBe('send-delivery');
    expect(deliveryWorkflow.canNotifyCounterparty).toBe(false);
  });
});

describe('private room payloads', () => {
  it('encodes and parses room updates with delivery metadata', () => {
    const encoded = encodeTradeRoomUpdateMessage({
      schemaVersion: 1,
      kind: 'trade-room-update',
      roomId: 'room_1',
      senderPublicKey: seller,
      listingId: 'listing_1',
      state: 'delivered',
      deliveryState: 'delivered',
      delivery: {
        id: 'delivery_1',
        fileName: 'receipt.pdf',
        fileHash: 'sha256:1234',
        note: 'Delivered file',
        url: 'https://example.com/receipt.pdf',
        status: 'sent'
      },
      createdAt: '2026-06-01T03:00:00.000Z'
    });
    const parsed = parseTradeRoomUpdatePayload(encoded);
    expect(parsed?.delivery?.fileName).toBe('receipt.pdf');
    expect(deliveryFromUpdatePayload(parsed!, 'room_1', 'message_1')).toMatchObject({
      roomId: 'room_1',
      sourceMessageId: 'message_1',
      status: 'sent'
    });
  });

  it('encodes and parses private agreement packets and receipts in room updates', () => {
    const baseAgreement = agreement();
    const packet = agreementTermsPacket(baseAgreement);
    const receipt: AgreementAcceptanceReceipt = {
      id: 'agreement_receipt_1',
      schemaVersion: 1,
      kind: 'agreement-acceptance-receipt',
      agreementHash: packet.agreementHash,
      role: 'buyer',
      signerPublicKey: buyer,
      acceptedAt: '2026-06-01T03:30:00.000Z',
      eventId: 'event_1',
      signature: 'signature'
    };
    const encoded = encodeTradeRoomUpdateMessage({
      schemaVersion: 1,
      kind: 'trade-room-update',
      roomId: 'room_1',
      senderPublicKey: buyer,
      agreementHash: packet.agreementHash,
      agreementPacket: packet,
      agreementReceipt: receipt,
      createdAt: '2026-06-01T03:30:00.000Z'
    });
    const parsed = parseTradeRoomUpdatePayload(encoded);
    expect(parsed?.agreementPacket?.agreementHash).toBe(packet.agreementHash);
    expect(parsed?.agreementReceipt?.id).toBe(receipt.id);
  });

  it('encodes and applies cockpit workflow payload fields', () => {
    const encoded = encodeTradeRoomUpdateMessage({
      schemaVersion: 1,
      kind: 'trade-room-update',
      roomId: 'room_1',
      senderPublicKey: seller,
      workflowAction: 'payment-claimed',
      clientActionId: 'action_1',
      ackEventId: 'event_ack',
      state: 'paid',
      paymentClaim: {
        id: 'payment_claim_1',
        amountSats: 21_000,
        note: 'Settled directly',
        status: 'paid'
      },
      deliveryConfirmation: {
        deliveryId: 'delivery_1',
        confirmedAt: '2026-06-01T04:00:00.000Z',
        note: 'Received'
      },
      reviewPrompt: {
        subjectPublicKey: seller,
        listingId: 'listing_1',
        agreementHash: 'c'.repeat(64)
      },
      createdAt: '2026-06-01T04:00:00.000Z'
    });
    const parsed = parseTradeRoomUpdatePayload(encoded);
    expect(parsed?.workflowAction).toBe('payment-claimed');
    expect(parsed?.paymentClaim?.status).toBe('paid');
    expect(parsed?.deliveryConfirmation?.deliveryId).toBe('delivery_1');
    expect(parsed?.reviewPrompt?.subjectPublicKey).toBe(seller);
    expect(parsed?.ackEventId).toBe('event_ack');

    const accepted = { ...applyAgreementReceiptStatus(tradeRoomFromAgreement(agreement()), 'mutually-signed'), id: 'room_1' };
    const next = applyTradeRoomUpdate(accepted, parsed!);
    expect(next.paymentState).toBe('paid');
    expect(next.paymentClaimedBy).toEqual([seller]);
    expect(next.deliveryState).toBe('delivered');
    expect(next.deliveryClaimedBy).toEqual([seller]);
    expect(next.state).toBe('payment-pending');
  });

  it('rejects wrong-room or wrong-sender updates', () => {
    const room = { ...tradeRoomFromAgreement(agreement()), id: 'room_1' };
    const payload = {
      schemaVersion: 1 as const,
      kind: 'trade-room-update' as const,
      roomId: 'room_1',
      senderPublicKey: seller,
      createdAt: '2026-06-01T03:00:00.000Z'
    };
    expect(roomMatchesPrivateUpdate(room, payload, seller, buyer)).toBe(true);
    expect(roomMatchesPrivateUpdate(room, { ...payload, roomId: 'room_2' }, seller, buyer)).toBe(false);
    expect(roomMatchesPrivateUpdate(room, payload, 'd'.repeat(64), buyer)).toBe(false);
  });

  it('ignores malformed private update blocks', () => {
    expect(parseTradeRoomUpdatePayload(`---\nAgoraMesh trade-room-update v1\n{"bad":true}\n---`)).toBeUndefined();
  });

  it('applies private updates without moving state backwards', () => {
    const room = { ...tradeRoomFromAgreement(agreement()), id: 'room_1', state: 'paid' as const };
    const next = applyTradeRoomUpdate(
      room,
      {
        schemaVersion: 1,
        kind: 'trade-room-update',
        roomId: 'room_1',
        senderPublicKey: seller,
        state: 'accepted',
        paymentState: 'receipt-found',
        createdAt: '2026-06-01T03:00:00.000Z'
      },
      'thread_1'
    );
    expect(next.state).toBe('paid');
    expect(next.paymentState).toBe('receipt-found');
    expect(next.relatedMessageThreadIds).toContain('thread_1');
  });

  it('keeps payment claims from advancing an unaccepted room', () => {
    const room = { ...tradeRoomFromAgreement(agreement()), id: 'room_1' };
    const next = applyTradeRoomUpdate(room, {
      schemaVersion: 1,
      kind: 'trade-room-update',
      roomId: 'room_1',
      senderPublicKey: seller,
      state: 'paid',
      paymentState: 'paid',
      createdAt: '2026-06-01T03:00:00.000Z'
    });
    expect(next.state).toBe('intent');
    expect(next.paymentState).toBe('paid');
    expect(next.paymentClaimedBy).toEqual([seller]);
  });
});
