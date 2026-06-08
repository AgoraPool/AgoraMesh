import { listingSchema, assertPeacefulListingText } from '../../lib/validation/schemas';
import type { Listing } from '../../types/domain';

const listing: Listing = {
  id: 'listing_1',
  authorPublicKey: 'a'.repeat(64),
  title: 'Repair a laptop',
  type: 'offer',
  category: 'computer-repair',
  description: 'Peaceful repair work in a public place.',
  region: 'Prague',
  status: 'active',
  price: { amount: '500', currency: 'CZK' },
  paymentPreferences: ['cash', 'bitcoin'],
  barterAccepted: true,
  tags: ['repair'],
  expiresAt: '2026-06-30',
  contactMethod: { id: 'contact_1', kind: 'matrix', value: '@alice:matrix.org' },
  visibility: 'public',
  createdAt: '2026-05-31T00:00:00.000Z',
  updatedAt: '2026-05-31T00:00:00.000Z'
};

describe('listing validation', () => {
  it('accepts peaceful MVP listing data', () => {
    expect(listingSchema.parse(listing).title).toBe('Repair a laptop');
  });

  it('defaults NIP-99 fields for legacy local listings', () => {
    const legacyListing: Partial<Listing> = { ...listing };
    delete legacyListing.status;
    delete legacyListing.price;

    expect(listingSchema.parse(legacyListing)).toMatchObject({
      status: 'active',
      price: { amount: '0', currency: 'FREE' }
    });
  });

  it('accepts valid public image metadata and legacy listings without images', () => {
    expect(listingSchema.parse({ ...listing, images: undefined })).toMatchObject({ id: listing.id });
    expect(
      listingSchema.parse({
        ...listing,
        images: [
          {
            id: 'image_1',
            url: 'https://media.example/listing.webp',
            sha256: '0'.repeat(64),
            mimeType: 'image/webp',
            sizeBytes: 1024,
            altText: 'Repair tools on a table',
            blossomServerUrl: 'https://media.example',
            uploadedAt: '2026-05-31T00:00:00.000Z'
          }
        ]
      }).images?.[0]
    ).toMatchObject({ mimeType: 'image/webp', sha256: '0'.repeat(64) });
    expect(
      listingSchema.parse({
        ...listing,
        images: [
          {
            id: 'external_1',
            url: 'https://shop.example/item.webp'
          }
        ]
      }).images?.[0]
    ).toMatchObject({ id: 'external_1', url: 'https://shop.example/item.webp' });
  });

  it('rejects unsafe public image metadata', () => {
    expect(() =>
      listingSchema.parse({
        ...listing,
        images: [
          {
            id: 'image_bad',
            url: 'http://media.example/listing.png',
            sha256: 'not-a-hash',
            mimeType: 'image/gif',
            sizeBytes: 6 * 1024 * 1024,
            altText: 'x'.repeat(200),
            blossomServerUrl: 'http://media.example',
            uploadedAt: '2026-05-31T00:00:00.000Z'
          }
        ]
      })
    ).toThrow();
  });

  it('rejects prohibited activity terms', () => {
    expect(() => assertPeacefulListingText('Stolen phone', 'No questions')).toThrow(/prohibited/i);
  });
});
