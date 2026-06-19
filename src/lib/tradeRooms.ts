import { z } from 'zod';
import type {
  Agreement,
  AgreementReceiptStatus,
  BuyerRequestOffer,
  Listing,
  LightningPaymentAttempt,
  ListingZapReceipt,
  ReputationAttestation,
  TradeRoom,
  TradeRoomDelivery,
  TradeRoomDeliveryState,
  TradeRoomPaymentState,
  TradeRoomState
} from '../types/domain';
import { newId, nowIso } from './crypto/encoding';
import { generateAgreementHash } from './crypto/hash';
import { AGORAMESH_EVENT_KINDS, nostrCoordinate } from './nostr/events';
import { listingReviewMatches } from './reputation/summary';
import { tradeRoomDeliverySchema } from './validation/schemas';

export const TRADE_ROOM_UPDATE_MARKER = 'AgoraMesh trade-room-update v1';
export const TRADE_ROOM_STATES: TradeRoomState[] = ['intent', 'offer', 'accepted', 'payment-pending', 'paid', 'delivered', 'confirmed', 'reviewed'];

const publicKeySchema = z.string().regex(/^[0-9a-f]{64}$/i);

export const tradeRoomUpdatePayloadSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('trade-room-update'),
  roomId: z.string().trim().min(1),
  senderPublicKey: publicKeySchema,
  agreementHash: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
  listingId: z.string().trim().optional(),
  listingCoordinate: z.string().trim().optional(),
  state: z.enum(['intent', 'offer', 'accepted', 'payment-pending', 'paid', 'delivered', 'confirmed', 'reviewed']).optional(),
  paymentState: z.enum(['none', 'payment-pending', 'paid', 'receipt-found', 'failed']).optional(),
  deliveryState: z.enum(['none', 'in-progress', 'delivered', 'confirmed']).optional(),
  delivery: z
    .object({
      id: z.string().trim().min(1),
      fileName: z.string().trim().min(1).max(240),
      fileHash: z.string().trim().min(1).max(160),
      note: z.string().trim().max(1000),
      url: z
        .string()
        .url()
        .refine((value) => value.startsWith('https://'))
        .optional()
        .or(z.literal('')),
      status: z.enum(['draft', 'sent', 'received', 'confirmed'])
    })
    .optional(),
  createdAt: z.string().trim().min(1)
});

export type TradeRoomUpdatePayload = z.infer<typeof tradeRoomUpdatePayloadSchema>;

function normalizeKey(value?: string): string {
  return value?.toLowerCase() ?? '';
}

export function isTradeRoomPublicKey(value?: string): boolean {
  return publicKeySchema.safeParse(value).success;
}

function roomIdFromAgreementHash(hash: string): string {
  return `trade_room_${hash.slice(0, 32)}`;
}

export function tradeRoomIdForAgreement(agreement: Agreement): string {
  return roomIdFromAgreementHash(agreement.hash || generateAgreementHash(agreement));
}

export function agreementHasTradeRoomParties(agreement: Agreement): boolean {
  return isTradeRoomPublicKey(agreement.buyerPublicKey) && isTradeRoomPublicKey(agreement.sellerPublicKey);
}

function ensureAgreementRoomParties(agreement: Agreement): void {
  if (!agreementHasTradeRoomParties(agreement)) {
    throw new Error('Agreement is missing buyer or seller public key');
  }
}

export function tradeRoomListingCoordinate(listing: Listing): string {
  return nostrCoordinate(AGORAMESH_EVENT_KINDS.listing, listing.authorPublicKey, listing.id);
}

