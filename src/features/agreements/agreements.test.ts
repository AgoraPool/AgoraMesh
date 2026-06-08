import { generateAgreementHash } from '../../lib/crypto/hash';
import {
  agreementReceiptStatus,
  agreementTermsPacket,
  createAgreementAcceptanceReceipt,
  parseAgreementReceiptImport,
  parseAgreementTermsPacket,
  receiptRoleSummary,
  verifyAgreementAcceptanceReceipt
} from '../../lib/crypto/agreementReceipts';
import type { Agreement } from '../../types/domain';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { bytesToHex } from '@noble/hashes/utils';

const buyerPrivateKey = generateSecretKey();
const sellerPrivateKey = generateSecretKey();
const buyerPublicKey = getPublicKey(buyerPrivateKey);
const sellerPublicKey = getPublicKey(sellerPrivateKey);

const agreement: Agreement = {
  id: 'agreement_1',
  buyer: 'alice',
  seller: 'bob',
  buyerPublicKey,
  sellerPublicKey,
  buyerLabel: 'alice',
  sellerLabel: 'bob',
  listingId: 'listing_1',
  exchangeDescription: 'Laptop repair',
  priceAndPayment: 'cash after completion',
  fulfillmentTerms: 'Meet in public workspace',
  deadline: '2026-06-15',
  refundTerms: 'No payment if not repairable',
  mediator: 'carol',
  evidenceExpectations: 'Photos and receipts only',
  buyerAccepted: true,
  sellerAccepted: true,
  hash: '',
  createdAt: '2026-05-31T00:00:00.000Z',
  updatedAt: '2026-05-31T00:00:00.000Z'
};

describe('agreement hash generation', () => {
  it('is deterministic and ignores updatedAt/hash churn', () => {
    const first = generateAgreementHash(agreement);
    const second = generateAgreementHash({ ...agreement, hash: 'f'.repeat(64), updatedAt: '2026-06-01T00:00:00.000Z' });
    expect(first).toHaveLength(64);
    expect(second).toBe(first);
  });

  it('ignores legacy local acceptance checkbox state', () => {
    const first = generateAgreementHash({ ...agreement, buyerAccepted: false, sellerAccepted: false });
    const second = generateAgreementHash({ ...agreement, buyerAccepted: true, sellerAccepted: true });
    expect(second).toBe(first);
  });

  it('round trips private agreement packets', () => {
    const packet = agreementTermsPacket(agreement);
    const parsed = parseAgreementTermsPacket(packet);
    expect(parsed.agreementHash).toBe(generateAgreementHash(agreement));
    expect(parsed.agreement.exchangeDescription).toBe('Laptop repair');
  });

  it('verifies buyer and seller signed acceptance receipts', () => {
    const buyerReceipt = createAgreementAcceptanceReceipt(agreement, 'buyer', bytesToHex(buyerPrivateKey));
    const sellerReceipt = createAgreementAcceptanceReceipt(agreement, 'seller', bytesToHex(sellerPrivateKey));

    expect(verifyAgreementAcceptanceReceipt(buyerReceipt, agreement)).toBe(true);
    expect(verifyAgreementAcceptanceReceipt(sellerReceipt, agreement)).toBe(true);
    expect(agreementReceiptStatus(agreement, [])).toBe('draft');
    expect(agreementReceiptStatus(agreement, [buyerReceipt])).toBe('partially-signed');
    expect(agreementReceiptStatus(agreement, [buyerReceipt, sellerReceipt])).toBe('mutually-signed');
    expect(receiptRoleSummary(agreement, [buyerReceipt])).toMatchObject({
      status: 'partially-signed',
      missingRoles: ['seller']
    });
  });

  it('rejects wrong signer and modified receipt data', () => {
    expect(() => createAgreementAcceptanceReceipt(agreement, 'buyer', bytesToHex(sellerPrivateKey))).toThrow(/signer/i);

    const receipt = createAgreementAcceptanceReceipt(agreement, 'buyer', bytesToHex(buyerPrivateKey));
    expect(verifyAgreementAcceptanceReceipt({ ...receipt, agreementHash: 'a'.repeat(64) }, agreement)).toBe(false);
    expect(verifyAgreementAcceptanceReceipt({ ...receipt, role: 'seller' }, agreement)).toBe(false);
  });

  it('validates receipt imports against matching agreements and duplicates', () => {
    const receipt = createAgreementAcceptanceReceipt(agreement, 'buyer', bytesToHex(buyerPrivateKey));
    expect(parseAgreementReceiptImport(receipt, [agreement], [])).toMatchObject({ receipt });
    expect(() => parseAgreementReceiptImport(receipt, [], [])).toThrow(/matching agreement/i);
    expect(() => parseAgreementReceiptImport(receipt, [agreement], [receipt])).toThrow(/already imported/i);
    expect(() => parseAgreementReceiptImport({ ...receipt, signerPublicKey: sellerPublicKey }, [agreement], [])).toThrow(/verified/i);
  });
});
