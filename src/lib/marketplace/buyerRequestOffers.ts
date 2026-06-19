import { z } from 'zod';
import type { Agreement, BuyerRequestOffer, ContactMethod, Listing, PaymentPreference } from '../../types/domain';

export const BUYER_REQUEST_OFFER_MARKER = 'AgoraMesh buyer-request-offer v1';

const publicKeySchema = z.string().regex(/^[0-9a-f]{64}$/i);
const paymentPreferenceSchema = z.enum(['cash', 'bank', 'bitcoin', 'lightning', 'cashu', 'monero', 'barter', 'mutual-credit', 'other']);
const contactMethodSchema = z.object({
  id: z.string().trim().min(1),
  kind: z.enum(['matrix', 'simplex', 'session', 'email', 'nostr', 'custom']),
  value: z.string().trim().min(1).max(500),
  note: z.string().trim().optional()
});

export const buyerRequestOfferPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('buyer-request-offer'),
  requestListingId: z.string().trim().min(1),
  requestCoordinate: z.string().trim().min(1),
  requestTitle: z.string().trim().min(1).max(120),
  buyerPublicKey: publicKeySchema,
  sellerPublicKey: publicKeySchema,
  amount: z.string().trim().min(1).max(80),
  currency: z.string().trim().min(1).max(16),
  fulfillmentNotes: z.string().trim().max(1000),
  timeline: z.string().trim().max(240),
  paymentPreferences: z.array(paymentPreferenceSchema).min(1),
  contactMethod: contactMethodSchema.optional(),
  message: z.string().trim().min(1).max(2000),
  createdAt: z.string().trim().min(1)
});

export type BuyerRequestOfferPayload = z.infer<typeof buyerRequestOfferPayloadSchema>;

export function buyerRequestOfferKey(offer: Pick<BuyerRequestOffer, 'requestCoordinate' | 'sellerPublicKey'>): string {
  return `${offer.requestCoordinate.toLowerCase()}::${offer.sellerPublicKey.toLowerCase()}`;
}

export function buyerRequestOfferPayloadMatches({
  payload,
  listing,
  requestCoordinate,
  senderPublicKey,
  buyerPublicKey
}: {
  payload: BuyerRequestOfferPayload;
  listing: Listing;
  requestCoordinate: string;
  senderPublicKey: string;
  buyerPublicKey: string;
}): boolean {
  return (
    listing.type === 'request' &&
    listing.id === payload.requestListingId &&
    requestCoordinate.toLowerCase() === payload.requestCoordinate.toLowerCase() &&
    listing.authorPublicKey.toLowerCase() === payload.buyerPublicKey.toLowerCase() &&
    buyerPublicKey.toLowerCase() === payload.buyerPublicKey.toLowerCase() &&
    senderPublicKey.toLowerCase() === payload.sellerPublicKey.toLowerCase()
  );
}

export function encodeBuyerRequestOfferMessage(payload: BuyerRequestOfferPayload): string {
  const lines = [
    `Offer for buyer request: ${payload.requestTitle}`,
    `Amount: ${payload.amount} ${payload.currency}`,
    `Timeline: ${payload.timeline}`,
    `Payment: ${payload.paymentPreferences.join(', ')}`,
    '',
    payload.fulfillmentNotes,
    '',
    payload.message,
    '',
    '---',
    BUYER_REQUEST_OFFER_MARKER,
    JSON.stringify(payload),
    '---'
  ];
  return lines.filter((line, index) => line || index < 4).join('\n');
}

export function parseBuyerRequestOfferPayload(plaintext: string): BuyerRequestOfferPayload | undefined {
  const markerIndex = plaintext.indexOf(BUYER_REQUEST_OFFER_MARKER);
  if (markerIndex === -1) return undefined;
  const afterMarker = plaintext.slice(markerIndex + BUYER_REQUEST_OFFER_MARKER.length);
  const jsonLine = afterMarker
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('{') && line.endsWith('}'));
  if (!jsonLine) return undefined;
  return buyerRequestOfferPayloadSchema.parse(JSON.parse(jsonLine));
}

