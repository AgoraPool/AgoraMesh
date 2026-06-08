import { assertPublishablePayload, findSensitivePublicationFields } from './publication';
import { publicListingPayload } from '../nostr/events';
import type { Listing } from '../../types/domain';

const listing: Listing = {
  id: 'listing_public',
  authorPublicKey: 'a'.repeat(64),
  title: 'Tutoring',
  type: 'offer',
  category: 'tutoring',
  description: 'Math help in an approximate region.',
  region: 'Prague',
  status: 'active',
  price: { amount: '0', currency: 'FREE' },
  paymentPreferences: ['cash'],
  barterAccepted: false,
  tags: ['math'],
  expiresAt: '2026-06-30',
  contactMethod: { id: 'contact_1', kind: 'matrix', value: '@alice:matrix.org' },
  visibility: 'public',
  createdAt: '2026-05-31T00:00:00.000Z',
  updatedAt: '2026-05-31T00:00:00.000Z'
};

describe('publication guard', () => {
  it('accepts allowlisted public listing payloads', () => {
    expect(() => publicListingPayload(listing)).not.toThrow();
  });

  it('detects sensitive nested fields', () => {
    expect(findSensitivePublicationFields({ payload: { encryptedPrivateKey: 'secret' } })).toEqual(['$.payload.encryptedPrivateKey']);
  });

  it('rejects private dispute and key material fields', () => {
    expect(() => assertPublishablePayload({ claimSummary: 'private', evidence: [] })).toThrow(/sensitive/i);
    expect(() => assertPublishablePayload({ identity: { privateKey: 'abc' } })).toThrow(/sensitive/i);
  });

  it('rejects private trade, evidence, identity, and payment promise fields', () => {
    const sensitivePayloads = [
      { agreement: { agreementText: 'private terms' } },
      { agreement: { fullAgreement: 'full private agreement' } },
      { dispute: { privateSettlementText: 'private settlement' } },
      { evidence: { localFilename: '/home/alice/receipt.png' } },
      { evidence: { filePath: '/tmp/evidence.pdf' } },
      { identity: { encryptedPrivateKey: 'encrypted identity blob' } },
      { payment: { walletSeed: 'seed words' } },
      { payment: { refundSecret: 'secret refund code' } },
      { payment: { privateInvoice: 'invoice with private memo' } }
    ];

    for (const payload of sensitivePayloads) {
      expect(() => assertPublishablePayload(payload)).toThrow(/sensitive/i);
    }
  });
});