export function tradeRoomFromAgreement(agreement: Agreement, existing?: TradeRoom): TradeRoom {
  ensureAgreementRoomParties(agreement);
  const at = existing?.createdAt ?? agreement.createdAt ?? nowIso();
  const agreementHash = agreement.hash || generateAgreementHash(agreement);
  return {
    id: existing?.id ?? roomIdFromAgreementHash(agreementHash),
    buyerPublicKey: normalizeKey(agreement.buyerPublicKey),
    sellerPublicKey: normalizeKey(agreement.sellerPublicKey),
    buyerLabel: agreement.buyerLabel || agreement.buyer,
    sellerLabel: agreement.sellerLabel || agreement.seller,
    mediator: agreement.mediator,
    listingId: agreement.listingId,
    listingCoordinate: existing?.listingCoordinate,
    listingTitle: agreement.exchangeDescription.split('\n')[0] || agreement.listingId,
    agreementId: agreement.id,
    agreementHash,
    buyerRequestOfferId: existing?.buyerRequestOfferId,
    state: existing?.state ?? 'intent',
    paymentState: existing?.paymentState ?? 'none',
    deliveryState: existing?.deliveryState ?? 'none',
    relatedPaymentAttemptIds: existing?.relatedPaymentAttemptIds ?? [],
    relatedZapReceiptIds: existing?.relatedZapReceiptIds ?? [],
    relatedMessageThreadIds: existing?.relatedMessageThreadIds ?? [],
    lastMessageAt: existing?.lastMessageAt,
    reviewedAt: existing?.reviewedAt,
    createdAt: at,
    updatedAt: existing?.updatedAt ?? agreement.updatedAt ?? at
  };
}

export function tradeRoomMatchesAgreement(room: TradeRoom, agreement: Agreement): boolean {
  const agreementHash = agreement.hash || generateAgreementHash(agreement);
  const buyerPublicKey = agreement.buyerPublicKey;
  const sellerPublicKey = agreement.sellerPublicKey;
  const hasParticipantKeys = isTradeRoomPublicKey(buyerPublicKey) && isTradeRoomPublicKey(sellerPublicKey);
  return Boolean(
    (room.agreementHash && room.agreementHash === agreementHash) ||
      (room.agreementId && room.agreementId === agreement.id) ||
      (room.listingId &&
        room.listingId === agreement.listingId &&
        hasParticipantKeys &&
        room.buyerPublicKey.toLowerCase() === buyerPublicKey?.toLowerCase() &&
        room.sellerPublicKey.toLowerCase() === sellerPublicKey?.toLowerCase())
  );
}

export function tradeRoomMatchesSelectedOffer(room: TradeRoom, offer: BuyerRequestOffer, listing?: Listing): boolean {
  const listingCoordinate = listing ? tradeRoomListingCoordinate(listing) : offer.requestCoordinate;
  return Boolean(
    (room.buyerRequestOfferId && room.buyerRequestOfferId === offer.id) ||
      (room.listingCoordinate &&
        room.listingCoordinate.toLowerCase() === listingCoordinate.toLowerCase() &&
        room.buyerPublicKey.toLowerCase() === offer.buyerPublicKey.toLowerCase() &&
        room.sellerPublicKey.toLowerCase() === offer.sellerPublicKey.toLowerCase())
  );
}

export function tradeRoomMatchesPrivateTrade(room: TradeRoom, listing: Listing, buyerPublicKey: string): boolean {
  const listingCoordinate = tradeRoomListingCoordinate(listing).toLowerCase();
  return Boolean(
    room.listingCoordinate?.toLowerCase() === listingCoordinate &&
      room.buyerPublicKey.toLowerCase() === buyerPublicKey.toLowerCase() &&
      room.sellerPublicKey.toLowerCase() === listing.authorPublicKey.toLowerCase() &&
      !room.buyerRequestOfferId
  );
}