export function buyerRequestOfferFromPayload({
  id,
  payload,
  direction,
  status,
  sourceEventIds,
  sourceReceiptId,
  sourceMessageId,
  updatedAt
}: {
  id: string;
  payload: BuyerRequestOfferPayload;
  direction: BuyerRequestOffer['direction'];
  status: BuyerRequestOffer['status'];
  sourceEventIds: string[];
  sourceReceiptId?: string;
  sourceMessageId?: string;
  updatedAt?: string;
}): BuyerRequestOffer {
  return {
    id,
    requestListingId: payload.requestListingId,
    requestCoordinate: payload.requestCoordinate,
    requestTitle: payload.requestTitle,
    buyerPublicKey: payload.buyerPublicKey.toLowerCase(),
    sellerPublicKey: payload.sellerPublicKey.toLowerCase(),
    amount: payload.amount,
    currency: payload.currency,
    fulfillmentNotes: payload.fulfillmentNotes,
    timeline: payload.timeline,
    paymentPreferences: payload.paymentPreferences as PaymentPreference[],
    contactMethod: payload.contactMethod as ContactMethod | undefined,
    message: payload.message,
    sourceEventIds,
    sourceReceiptId,
    sourceMessageId,
    direction,
    status,
    createdAt: payload.createdAt,
    updatedAt: updatedAt ?? payload.createdAt
  };
}

export function withSupersededBuyerRequestOffers(existing: BuyerRequestOffer[], incoming: BuyerRequestOffer): BuyerRequestOffer[] {
  const incomingKey = buyerRequestOfferKey(incoming);
  return [
    incoming,
    ...existing
      .filter((offer) => offer.id !== incoming.id)
      .map((offer) =>
        buyerRequestOfferKey(offer) === incomingKey && offer.status !== 'selected'
          ? { ...offer, status: 'superseded' as const, updatedAt: incoming.updatedAt }
          : offer
      )
  ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function activeBuyerRequestOffersForListing(offers: BuyerRequestOffer[], listing: Listing): BuyerRequestOffer[] {
  const latest = new Map<string, BuyerRequestOffer>();
  for (const offer of offers) {
    if (offer.requestListingId !== listing.id && !offer.requestCoordinate.endsWith(`:${listing.id}`)) continue;
    if (offer.status === 'superseded') continue;
    const key = buyerRequestOfferKey(offer);
    const current = latest.get(key);
    if (!current || offer.status === 'selected' || (current.status !== 'selected' && offer.createdAt.localeCompare(current.createdAt) > 0)) {
      latest.set(key, offer);
    }
  }
  return [...latest.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function agreementDraftFromBuyerRequestOffer({
  offer,
  listing,
  buyerLabel,
  sellerLabel,
  at
}: {
  offer: BuyerRequestOffer;
  listing: Listing;
  buyerLabel: string;
  sellerLabel: string;
  at: string;
}): Omit<Agreement, 'hash'> {
  return {
    id: `agreement_${offer.id}`,
    buyer: listing.authorPublicKey,
    seller: offer.sellerPublicKey,
    buyerPublicKey: listing.authorPublicKey,
    sellerPublicKey: offer.sellerPublicKey,
    buyerLabel,
    sellerLabel,
    listingId: listing.id,
    exchangeDescription: `${listing.title}\n\n${offer.message}`,
    priceAndPayment: `${offer.amount} ${offer.currency} · ${offer.paymentPreferences.join(', ')}`,
    fulfillmentTerms: [offer.fulfillmentNotes, offer.timeline].filter(Boolean).join('\n\n'),
    deadline: offer.timeline || listing.expiresAt,
    refundTerms: 'To be agreed before both parties sign.',
    mediator: listing.mediatorPreference,
    evidenceExpectations: 'Keep private messages, payment receipts, delivery notes, and any agreed proof of fulfillment.',
    buyerAccepted: false,
    sellerAccepted: false,
    hashVersion: 2,
    createdAt: at,
    updatedAt: at
  };
}
