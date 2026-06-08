import { finalizeEvent, verifyEvent } from 'nostr-tools/pure';
import type {
  Agreement,
  AgreementAcceptanceReceipt,
  AgreementReceiptStatus,
  AgreementTermsPacket
} from '../../types/domain';
import { agreementAcceptanceReceiptSchema, agreementTermsPacketSchema } from '../validation/schemas';
import { canonicalJson, newId, nowIso } from './encoding';
import { generateAgreementHash } from './hash';
import { privateKeyBytes } from './identity';

const AGREEMENT_ACCEPTANCE_KIND = 39010;

export interface AgreementAcceptanceDraft {
  id: string;
  agreementHash: string;
  role: 'buyer' | 'seller';
  signerPublicKey: string;
  acceptedAt: string;
}

export interface AgreementAcceptanceUnsignedEvent {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

export interface AgreementAcceptanceSignedEvent extends AgreementAcceptanceUnsignedEvent {
  id: string;
  pubkey: string;
  sig: string;
}

export interface AgreementReceiptRoleSummary {
  status: AgreementReceiptStatus;
  buyerReceipt?: AgreementAcceptanceReceipt;
  sellerReceipt?: AgreementAcceptanceReceipt;
  missingRoles: ('buyer' | 'seller')[];
  validReceipts: AgreementAcceptanceReceipt[];
}

export interface AgreementReceiptImportResult {
  agreement: Agreement;
  receipt: AgreementAcceptanceReceipt;
}

function acceptedAtSeconds(acceptedAt: string): number {
  return Math.floor(Date.parse(acceptedAt) / 1000);
}

function expectedSignerPublicKey(agreement: Agreement, role: 'buyer' | 'seller'): string {
  const publicKey = role === 'buyer' ? agreement.buyerPublicKey : agreement.sellerPublicKey;
  if (!publicKey) {
    throw new Error(`${role} public key is required before signing an agreement receipt.`);
  }
  return publicKey.toLowerCase();
}

function acceptanceContent(draft: AgreementAcceptanceDraft): string {
  return canonicalJson({
    app: 'agoramesh',
    version: 1,
    type: 'agreement-acceptance-receipt',
    id: draft.id,
    agreementHash: draft.agreementHash,
    role: draft.role,
    signerPublicKey: draft.signerPublicKey.toLowerCase(),
    acceptedAt: draft.acceptedAt
  });
}

export function agreementTermsPacket(agreement: Agreement): AgreementTermsPacket {
  const agreementHash = generateAgreementHash(agreement);
  return agreementTermsPacketSchema.parse({
    schemaVersion: 1,
    kind: 'agreement-terms-packet',
    agreement: { ...agreement, hash: agreementHash, hashVersion: 2 },
    agreementHash,
    exportedAt: nowIso()
  });
}

export function parseAgreementTermsPacket(value: unknown): AgreementTermsPacket {
  const packet = agreementTermsPacketSchema.parse(value);
  const agreementHash = generateAgreementHash(packet.agreement);
  if (packet.agreementHash !== agreementHash || packet.agreement.hash !== agreementHash) {
    throw new Error('Agreement packet hash does not match the included agreement terms.');
  }
  return packet;
}

export function createAgreementAcceptanceDraft(agreement: Agreement, role: 'buyer' | 'seller'): AgreementAcceptanceDraft {
  return {
    id: newId('agreement_receipt'),
    agreementHash: generateAgreementHash(agreement),
    role,
    signerPublicKey: expectedSignerPublicKey(agreement, role),
    acceptedAt: nowIso()
  };
}

export function unsignedAgreementAcceptanceEvent(draft: AgreementAcceptanceDraft): AgreementAcceptanceUnsignedEvent {
  return {
    kind: AGREEMENT_ACCEPTANCE_KIND,
    created_at: acceptedAtSeconds(draft.acceptedAt),
    tags: [
      ['client', 'agoramesh'],
      ['agreement', draft.agreementHash],
      ['role', draft.role]
    ],
    content: acceptanceContent(draft)
  };
}

export function receiptFromSignedAgreementAcceptanceEvent(
  draft: AgreementAcceptanceDraft,
  event: AgreementAcceptanceSignedEvent
): AgreementAcceptanceReceipt {
  if (event.pubkey.toLowerCase() !== draft.signerPublicKey.toLowerCase()) {
    throw new Error('Agreement receipt signer does not match the selected party public key.');
  }
  if (event.kind !== AGREEMENT_ACCEPTANCE_KIND || event.created_at !== acceptedAtSeconds(draft.acceptedAt) || event.content !== acceptanceContent(draft)) {
    throw new Error('Agreement receipt signer changed the unsigned acceptance event.');
  }
  if (JSON.stringify(event.tags) !== JSON.stringify(unsignedAgreementAcceptanceEvent(draft).tags)) {
    throw new Error('Agreement receipt signer changed the unsigned acceptance tags.');
  }
  if (!verifyEvent(event)) {
    throw new Error('Agreement receipt signature is invalid.');
  }

  return agreementAcceptanceReceiptSchema.parse({
    id: draft.id,
    schemaVersion: 1,
    kind: 'agreement-acceptance-receipt',
    agreementHash: draft.agreementHash,
    role: draft.role,
    signerPublicKey: draft.signerPublicKey.toLowerCase(),
    acceptedAt: draft.acceptedAt,
    eventId: event.id,
    signature: event.sig
  });
}

export function createAgreementAcceptanceReceipt(
  agreement: Agreement,
  role: 'buyer' | 'seller',
  privateKeyHex: string
): AgreementAcceptanceReceipt {
  const draft = createAgreementAcceptanceDraft(agreement, role);
  const signed = finalizeEvent(unsignedAgreementAcceptanceEvent(draft), privateKeyBytes(privateKeyHex));
  return receiptFromSignedAgreementAcceptanceEvent(draft, signed as AgreementAcceptanceSignedEvent);
}

export function verifyAgreementAcceptanceReceipt(receipt: AgreementAcceptanceReceipt, agreement: Agreement): boolean {
  const parsed = agreementAcceptanceReceiptSchema.parse(receipt);
  if (parsed.agreementHash !== generateAgreementHash(agreement)) return false;
  if (parsed.signerPublicKey.toLowerCase() !== expectedSignerPublicKey(agreement, parsed.role)) return false;

  return verifyEvent({
    id: parsed.eventId,
    pubkey: parsed.signerPublicKey,
    created_at: acceptedAtSeconds(parsed.acceptedAt),
    kind: AGREEMENT_ACCEPTANCE_KIND,
    tags: [
      ['client', 'agoramesh'],
      ['agreement', parsed.agreementHash],
      ['role', parsed.role]
    ],
    content: acceptanceContent(parsed),
    sig: parsed.signature
  });
}

export function receiptMatchesAgreementHash(receipt: AgreementAcceptanceReceipt, agreement: Agreement): boolean {
  return receipt.agreementHash === agreement.hash || receipt.agreementHash === generateAgreementHash(agreement);
}

export function agreementForReceipt(receipt: AgreementAcceptanceReceipt, agreements: Agreement[]): Agreement | undefined {
  return agreements.find((agreement) => receiptMatchesAgreementHash(receipt, agreement));
}

export function validReceiptsForAgreement(
  agreement: Agreement,
  receipts: AgreementAcceptanceReceipt[]
): AgreementAcceptanceReceipt[] {
  return receipts.filter((receipt) => {
    try {
      return verifyAgreementAcceptanceReceipt(receipt, agreement);
    } catch {
      return false;
    }
  });
}

export function agreementReceiptStatus(agreement: Agreement, receipts: AgreementAcceptanceReceipt[]): AgreementReceiptStatus {
  const valid = validReceiptsForAgreement(agreement, receipts);
  const roles = new Set(valid.map((receipt) => receipt.role));
  if (roles.has('buyer') && roles.has('seller')) return 'mutually-signed';
  if (roles.size > 0) return 'partially-signed';
  return 'draft';
}

export function receiptRoleSummary(agreement: Agreement, receipts: AgreementAcceptanceReceipt[]): AgreementReceiptRoleSummary {
  const validReceipts = validReceiptsForAgreement(agreement, receipts);
  const buyerReceipt = validReceipts.find((receipt) => receipt.role === 'buyer');
  const sellerReceipt = validReceipts.find((receipt) => receipt.role === 'seller');
  const missingRoles: ('buyer' | 'seller')[] = [];
  if (!buyerReceipt) missingRoles.push('buyer');
  if (!sellerReceipt) missingRoles.push('seller');
  return {
    status: buyerReceipt && sellerReceipt ? 'mutually-signed' : buyerReceipt || sellerReceipt ? 'partially-signed' : 'draft',
    buyerReceipt,
    sellerReceipt,
    missingRoles,
    validReceipts
  };
}

export function isDuplicateAgreementReceipt(receipt: AgreementAcceptanceReceipt, receipts: AgreementAcceptanceReceipt[]): boolean {
  return receipts.some(
    (existing) =>
      existing.agreementHash === receipt.agreementHash &&
      existing.role === receipt.role &&
      existing.signerPublicKey.toLowerCase() === receipt.signerPublicKey.toLowerCase() &&
      existing.eventId === receipt.eventId
  );
}

export function parseAgreementReceiptImport(
  raw: unknown,
  agreements: Agreement[],
  existingReceipts: AgreementAcceptanceReceipt[]
): AgreementReceiptImportResult {
  const receipt = agreementAcceptanceReceiptSchema.parse(raw);
  const agreement = agreementForReceipt(receipt, agreements);
  if (!agreement) {
    throw new Error('Import the matching agreement packet before importing this receipt.');
  }
  if (isDuplicateAgreementReceipt(receipt, existingReceipts)) {
    throw new Error('This agreement receipt was already imported.');
  }
  if (!verifyAgreementAcceptanceReceipt(receipt, agreement)) {
    throw new Error('Agreement receipt could not be verified.');
  }
  return { agreement, receipt };
}