export function mergeTradeRoom(existing: TradeRoom | undefined, incoming: TradeRoom, at = incoming.updatedAt): TradeRoom {
  if (!existing) return incoming;
  return {
    ...incoming,
    id: existing.id,
    createdAt: existing.createdAt,
    state: TRADE_ROOM_STATES.indexOf(existing.state) > TRADE_ROOM_STATES.indexOf(incoming.state) ? existing.state : incoming.state,
    paymentState: incoming.paymentState === 'none' ? existing.paymentState : incoming.paymentState,
    deliveryState: incoming.deliveryState === 'none' ? existing.deliveryState : incoming.deliveryState,
    relatedPaymentAttemptIds: [...new Set([...existing.relatedPaymentAttemptIds, ...incoming.relatedPaymentAttemptIds])],
    relatedZapReceiptIds: [...new Set([...existing.relatedZapReceiptIds, ...incoming.relatedZapReceiptIds])],
    relatedMessageThreadIds: [...new Set([...existing.relatedMessageThreadIds, ...incoming.relatedMessageThreadIds])],
    lastMessageAt: incoming.lastMessageAt ?? existing.lastMessageAt,
    reviewedAt: incoming.reviewedAt ?? existing.reviewedAt,
    updatedAt: at
  };
}

export function upsertTradeRoom(existingRooms: TradeRoom[], incoming: TradeRoom): TradeRoom {
  const existing = existingRooms.find((room) => {
    if (incoming.agreementHash && room.agreementHash === incoming.agreementHash) return true;
    if (incoming.buyerRequestOfferId && room.buyerRequestOfferId === incoming.buyerRequestOfferId) return true;
    return Boolean(
      incoming.listingCoordinate &&
        room.listingCoordinate?.toLowerCase() === incoming.listingCoordinate.toLowerCase() &&
        room.buyerPublicKey.toLowerCase() === incoming.buyerPublicKey.toLowerCase() &&
        room.sellerPublicKey.toLowerCase() === incoming.sellerPublicKey.toLowerCase()
    );
  });
  return mergeTradeRoom(existing, incoming);
}

export function backfillTradeRoomsFromAgreements<ReceiptRow extends { agreementHash: string }>(
  agreements: Agreement[],
  receipts: ReceiptRow[],
  existingRooms: TradeRoom[],
  statusForAgreement: (agreement: Agreement, receipts: ReceiptRow[]) => AgreementReceiptStatus
): TradeRoom[] {
  const nextRooms = [...existingRooms];
  for (const agreement of agreements) {
    if (!agreementHasTradeRoomParties(agreement)) continue;
    if (nextRooms.some((room) => tradeRoomMatchesAgreement(room, agreement))) continue;
    const room = applyAgreementReceiptStatus(tradeRoomFromAgreement(agreement), statusForAgreement(agreement, receipts));
    nextRooms.push(room);
  }
  return nextRooms.filter((room) => !existingRooms.some((existing) => existing.id === room.id));
}

export function tradeRoomFromSelectedOffer({
  offer,
  listing,
  agreement,
  existing,
  at
}: {
  offer: BuyerRequestOffer;
  listing: Listing;
  agreement: Agreement;
  existing?: TradeRoom;
  at: string;
}): TradeRoom {
  return {
    ...tradeRoomFromAgreement(agreement, existing),
    buyerPublicKey: listing.authorPublicKey.toLowerCase(),
    sellerPublicKey: offer.sellerPublicKey.toLowerCase(),
    buyerLabel: existing?.buyerLabel ?? listing.authorPublicKey.slice(0, 16),
    sellerLabel: existing?.sellerLabel ?? offer.sellerPublicKey.slice(0, 16),
    listingId: listing.id,
    listingCoordinate: tradeRoomListingCoordinate(listing),
    listingTitle: listing.title,
    buyerRequestOfferId: offer.id,
    state: existing?.state ?? 'offer',
    createdAt: existing?.createdAt ?? at,
    updatedAt: at
  };
}

