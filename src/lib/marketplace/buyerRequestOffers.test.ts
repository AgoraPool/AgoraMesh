import { describe, expect, it } from 'vitest';
import type { BuyerRequestOffer, Listing } from '../../types/domain';
import {
  activeBuyerRequestOffersForListing,
  agreementDraftFromBuyerRequestOffer,
  buyerRequestOfferFromPayload,
  buyerRequestOfferPayloadMatches,
  encodeBuyerRequestOfferMessage,
  parseBuyerRequestOfferPayload,
  withSupersededBuyerRequestOffers,
  type BuyerRequestOfferPayload
} from './buyerRequestOffers';

const buyer = 'a'.repeat(64);
const seller = 'b'.repeat(64);
const other = 'c'.repeat(64);
const coordinate = `30402:${buyer}:request_1`;

const listing: Listing = {
  id: 'request_1',
  authorPublicKey: buyer,
  title: 'Need bicycle repair',
  type: 'request',
  category: 'repairs',
  description: 'Looking for help.',
  region: 'Brno',
  status: 'active',
  price: { amount: '1200', currency: 'CZK' },
  paymentPreferences: ['cash'],
  barterAccepted: false,
  tags: [],
  expiresAt: '2026-07-01',
  contactMethod: { id: 'contact_1', kind: 'nostr', value: buyer },
  visibility: 'public',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z'
};

function payload(overrides: Partial<BuyerRequestOfferPayload> = {}): BuyerRequestOfferPayload {
  return {
    schemaVersion: 1,
    kind: 'buyer-request-offer',
    requestListingId: listing.id,
    requestCoordinate: coordinate,
    requestTitle: listing.title,
    buyerPublicKey: buyer,
    sellerPublicKey: seller,
    amount: '900',
    currency: 'CZK',
    fulfillmentNotes: 'I can fix it near the station.',
    timeline: 'Friday afternoon',
    paymentPreferences: ['cash', 'lightning'],
    message: 'I have the parts and tools.',
    createdAt: '2026-06-02T00:00:00.000Z',
    ...overrides
  };
}

function offer(id: string, createdAt: string): BuyerRequestOffer {
  return buyerRequestOfferFromPayload({
    id,
    payload: payload({ createdAt }),
    direction: 'incoming',
    status: 'received',
    sourceEventIds: [`event_${id}`]
  });
}

describe('buyer request offer helpers', () => {
  it('encodes and parses private offer payloads', () => {
    const encoded = encodeBuyerRequestOfferMessage(payload());

    expect(encoded).toContain('AgoraMesh buyer-request-offer v1');
    expect(parseBuyerRequestOfferPayload(encoded)).toMatchObject({
      requestListingId: 'request_1',
      sellerPublicKey: seller,
      amount: '900'
    });
  });

  it('rejects malformed payload blocks and mismatched request context', () => {
    expect(() => parseBuyerRequestOfferPayload('AgoraMesh buyer-request-offer v1\n{bad json}\n---')).toThrow();
    expect(
      buyerRequestOfferPayloadMatches({
        payload: payload({ buyerPublicKey: other }),
        listing,
        requestCoordinate: coordinate,
        senderPublicKey: seller,
        buyerPublicKey: buyer
      })
    ).toBe(false);
    expect(
      buyerRequestOfferPayloadMatches({
        payload: payload({ requestCoordinate: `30402:${buyer}:other_request` }),
        listing,
        requestCoordinate: coordinate,
        senderPublicKey: seller,
        buyerPublicKey: buyer
      })
    ).toBe(false);
    expect(
      buyerRequestOfferPayloadMatches({
        payload: payload(),
        listing,
        requestCoordinate: coordinate,
        senderPublicKey: other,
        buyerPublicKey: buyer
      })
    ).toBe(false);
  });

  it('keeps the newest offer per seller/request active and marks older versions superseded', () => {
    const older = offer('older', '2026-06-02T00:00:00.000Z');
    const newer = offer('newer', '2026-06-03T00:00:00.000Z');
    const rows = withSupersededBuyerRequestOffers([older], newer);

    expect(rows.find((entry) => entry.id === 'older')).toMatchObject({ status: 'superseded' });
    expect(activeBuyerRequestOffersForListing(rows, listing)).toHaveLength(1);
    expect(activeBuyerRequestOffersForListing(rows, listing)[0]).toMatchObject({ id: 'newer' });
  });

  it('maps a selected offer into an agreement draft', () => {
    const draft = agreementDraftFromBuyerRequestOffer({
      offer: offer('selected', '2026-06-03T00:00:00.000Z'),
      listing,
      buyerLabel: 'Buyer',
      sellerLabel: 'Seller',
      at: '2026-06-04T00:00:00.000Z'
    });

    expect(draft).toMatchObject({
      buyerPublicKey: buyer,
      sellerPublicKey: seller,
      listingId: listing.id,
      priceAndPayment: '900 CZK · cash, lightning',
      deadline: 'Friday afternoon'
    });
  });
});
