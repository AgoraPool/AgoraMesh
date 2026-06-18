import type {
  Agreement,
  AgreementAcceptanceReceipt,
  AgreementReceiptStatus,
  AttestationTag,
  CommunityAllowlistEntry,
  DataSourceFilter,
  HiddenFilter,
  Listing,
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
  averageScore?: number;
  scoreCount: number;
  trustedAuthors: number;
  untrustedAuthors: number;
  roles: ('buyer' | 'seller' | 'mediator')[];
  tags: { tag: AttestationTag; count: number }[];
  recentReviews: ReputationRow[];
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
  minScore: 'all' | '4' | '5' | 'unscored';
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
  listingId?: string;
  listingTitle?: string;
  listingCoordinate?: string;
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

export function reputationReviewKey(attestation: ReputationAttestation): string {
  return [
    attestation.reviewerPublicKey.toLowerCase(),
    attestation.subjectPublicKey.toLowerCase(),
    attestation.listingCoordinate || attestation.listingId || attestation.agreementHash || 'seller'
  ].join(':');
}

export function listingReviewCoordinate(listing: Pick<Listing, 'authorPublicKey' | 'id'>): string {
  return `30402:${listing.authorPublicKey.toLowerCase()}:${listing.id}`;
}

export function listingReviewMatches(listing: Pick<Listing, 'authorPublicKey' | 'id'>, attestation: ReputationAttestation): boolean {
  if (attestation.subjectPublicKey.toLowerCase() !== listing.authorPublicKey.toLowerCase()) return false;
  if (attestation.listingCoordinate) return attestation.listingCoordinate.toLowerCase() === listingReviewCoordinate(listing).toLowerCase();
  return attestation.listingId === listing.id;
}

export function listingReviewRows(
  listing: Pick<Listing, 'authorPublicKey' | 'id'>,
  localAttestations: ReputationAttestation[],
  syncedAttestations: SyncedPublicRecord<ReputationAttestation>[],
  hidden: HiddenFilter = 'visible'
): ReputationRow[] {
  return dedupeReputationRows(reputationRows(localAttestations, syncedAttestations, hidden).filter((row) => listingReviewMatches(listing, row.attestation)));
}

export function dedupeReputationRows(rows: ReputationRow[]): ReputationRow[] {
  const byKey = new Map<string, ReputationRow>();
  for (const row of rows) {
    const key = reputationReviewKey(row.attestation);
    const current = byKey.get(key);
    if (
      !current ||
      (row.verified && !current.verified) ||
      (row.verified === current.verified && row.attestation.timestamp > current.attestation.timestamp)
    ) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()].sort((left, right) => right.attestation.timestamp - left.attestation.timestamp);
}

export function filterReputationRows(rows: ReputationRow[], filter: ReputationFilterState): ReputationRow[] {
  const query = filter.query.trim().toLowerCase();
  return dedupeReputationRows(rows).filter((row) => {
    const haystack = [
      row.attestation.subjectPublicKey,
      row.attestation.reviewerPublicKey,
      row.attestation.agreementHash ?? '',
      row.attestation.listingId ?? '',
      row.attestation.listingTitle ?? '',
      row.attestation.listingCoordinate ?? '',
      row.attestation.text,
      row.attestation.tags.join(' ')
    ]
      .join(' ')
      .toLowerCase();
    if (query && !haystack.includes(query)) return false;
    if (filter.role !== 'all' && row.attestation.role !== filter.role) return false;
    if (filter.tag !== 'all' && !row.attestation.tags.includes(filter.tag)) return false;
    if (filter.minScore === 'unscored' && row.attestation.score) return false;
    if (filter.minScore !== 'all' && filter.minScore !== 'unscored' && (!row.attestation.score || row.attestation.score < Number(filter.minScore))) return false;
    if (filter.source !== 'combined' && row.source !== filter.source) return false;
    if (filter.trust !== 'all' && (filter.trust === 'trusted') !== row.trusted) return false;
    if (filter.verification !== 'all' && (filter.verification === 'verified') !== row.verified) return false;
    return true;
  });
}

export function reputationSubjectSummaries(rows: ReputationRow[], allowlist: CommunityAllowlistEntry[]): ReputationSubjectSummary[] {
  const trustedKeys = new Set(allowlist.map((entry) => entry.publicKey.toLowerCase()));
  const groups = new Map<string, ReputationRow[]>();
  for (const row of dedupeReputationRows(rows)) {
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
      const scored = subjectRows.filter((row) => row.verified && row.attestation.score);
      const scoreTotal = scored.reduce((sum, row) => sum + (row.attestation.score ?? 0), 0);
      return {
        subjectPublicKey,
        shortKey: shortPublicKey(subjectPublicKey),
        total: subjectRows.length,
        verified: subjectRows.filter((row) => row.verified).length,
        invalid: subjectRows.filter((row) => !row.verified).length,
        local: subjectRows.filter((row) => row.source === 'local').length,
        synced: subjectRows.filter((row) => row.source === 'synced').length,
        averageScore: scored.length > 0 ? scoreTotal / scored.length : undefined,
        scoreCount: scored.length,
        trustedAuthors: subjectRows.filter((row) => row.trusted || trustedKeys.has(row.attestation.reviewerPublicKey.toLowerCase())).length,
        untrustedAuthors: subjectRows.filter((row) => !row.trusted && !trustedKeys.has(row.attestation.reviewerPublicKey.toLowerCase())).length,
        roles,
        tags: [...tagCounts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
        recentReviews: subjectRows.filter((row) => row.verified).slice(0, 3),
        notVerifiedIdentity: true as const
      };
    })
    .sort((a, b) => (b.averageScore ?? 0) - (a.averageScore ?? 0) || b.verified - a.verified || b.total - a.total || a.subjectPublicKey.localeCompare(b.subjectPublicKey));
}

export function agreementReputationCandidates(agreements: Agreement[], receipts: AgreementAcceptanceReceipt[]): AgreementReputationCandidate[] {
  return agreements.map((agreement) => {
    const agreementHash = generateAgreementHash(agreement);
    return {
      agreement,
      agreementHash,
      receiptStatus: agreementReceiptStatus(agreement, receipts),
      buyerPublicKey: agreement.buyerPublicKey,
      sellerPublicKey: agreement.sellerPublicKey,
      mediatorPublicKey: /^[0-9a-f]{64}$/i.test(agreement.mediator ?? '') ? agreement.mediator : undefined,
      listingId: agreement.listingId || undefined,
      listingTitle: agreement.exchangeDescription || undefined,
      listingCoordinate:
        agreement.listingId && agreement.sellerPublicKey ? `30402:${agreement.sellerPublicKey.toLowerCase()}:${agreement.listingId}` : undefined
    };
  });
}
