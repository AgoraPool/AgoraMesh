import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { canonicalJson, utf8ToBytes } from './encoding';
import type { Agreement } from '../../types/domain';

export function sha256Hex(value: string): string {
  return bytesToHex(sha256(utf8ToBytes(value)));
}

export function generateAgreementHash(agreement: Omit<Agreement, 'hash'> | Agreement): string {
  const hashable = {
    hashVersion: 2,
    buyer: agreement.buyer,
    seller: agreement.seller,
    buyerPublicKey: agreement.buyerPublicKey ?? '',
    sellerPublicKey: agreement.sellerPublicKey ?? '',
    buyerLabel: agreement.buyerLabel ?? '',
    sellerLabel: agreement.sellerLabel ?? '',
    listingId: agreement.listingId ?? '',
    exchangeDescription: agreement.exchangeDescription,
    priceAndPayment: agreement.priceAndPayment,
    fulfillmentTerms: agreement.fulfillmentTerms,
    deadline: agreement.deadline,
    refundTerms: agreement.refundTerms,
    mediator: agreement.mediator ?? '',
    evidenceExpectations: agreement.evidenceExpectations
  };
  return sha256Hex(canonicalJson(hashable));
}