export function tradeRoomFromPrivateTrade({
  listing,
  buyerPublicKey,
  buyerLabel,
  existing,
  at
}: {
  listing: Listing;
  buyerPublicKey: string;
  buyerLabel?: string;
  existing?: TradeRoom;
  at: string;
}): TradeRoom {
  return {
    id: existing?.id ?? `trade_room_${listing.id}_${buyerPublicKey.slice(0, 12)}`.replace(/[^a-zA-Z0-9_]/g, '_'),
    buyerPublicKey: buyerPublicKey.toLowerCase(),
    sellerPublicKey: listing.authorPublicKey.toLowerCase(),
    buyerLabel,
    sellerLabel: listing.authorPublicKey.slice(0, 16),
    mediator: listing.mediatorPreference,
    listingId: listing.id,
    listingCoordinate: tradeRoomListingCoordinate(listing),
    listingTitle: listing.title,
    agreementId: existing?.agreementId,
    agreementHash: existing?.agreementHash,
    buyerRequestOfferId: existing?.buyerRequestOfferId,
    state: existing?.state ?? 'intent',
    paymentState: existing?.paymentState ?? 'none',
    deliveryState: existing?.deliveryState ?? 'none',
    relatedPaymentAttemptIds: existing?.relatedPaymentAttemptIds ?? [],
    relatedZapReceiptIds: existing?.relatedZapReceiptIds ?? [],
    relatedMessageThreadIds: existing?.relatedMessageThreadIds ?? [],
    lastMessageAt: existing?.lastMessageAt,
    reviewedAt: existing?.reviewedAt,
    createdAt: existing?.createdAt ?? at,
    updatedAt: at
  };
}

export function applyAgreementReceiptStatus(room: TradeRoom, status: AgreementReceiptStatus, at = nowIso()): TradeRoom {
  if (status !== 'mutually-signed' || TRADE_ROOM_STATES.indexOf(room.state) >= TRADE_ROOM_STATES.indexOf('accepted')) return room;
  return { ...room, state: 'accepted', updatedAt: at };
}

export function derivePaymentState(attempts: LightningPaymentAttempt[], receipts: ListingZapReceipt[]): TradeRoomPaymentState {
  if (receipts.length > 0 || attempts.some((attempt) => attempt.status === 'receipt-found')) return 'receipt-found';
  if (attempts.some((attempt) => attempt.status === 'paid')) return 'paid';
  if (attempts.some((attempt) => attempt.status === 'failed')) return 'failed';
  if (attempts.some((attempt) => attempt.status === 'invoice-created' || attempt.status === 'wallet-payment-pending')) return 'payment-pending';
  return 'none';
}

export function stateForPayment(room: TradeRoom, paymentState: TradeRoomPaymentState, at = nowIso()): TradeRoom {
  const nextState: TradeRoomState =
    paymentState === 'receipt-found' || paymentState === 'paid'
      ? 'paid'
      : paymentState === 'payment-pending'
        ? 'payment-pending'
        : room.state;
  return {
    ...room,
    paymentState,
    state: TRADE_ROOM_STATES.indexOf(nextState) > TRADE_ROOM_STATES.indexOf(room.state) ? nextState : room.state,
    updatedAt: at
  };
}

export function stateForDelivery(room: TradeRoom, deliveryState: TradeRoomDeliveryState, at = nowIso()): TradeRoom {
  const nextState: TradeRoomState = deliveryState === 'confirmed' ? 'confirmed' : deliveryState === 'delivered' ? 'delivered' : room.state;
  return {
    ...room,
    deliveryState,
    state: TRADE_ROOM_STATES.indexOf(nextState) > TRADE_ROOM_STATES.indexOf(room.state) ? nextState : room.state,
    updatedAt: at
  };
}

export function markRoomReviewed(room: TradeRoom, attestations: ReputationAttestation[], at = nowIso()): TradeRoom {
  if (!room.listingId && !room.listingCoordinate && !room.agreementHash) return room;
  const reviewed = attestations.some((attestation) => {
    if (room.agreementHash && attestation.agreementHash === room.agreementHash) return true;
    if (!room.listingId || !room.sellerPublicKey) return false;
    return listingReviewMatches(
      {
        id: room.listingId,
        authorPublicKey: room.sellerPublicKey
      } as Listing,
      attestation
    );
  });
  return reviewed ? { ...room, state: 'reviewed', reviewedAt: room.reviewedAt ?? at, updatedAt: at } : room;
}

