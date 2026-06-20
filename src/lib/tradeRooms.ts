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
import { agreementAcceptanceReceiptSchema, agreementTermsPacketSchema, tradeRoomDeliverySchema } from './validation/schemas';

export const TRADE_ROOM_UPDATE_MARKER = 'AgoraMesh trade-room-update v1';
export const TRADE_ROOM_STATES: TradeRoomState[] = ['intent', 'offer', 'accepted', 'payment-pending', 'paid', 'delivered', 'confirmed', 'reviewed'];

const publicKeySchema = z.string().regex(/^[0-9a-f]{64}$/i);
const tradeRoomWorkflowPayloadActionSchema = z.enum([
  'agreement-created',
  'agreement-signed',
  'payment-claimed',
  'delivery-sent',
  'delivery-confirmed',
  'review-requested',
  'room-ack'
]);
const tradeRoomPaymentClaimSchema = z.object({
  id: z.string().trim().min(1),
  amountSats: z.number().int().positive().optional(),
  note: z.string().trim().max(1000).optional(),
  status: z.enum(['payment-pending', 'paid', 'receipt-found', 'failed'])
});
const tradeRoomDeliveryConfirmationSchema = z.object({
  deliveryId: z.string().trim().min(1),
  confirmedAt: z.string().trim().min(1),
  note: z.string().trim().max(1000).optional()
});
const tradeRoomReviewPromptSchema = z.object({
  subjectPublicKey: publicKeySchema,
  listingId: z.string().trim().optional(),
  agreementHash: z.string().regex(/^[0-9a-f]{64}$/i).optional()
});

export const tradeRoomUpdatePayloadSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('trade-room-update'),
  roomId: z.string().trim().min(1),
  senderPublicKey: publicKeySchema,
  workflowAction: tradeRoomWorkflowPayloadActionSchema.optional(),
  clientActionId: z.string().trim().min(1).optional(),
  ackEventId: z.string().trim().min(1).optional(),
  agreementHash: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
  listingId: z.string().trim().optional(),
  listingCoordinate: z.string().trim().optional(),
  state: z.enum(['intent', 'offer', 'accepted', 'payment-pending', 'paid', 'delivered', 'confirmed', 'reviewed']).optional(),
  paymentState: z.enum(['none', 'payment-pending', 'paid', 'receipt-found', 'failed']).optional(),
  deliveryState: z.enum(['none', 'in-progress', 'delivered', 'confirmed']).optional(),
  agreementPacket: agreementTermsPacketSchema.optional(),
  agreementReceipt: agreementAcceptanceReceiptSchema.optional(),
  paymentClaim: tradeRoomPaymentClaimSchema.optional(),
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
  deliveryConfirmation: tradeRoomDeliveryConfirmationSchema.optional(),
  reviewPrompt: tradeRoomReviewPromptSchema.optional(),
  createdAt: z.string().trim().min(1)
});

export type TradeRoomUpdatePayload = z.infer<typeof tradeRoomUpdatePayloadSchema>;
export type TradeRoomAcceptanceStatus = 'missing-agreement' | 'draft' | 'partially-signed' | 'mutually-signed';
export type TradeRoomDealNextAction =
  | 'create-agreement'
  | 'sign-agreement'
  | 'start-payment'
  | 'confirm-payment'
  | 'wait-payment'
  | 'send-delivery'
  | 'confirm-delivery'
  | 'wait-delivery'
  | 'write-review'
  | 'complete';
export type TradeRoomWorkflowAction =
  | 'create-agreement'
  | 'sign-agreement'
  | 'mark-payment-pending'
  | 'mark-paid'
  | 'wait-payment'
  | 'send-delivery'
  | 'confirm-delivery'
  | 'wait-delivery'
  | 'write-review'
  | 'complete';
