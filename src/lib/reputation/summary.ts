import type {
  Agreement,
  AgreementAcceptanceReceipt,
  AgreementReceiptStatus,
  AttestationTag,
  CommunityAllowlistEntry,
  DataSourceFilter,
  HiddenFilter,
  ReputationAttestation,
  SyncedPublicRecord,
  TrustFilter
} from '../../types/domain';
import { agreementReceiptStatus } from '../crypto/agreementReceipts';
import { verifyAttestation } from '../crypto/attestations';
import { generateAgreementHash } from '../crypto/hash';

export interface ReputationSubjectSummary {
  subjectPublicKey: string;
  shortKey: string;
  total: number;
  verified: number;
  invalid: number;
  local: number;
  synced: number;
  trustedAuthors: number;
  untrustedAuthors: number;
  roles: ('buyer' | 'seller' | 'mediator')[];
  tags: { tag: AttestationTag; count: number }[];
  notVerifiedIdentity: true;
}

export interface ReputationRow {
  attestation: ReputationAttestation;
  source: 'local' | 'synced';
  trusted: boolean;
  verified: boolean;
  record?: SyncedPublicRecord<ReputationAttestation>;
}

export interface ReputationFilterState {
  query: string;
  role: 'all' | 'buyer' | 'seller' | 'mediator';
  tag: 'all' | AttestationTag;
  source: DataSourceFilter;
  trust: TrustFilter;
  hidden: HiddenFilter;
  verification: 'all' | 'verified' | 'invalid';
}

export interface AgreementReputationCandidate {
  agreement: Agreement;
  agreementHash: string;
  receiptStatus: AgreementReceiptStatus;
  buyerPublicKey?: string;
  sellerPublicKey?: string;
  mediatorPublicKey?: string;
}

export function shortPublicKey(publicKey: string): string {
  return `${publicKey.slice(0, 12)}...${publicKey.slice(-6)}`;
}

export function reputationRows(
  localAttestations: ReputationAttestation[],
  syncedAttestations: SyncedPublicRecord<ReputationAttestation>[],
  hidden: HiddenFilter
): ReputationRow[] {
  const synced = syncedAttestations
    .filter((record) => (hidden === 'all' ? true : hidden === 'hidden' ? record.hidden : !record.hidden))
    .map((record) => ({
      attestation: record.payload,
      source: 'synced' as const,
      trusted: record.trusted,
      verified: verifyAttestation(record.payload),
      record
    }));
  return [
    ...(hidden === 'hidden'
      ? []
      : localAttestations.map((attestation) => ({
          attestation,
          source: 'local' as const,
          trusted: false,
          verified: verifyAttestation(attestation)
        }))),
    ...synced
  ];
}

export function filterReputationRows(rows: ReputationRow[], filter: ReputationFilterState): ReputationRow[] {
  const query = filter.query.trim().toLowerCase();
  return rows.filter((row) => {
    const haystack = [
      row.attestation.subjectPublicKey,
      row.attestation.reviewerPublicKey,
      row.attestation.agreementHash,
      row.attestation.text,
      row.attestation.tags.join(' ')
    ]
      .join(' ')
      .toLowerCase();
    if (query && !haystack.includes(query)) return false;
    if (filter.role !== 'all' && row.attestation.role !== filter.role) return false;
    if (filter.tag !== 'all' && !row.attestation.tags.includes(filter.tag)) return false;
    if (filter.source !== 'combined' && row.source !== filter.source) return false;
    if (filter.trust !== 'all' && (filter.trust === 'trusted') !== row.trusted) return false;
    if (filter.verification !== 'all' && (filter.verification === 'verified') !== row.verified) return false;
    return true;
  });
}

export function reputationSubjectSummaries(rows: ReputationRow[], allowlist: CommunityAllowlistEntry[]): ReputationSubjectSummary[] {
  const trustedKeys = new Set(allowlist.map((entry) => entry.publicKey.toLowerCase()));
  const groups = new Map<string, ReputationRow[]>();
  for (const row of rows) {
    const key = row.attestation.subjectPublicKey.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return [...groups.entries()]
    .map(([subjectPublicKey, subjectRows]) => {
      const roles = [...new Set(subjectRows.map((row) => row.attestation.role))];
      const tagCounts = new Map<AttestationTag, number>();
      for (const row of subjectRows) {
        for (const tag of row.attestation.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
      return {
        subjectPublicKey,
        shortKey: shortPublicKey(subjectPublicKey),
        total: subjectRows.length,
        verified: subjectRows.filter((row) => row.verified).length,
        invalid: subjectRows.filter((row) => !row.verified).length,
        local: subjectRows.filter((row) => row.source === 'local').length,
        synced: subjectRows.filter((row) => row.source === 'synced').length,
        trustedAuthors: subjectRows.filter((row) => row.trusted || trustedKeys.has(row.attestation.reviewerPublicKey.toLowerCase())).length,
        untrustedAuthors: subjectRows.filter((row) => !row.trusted && !trustedKeys.has(row.attestation.reviewerPublicKey.toLowerCase())).length,
        roles,
        tags: [...tagCounts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
        notVerifiedIdentity: true as const
      };
    })
    .sort((a, b) => b.verified - a.verified || b.total - a.total || a.subjectPublicKey.localeCompare(b.subjectPublicKey));
}

export function agreementReputationCandidates(agreements: Agreement[], receipts: AgreementAcceptanceReceipt[]): AgreementReputationCandidate[] {
  return agreements.map((agreement) => ({
    agreement,
    agreementHash: generateAgreementHash(agreement),
    receiptStatus: agreementReceiptStatus(agreement, receipts),
    buyerPublicKey: agreement.buyerPublicKey,
    sellerPublicKey: agreement.sellerPublicKey,
    mediatorPublicKey: /^[0-9a-f]{64}$/i.test(agreement.mediator ?? '') ? agreement.mediator : undefined
  }));
}