export function deliveryFromUpdatePayload(payload: TradeRoomUpdatePayload, roomId = payload.roomId, sourceMessageId?: string): TradeRoomDelivery | undefined {
  if (!payload.delivery) return undefined;
  return tradeRoomDeliverySchema.parse({
    id: payload.delivery.id,
    roomId,
    senderPublicKey: payload.senderPublicKey.toLowerCase(),
    fileName: payload.delivery.fileName,
    fileHash: payload.delivery.fileHash,
    note: payload.delivery.note,
    url: payload.delivery.url || undefined,
    sourceMessageId,
    status: payload.delivery.status,
    createdAt: payload.createdAt,
    updatedAt: payload.createdAt
  });
}

export function encodeTradeRoomUpdateMessage(payload: TradeRoomUpdatePayload): string {
  const lines = [
    `Trade room update: ${payload.roomId}`,
    payload.state ? `State: ${payload.state}` : '',
    payload.paymentState ? `Payment: ${payload.paymentState}` : '',
    payload.deliveryState ? `Delivery: ${payload.deliveryState}` : '',
    payload.delivery ? `File: ${payload.delivery.fileName}` : '',
    '',
    '---',
    TRADE_ROOM_UPDATE_MARKER,
    JSON.stringify(tradeRoomUpdatePayloadSchema.parse(payload)),
    '---'
  ];
  return lines.filter(Boolean).join('\n');
}

export function parseTradeRoomUpdatePayload(plaintext: string): TradeRoomUpdatePayload | undefined {
  const markerIndex = plaintext.indexOf(TRADE_ROOM_UPDATE_MARKER);
  if (markerIndex === -1) return undefined;
  const afterMarker = plaintext.slice(markerIndex + TRADE_ROOM_UPDATE_MARKER.length);
  const jsonLine = afterMarker
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('{') && line.endsWith('}'));
  if (!jsonLine) return undefined;
  try {
    return tradeRoomUpdatePayloadSchema.parse(JSON.parse(jsonLine));
  } catch {
    return undefined;
  }
}

export function roomMatchesPrivateUpdate(room: TradeRoom, payload: TradeRoomUpdatePayload, senderPublicKey: string, ownerPublicKey: string): boolean {
  const sender = senderPublicKey.toLowerCase();
  const owner = ownerPublicKey.toLowerCase();
  const participants = [room.buyerPublicKey.toLowerCase(), room.sellerPublicKey.toLowerCase()];
  return (
    room.id === payload.roomId &&
    payload.senderPublicKey.toLowerCase() === sender &&
    participants.includes(sender) &&
    participants.includes(owner) &&
    (!payload.agreementHash || payload.agreementHash === room.agreementHash) &&
    (!payload.listingId || payload.listingId === room.listingId) &&
    (!payload.listingCoordinate || payload.listingCoordinate.toLowerCase() === room.listingCoordinate?.toLowerCase())
  );
}

export function applyTradeRoomUpdate(room: TradeRoom, payload: TradeRoomUpdatePayload, threadKey?: string, at = payload.createdAt, lastMessageAt?: string): TradeRoom {
  return {
    ...room,
    state: payload.state && TRADE_ROOM_STATES.indexOf(payload.state) > TRADE_ROOM_STATES.indexOf(room.state) ? payload.state : room.state,
    paymentState: payload.paymentState ?? room.paymentState,
    deliveryState: payload.deliveryState ?? room.deliveryState,
    relatedMessageThreadIds: threadKey ? [...new Set([...room.relatedMessageThreadIds, threadKey])] : room.relatedMessageThreadIds,
    lastMessageAt: lastMessageAt ?? room.lastMessageAt,
    updatedAt: at
  };
}

export function newDeliveryDraft(roomId: string, senderPublicKey: string): TradeRoomDelivery {
  const at = nowIso();
  return {
    id: newId('trade_delivery'),
    roomId,
    senderPublicKey: senderPublicKey.toLowerCase(),
    fileName: '',
    fileHash: '',
    note: '',
    status: 'draft',
    createdAt: at,
    updatedAt: at
  };
}