export type TradeRoomWorkflowStep = 'intent' | 'offer' | 'agreement' | 'accepted' | 'payment' | 'delivery' | 'confirmed' | 'reviewed';
export type TradeRoomDealBlocker =
  | 'identity'
  | 'counterparty'
  | 'relays'
  | 'agreement'
  | 'acceptance'
  | 'payment'
  | 'delivery'
  | 'review';
export type TradeRoomSignalState = 'none' | 'claim' | 'receipt' | 'metadata';
export type TradeRoomDealSheet = {
  title: string;
  listingType?: Listing['type'];
  buyerPublicKey: string;
  sellerPublicKey: string;
  buyerLabel?: string;
  sellerLabel?: string;
  exchange: string;
  price: string;
  fulfillment: string;
  payment: string;
  mediator?: string;
  acceptanceStatus: TradeRoomAcceptanceStatus;
  paymentSignal: TradeRoomSignalState;
  deliverySignal: TradeRoomSignalState;
  reviewStatus: 'needed' | 'complete';
  nextAction: TradeRoomDealNextAction;
  blockers: TradeRoomDealBlocker[];
};
export type TradeRoomWorkflow = {
  step: TradeRoomWorkflowStep;
  primaryAction: TradeRoomWorkflowAction;
  secondaryActions: TradeRoomWorkflowAction[];
  blockers: TradeRoomDealBlocker[];
  canNotifyCounterparty: boolean;
  requiresMutualAcceptance: boolean;
};

function normalizeKey(value?: string): string {
  return value?.toLowerCase() ?? '';
}

function normalizedPublicKeyList(values?: string[]): string[] {
  return [...new Set((values ?? []).map((value) => value.toLowerCase()).filter(isTradeRoomPublicKey))];
}

function addParticipantSignal(room: TradeRoom, values: string[] | undefined, actorPublicKey?: string): string[] {
  const normalized = normalizedPublicKeyList(values);
  const actor = actorPublicKey?.toLowerCase();
  if (actor && (actor === room.buyerPublicKey.toLowerCase() || actor === room.sellerPublicKey.toLowerCase())) {
    normalized.push(actor);
  }
  return [...new Set(normalized)];
}

function hasBothParticipantSignals(room: TradeRoom, values?: string[]): boolean {
  const normalized = new Set(normalizedPublicKeyList(values));
  return normalized.has(room.buyerPublicKey.toLowerCase()) && normalized.has(room.sellerPublicKey.toLowerCase());
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
    paymentClaimedBy: existing?.paymentClaimedBy ?? [],
    deliveryClaimedBy: existing?.deliveryClaimedBy ?? [],
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
    paymentClaimedBy: [...new Set([...(existing.paymentClaimedBy ?? []), ...(incoming.paymentClaimedBy ?? [])])],
    deliveryClaimedBy: [...new Set([...(existing.deliveryClaimedBy ?? []), ...(incoming.deliveryClaimedBy ?? [])])],
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
    if (incoming.buyerRequestOfferId && room.buyerRequestOfferId === incoming.buyerRequestOfferId) return true;
    if (
      incoming.listingCoordinate &&
        room.listingCoordinate?.toLowerCase() === incoming.listingCoordinate.toLowerCase() &&
        room.buyerPublicKey.toLowerCase() === incoming.buyerPublicKey.toLowerCase() &&
        room.sellerPublicKey.toLowerCase() === incoming.sellerPublicKey.toLowerCase()
    ) {
      return true;
    }
    if (incoming.agreementHash && room.agreementHash === incoming.agreementHash) return true;
    return false;
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
    paymentClaimedBy: existing?.paymentClaimedBy ?? [],
    deliveryClaimedBy: existing?.deliveryClaimedBy ?? [],
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

export function stateForPayment(room: TradeRoom, paymentState: TradeRoomPaymentState, at = nowIso(), actorPublicKey?: string): TradeRoom {
  const paymentClaimedBy =
    paymentState === 'paid' || paymentState === 'receipt-found' ? addParticipantSignal(room, room.paymentClaimedBy, actorPublicKey) : normalizedPublicKeyList(room.paymentClaimedBy);
  const paymentComplete = paymentState === 'receipt-found' || hasBothParticipantSignals(room, paymentClaimedBy);
  const nextState: TradeRoomState =
    paymentComplete
      ? 'paid'
      : paymentState === 'payment-pending' || paymentState === 'paid'
        ? 'payment-pending'
        : room.state;
  const canAdvancePastIntent = TRADE_ROOM_STATES.indexOf(room.state) >= TRADE_ROOM_STATES.indexOf('accepted');
  return {
    ...room,
    paymentState,
    paymentClaimedBy,
    state: canAdvancePastIntent && TRADE_ROOM_STATES.indexOf(nextState) > TRADE_ROOM_STATES.indexOf(room.state) ? nextState : room.state,
    updatedAt: at
  };
}

export function stateForDelivery(room: TradeRoom, deliveryState: TradeRoomDeliveryState, at = nowIso(), actorPublicKey?: string): TradeRoom {
  const deliveryClaimedBy =
    deliveryState === 'delivered' || deliveryState === 'confirmed'
      ? addParticipantSignal(room, room.deliveryClaimedBy, actorPublicKey)
      : normalizedPublicKeyList(room.deliveryClaimedBy);
  const deliveryComplete = hasBothParticipantSignals(room, deliveryClaimedBy);
  const nextDeliveryState: TradeRoomDeliveryState = deliveryComplete ? 'confirmed' : deliveryState === 'confirmed' ? 'delivered' : deliveryState;
  const nextState: TradeRoomState = deliveryComplete ? 'confirmed' : nextDeliveryState === 'delivered' ? 'delivered' : room.state;
  const canAdvanceDelivery = TRADE_ROOM_STATES.indexOf(room.state) >= TRADE_ROOM_STATES.indexOf('paid');
  return {
    ...room,
    deliveryState: nextDeliveryState,
    deliveryClaimedBy,
    state: canAdvanceDelivery && TRADE_ROOM_STATES.indexOf(nextState) > TRADE_ROOM_STATES.indexOf(room.state) ? nextState : room.state,
    updatedAt: at
  };
}

export function tradeRoomFromPrivateUpdatePayload(payload: TradeRoomUpdatePayload, ownerPublicKey: string, senderPublicKey: string): TradeRoom | undefined {
  const sender = senderPublicKey.toLowerCase();
  const owner = ownerPublicKey.toLowerCase();
  if (!isTradeRoomPublicKey(sender) || !isTradeRoomPublicKey(owner) || payload.senderPublicKey.toLowerCase() !== sender) return undefined;
  const [, coordinateSeller] = payload.listingCoordinate?.split(':') ?? [];
  const sellerPublicKey = coordinateSeller?.toLowerCase();
  if (!isTradeRoomPublicKey(sellerPublicKey) || (sellerPublicKey !== sender && sellerPublicKey !== owner)) return undefined;
  const buyerPublicKey = sellerPublicKey === sender ? owner : sender;
  if (!isTradeRoomPublicKey(buyerPublicKey) || buyerPublicKey === sellerPublicKey) return undefined;
  const state: TradeRoomState = payload.state === 'offer' ? 'offer' : 'intent';
  return {
    id: payload.roomId,
    buyerPublicKey,
    sellerPublicKey,
    buyerLabel: buyerPublicKey.slice(0, 16),
    sellerLabel: sellerPublicKey.slice(0, 16),
    listingId: payload.listingId,
    listingCoordinate: payload.listingCoordinate,
    listingTitle: payload.listingId || payload.roomId,
    agreementHash: payload.agreementHash,
    state,
    paymentState: 'none',
    deliveryState: 'none',
    paymentClaimedBy: [],
    deliveryClaimedBy: [],
    relatedPaymentAttemptIds: [],
    relatedZapReceiptIds: [],
    relatedMessageThreadIds: [],
    createdAt: payload.createdAt,
    updatedAt: payload.createdAt
  };
}

function formatDealPrice(listing?: Listing, agreement?: Agreement, offer?: BuyerRequestOffer): string {
  if (agreement?.priceAndPayment) return agreement.priceAndPayment;
  if (offer) return `${offer.amount} ${offer.currency}`.trim();
  if (!listing) return '';
  if (listing.price.currency.toUpperCase() === 'FREE' || listing.price.amount === '0') return 'FREE';
  return `${listing.price.amount} ${listing.price.currency}`.trim();
}

function formatDealPayment(listing?: Listing, agreement?: Agreement, offer?: BuyerRequestOffer): string {
  if (agreement?.priceAndPayment) return agreement.priceAndPayment;
  if (offer?.paymentPreferences.length) return offer.paymentPreferences.join(', ');
  if (listing?.paymentPreferences.length) return listing.paymentPreferences.join(', ');
  return '';
}

function paymentSignalForRoom(room: TradeRoom, attempts: LightningPaymentAttempt[], receipts: ListingZapReceipt[]): TradeRoomSignalState {
  if (room.paymentState === 'receipt-found' || receipts.length > 0 || attempts.some((attempt) => attempt.status === 'receipt-found')) return 'receipt';
  if ((room.paymentClaimedBy?.length ?? 0) > 0 || room.paymentState === 'paid' || attempts.some((attempt) => attempt.status === 'paid')) return 'claim';
  return 'none';
}

function deliverySignalForRoom(room: TradeRoom, deliveries: TradeRoomDelivery[]): TradeRoomSignalState {
  if (deliveries.some((delivery) => delivery.status === 'sent' || delivery.status === 'received' || delivery.status === 'confirmed')) return 'metadata';
  if ((room.deliveryClaimedBy?.length ?? 0) > 0 || room.deliveryState === 'delivered' || room.deliveryState === 'confirmed') return 'claim';
  return 'none';
}

export function deriveTradeRoomDealSheet({
  room,
  listing,
  agreement,
  offer,
  receiptStatus,
  paymentAttempts = [],
  zapReceipts = [],
  deliveries = [],
  reviewExists = false,
  hasIdentity = false,
  hasCounterparty = false,
  enabledRelayCount = 0,
  actorPublicKey
}: {
  room: TradeRoom;
  listing?: Listing;
  agreement?: Agreement;
  offer?: BuyerRequestOffer;
  receiptStatus?: AgreementReceiptStatus;
  paymentAttempts?: LightningPaymentAttempt[];
  zapReceipts?: ListingZapReceipt[];
  deliveries?: TradeRoomDelivery[];
  reviewExists?: boolean;
  hasIdentity?: boolean;
  hasCounterparty?: boolean;
  enabledRelayCount?: number;
  actorPublicKey?: string;
}): TradeRoomDealSheet {
  const acceptanceStatus: TradeRoomAcceptanceStatus = agreement ? receiptStatus ?? 'draft' : 'missing-agreement';
  const accepted = acceptanceStatus === 'mutually-signed';
  const paymentSignal = paymentSignalForRoom(room, paymentAttempts, zapReceipts);
  const deliverySignal = deliverySignalForRoom(room, deliveries);
  const paymentComplete = paymentSignal === 'receipt' || hasBothParticipantSignals(room, room.paymentClaimedBy);
  const deliveryComplete = hasBothParticipantSignals(room, room.deliveryClaimedBy);
  const actor = actorPublicKey?.toLowerCase();
  const actorIsBuyer = Boolean(actor && actor === room.buyerPublicKey.toLowerCase());
  const actorHasPaymentSignal = Boolean(actor && normalizedPublicKeyList(room.paymentClaimedBy).includes(actor));
  const actorHasDeliverySignal = Boolean(actor && normalizedPublicKeyList(room.deliveryClaimedBy).includes(actor));
  const nextAction: TradeRoomDealNextAction =
    !agreement
      ? 'create-agreement'
      : !accepted
        ? 'sign-agreement'
        : !paymentComplete && paymentSignal === 'none' && (room.paymentState === 'none' || room.paymentState === 'failed')
          ? 'start-payment'
        : !paymentComplete
          ? actorHasPaymentSignal
            ? 'wait-payment'
            : 'confirm-payment'
        : deliverySignal === 'none'
          ? actorIsBuyer
            ? 'wait-delivery'
            : 'send-delivery'
          : !deliveryComplete
            ? actorHasDeliverySignal
              ? 'wait-delivery'
              : 'confirm-delivery'
            : !reviewExists
              ? 'write-review'
              : 'complete';
  const blockers: TradeRoomDealBlocker[] = [
    !hasIdentity ? 'identity' : undefined,
    !hasCounterparty ? 'counterparty' : undefined,
    enabledRelayCount === 0 ? 'relays' : undefined,
    !agreement ? 'agreement' : undefined,
    agreement && !accepted ? 'acceptance' : undefined,
    accepted && !paymentComplete ? 'payment' : undefined,
    paymentComplete && !deliveryComplete ? 'delivery' : undefined,
    deliveryComplete && !reviewExists ? 'review' : undefined
  ].filter((entry): entry is TradeRoomDealBlocker => Boolean(entry));
  return {
    title: room.listingTitle || listing?.title || agreement?.exchangeDescription || offer?.requestTitle || room.id,
    listingType: listing?.type,
    buyerPublicKey: room.buyerPublicKey,
    sellerPublicKey: room.sellerPublicKey,
    buyerLabel: room.buyerLabel,
    sellerLabel: room.sellerLabel,
    exchange: agreement?.exchangeDescription || offer?.fulfillmentNotes || listing?.description || '',
    price: formatDealPrice(listing, agreement, offer),
    fulfillment: agreement?.fulfillmentTerms || offer?.fulfillmentNotes || listing?.fulfillmentNotes || listing?.fulfillmentType || '',
    payment: formatDealPayment(listing, agreement, offer),
    mediator: room.mediator || agreement?.mediator || listing?.mediatorPreference,
    acceptanceStatus,
    paymentSignal,
    deliverySignal,
    reviewStatus: reviewExists || room.state === 'reviewed' ? 'complete' : 'needed',
    nextAction,
    blockers
  };
}

function workflowActionForNextAction(nextAction: TradeRoomDealNextAction): TradeRoomWorkflowAction {
  switch (nextAction) {
    case 'start-payment':
      return 'mark-payment-pending';
    case 'confirm-payment':
      return 'mark-paid';
    case 'wait-payment':
      return 'wait-payment';
    case 'wait-delivery':
      return 'wait-delivery';
    default:
      return nextAction;
  }
}

function workflowStepForDealSheet(dealSheet: TradeRoomDealSheet, room: TradeRoom): TradeRoomWorkflowStep {
  if (dealSheet.reviewStatus === 'complete' || room.state === 'reviewed') return 'reviewed';
  if (room.deliveryState === 'confirmed' || dealSheet.nextAction === 'write-review') return 'confirmed';
  if (room.deliveryState === 'delivered' || dealSheet.deliverySignal !== 'none' || dealSheet.nextAction === 'confirm-delivery') return 'delivery';
  if (room.paymentState === 'paid' || room.paymentState === 'receipt-found' || dealSheet.nextAction === 'send-delivery') return 'payment';
  if (room.paymentState === 'payment-pending' || dealSheet.nextAction === 'confirm-payment') return 'payment';
  if (dealSheet.acceptanceStatus === 'mutually-signed') return 'accepted';
  if (dealSheet.acceptanceStatus === 'draft' || dealSheet.acceptanceStatus === 'partially-signed' || dealSheet.acceptanceStatus === 'missing-agreement') return 'agreement';
  return room.state === 'offer' ? 'offer' : 'intent';
}

export function deriveTradeRoomWorkflow({
  room,
  dealSheet,
  hasIdentity = false,
  hasCounterparty = false,
  enabledRelayCount = 0
}: {
  room: TradeRoom;
  dealSheet: TradeRoomDealSheet;
  hasIdentity?: boolean;
  hasCounterparty?: boolean;
  enabledRelayCount?: number;
}): TradeRoomWorkflow {
  const primaryAction = workflowActionForNextAction(dealSheet.nextAction);
  const secondaryActions: TradeRoomWorkflowAction[] = primaryAction === 'mark-payment-pending' ? ['mark-paid'] : [];
  return {
    step: workflowStepForDealSheet(dealSheet, room),
    primaryAction,
    secondaryActions,
    blockers: dealSheet.blockers,
    canNotifyCounterparty: hasIdentity && hasCounterparty && enabledRelayCount > 0,
    requiresMutualAcceptance:
      dealSheet.acceptanceStatus !== 'mutually-signed' &&
      ['mark-payment-pending', 'mark-paid', 'send-delivery', 'confirm-delivery', 'write-review'].includes(primaryAction)
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
    payload.workflowAction ? `Action: ${payload.workflowAction}` : '',
    payload.state ? `State: ${payload.state}` : '',
    payload.paymentState ? `Payment: ${payload.paymentState}` : '',
    payload.deliveryState ? `Delivery: ${payload.deliveryState}` : '',
    payload.agreementPacket ? `Agreement: ${payload.agreementPacket.agreementHash}` : '',
    payload.agreementReceipt ? `Receipt: ${payload.agreementReceipt.role}` : '',
    payload.paymentClaim ? `Payment claim: ${payload.paymentClaim.status}` : '',
    payload.delivery ? `File: ${payload.delivery.fileName}` : '',
    payload.deliveryConfirmation ? `Delivery confirmed: ${payload.deliveryConfirmation.deliveryId}` : '',
    payload.reviewPrompt ? `Review prompt: ${payload.reviewPrompt.subjectPublicKey.slice(0, 12)}` : '',
    payload.ackEventId ? `Ack: ${payload.ackEventId}` : '',
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
    (!payload.agreementHash || !room.agreementHash || payload.agreementHash === room.agreementHash) &&
    (!payload.listingId || payload.listingId === room.listingId) &&
    (!payload.listingCoordinate || payload.listingCoordinate.toLowerCase() === room.listingCoordinate?.toLowerCase())
  );
}

export function applyTradeRoomUpdate(room: TradeRoom, payload: TradeRoomUpdatePayload, threadKey?: string, at = payload.createdAt, lastMessageAt?: string): TradeRoom {
  const payloadState = payload.state;
  const paymentState = payload.paymentState ?? payload.paymentClaim?.status ?? room.paymentState;
  const deliveryState = payload.deliveryState ?? (payload.deliveryConfirmation ? 'confirmed' : undefined) ?? room.deliveryState;
  const nextState =
    payloadState &&
    TRADE_ROOM_STATES.indexOf(payloadState) > TRADE_ROOM_STATES.indexOf(room.state) &&
    TRADE_ROOM_STATES.indexOf(payloadState) <= TRADE_ROOM_STATES.indexOf('offer')
      ? payloadState
      : room.state;
  const roomWithPayloadState = {
    ...room,
    state: nextState,
    relatedMessageThreadIds: threadKey ? [...new Set([...room.relatedMessageThreadIds, threadKey])] : room.relatedMessageThreadIds,
    lastMessageAt: lastMessageAt ?? room.lastMessageAt,
    updatedAt: at
  };
  const roomWithPayment =
    payload.paymentState || payload.paymentClaim ? stateForPayment(roomWithPayloadState, paymentState, at, payload.senderPublicKey) : roomWithPayloadState;
  return payload.deliveryState || payload.delivery || payload.deliveryConfirmation
    ? stateForDelivery(roomWithPayment, deliveryState, at, payload.senderPublicKey)
    : roomWithPayment;
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
