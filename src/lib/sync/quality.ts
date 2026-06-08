import type {
  CommunityAllowlistEntry,
  CommunityAllowlistEnvelope,
  HiddenFilter,
  Listing,
  MarketplaceRankReason,
  NostrReviewItem,
  RelayHealth,
  RelayConfig,
  RelayFetchSummary,
  RelayScore,
  RelayScoreLabel,
  ReviewQueueFilter,
  SyncedConflictGroup,
  SyncedPublicRecord
} from '../../types/domain';
import { newId, nowIso } from '../crypto/encoding';
import { communityAllowlistEnvelopeSchema } from '../validation/schemas';

export type MarketplaceListingRow = {
  listing: Listing;
  source: 'local' | 'synced';
  trusted: boolean;
  record?: SyncedPublicRecord<Listing>;
  rankReasons?: MarketplaceRankReason[];
  duplicateHidden?: boolean;
  duplicateCount?: number;
  curatedBy?: string[];
};

export function relayScoreFromHealth(health: RelayHealth): RelayScore {
  const reasons: string[] = [];
  let score = health.enabled ? 55 : 10;

  if (!health.enabled) reasons.push('disabled');
  if (health.eventsReceived > 0) {
    score += Math.min(20, health.eventsReceived * 2);
    reasons.push('receiving');
  }
  if (health.eventsPublished > 0) {
    score += Math.min(15, health.eventsPublished * 3);
    reasons.push('publishing');
  }
  if (health.latencyMs !== undefined) {
    if (health.latencyMs <= 800) {
      score += 10;
      reasons.push('low-latency');
    } else if (health.latencyMs > 2500) {
      score -= 15;
      reasons.push('high-latency');
    }
  }
  if (health.lastError) {
    score -= 20;
    reasons.push('last-error');
  }
  if (health.consecutiveFailures > 0) {
    score -= Math.min(35, health.consecutiveFailures * 12);
    reasons.push('failures');
  }

  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  return {
    url: health.url,
    score: bounded,
    label: relayScoreLabel(bounded, health),
    reasons: reasons.length > 0 ? reasons : ['no-history']
  };
}

export function relayScoresFromHealth(records: RelayHealth[]): RelayScore[] {
  return records.map(relayScoreFromHealth).sort((left, right) => right.score - left.score || left.url.localeCompare(right.url));
}

function relayScoreLabel(score: number, health: RelayHealth): RelayScoreLabel {
  if (!health.enabled || score < 25) return 'offline';
  if (score >= 80) return 'excellent';
  if (score >= 55) return 'healthy';
  return 'degraded';
}

export function applyHiddenFilter<T>(records: SyncedPublicRecord<T>[], hidden: HiddenFilter): SyncedPublicRecord<T>[] {
  if (hidden === 'all') return records;
  return records.filter((record) => (hidden === 'hidden' ? record.hidden : !record.hidden));
}

export function filterReviewItems(items: NostrReviewItem[], filter: ReviewQueueFilter, trustedPublicKeys: string[] = []): NostrReviewItem[] {
  const trusted = new Set(trustedPublicKeys.map((key) => key.toLowerCase()));
  return items
    .filter((item) => (filter.status === 'all' ? true : item.importStatus === filter.status))
    .filter((item) => {
      if (filter.encryption === 'all') return true;
      const encrypted = item.payloadPreview.toLowerCase().includes('encrypted agoramesh relay content');
      return filter.encryption === 'encrypted' ? encrypted : !encrypted;
    })
    .filter((item) => {
      if (filter.trust === 'all') return true;
      const isTrusted = trusted.has(item.authorPublicKey.toLowerCase());
      return filter.trust === 'trusted' ? isTrusted : !isTrusted;
    });
}

export function summarizeRelayFetch(
  relays: RelayConfig[],
  fetchedItems: NostrReviewItem[],
  existingItems: NostrReviewItem[],
  startedAt: number,
  endedAt = Date.now()
): RelayFetchSummary[] {
  const existing = new Set(existingItems.map((item) => item.eventId));
  return relays
    .filter((relay) => relay.enabled)
    .map((relay) => {
      const relayItems = fetchedItems.filter((item) => item.relay === relay.url);
      const duplicates = relayItems.filter((item) => existing.has(item.eventId)).length;
      const invalid = relayItems.filter((item) => item.importStatus === 'invalid' || !item.signatureValid).length;
      return {
        relayUrl: relay.url,
        ok: relayItems.length > 0 || invalid === 0,
        elapsedMs: Math.max(0, endedAt - startedAt),
        received: relayItems.length,
        duplicates,
        invalid,
        message: relayItems.length > 0 ? 'events-received' : 'no-events'
      };
    });
}

function listingKey(row: MarketplaceListingRow): string {
  return `${row.listing.authorPublicKey.toLowerCase()}:${row.listing.id}`;
}

function isListingExpiredForRank(listing: Listing, now = Date.now()): boolean {
  return new Date(listing.expiresAt).getTime() < now;
}

function rowUpdatedAt(row: MarketplaceListingRow): string {
  return row.listing.updatedAt || row.listing.createdAt;
}

function rankScore(row: MarketplaceListingRow, query = '', category = 'all', type = 'all'): { score: number; reasons: MarketplaceRankReason[] } {
  const reasons: MarketplaceRankReason[] = [];
  let score = 0;
  const normalized = query.toLowerCase().trim();
  if (!row.record?.hidden) {
    score += 80;
    reasons.push({ code: 'visible', label: 'visible' });
  }
  if (!isListingExpiredForRank(row.listing)) {
    score += 60;
    reasons.push({ code: 'active', label: 'active listing' });
  }
  if (row.trusted) {
    score += 35;
    reasons.push({ code: 'trusted', label: 'trusted author' });
  }
  if (row.source === 'local') {
    score += 25;
    reasons.push({ code: 'local', label: 'local record' });
  }
  if (category !== 'all' && row.listing.category === category) score += 15;
  if (type !== 'all' && row.listing.type === type) score += 15;
  if (normalized) {
    const text = `${row.listing.title} ${row.listing.description} ${row.listing.tags.join(' ')}`.toLowerCase();
    if (row.listing.title.toLowerCase().includes(normalized)) {
      score += 45;
      reasons.push({ code: 'title-match', label: 'title match' });
    } else if (text.includes(normalized)) {
      score += 20;
      reasons.push({ code: 'text-match', label: 'text match' });
    }
  }
  score += Math.floor(new Date(rowUpdatedAt(row)).getTime() / 86_400_000);
  return { score, reasons };
}

export function dedupeMarketplaceListings(rows: MarketplaceListingRow[]): { visible: MarketplaceListingRow[]; duplicates: MarketplaceListingRow[] } {
  const grouped = new Map<string, MarketplaceListingRow[]>();
  for (const row of rows) grouped.set(listingKey(row), [...(grouped.get(listingKey(row)) ?? []), row]);
  const visible: MarketplaceListingRow[] = [];
  const duplicates: MarketplaceListingRow[] = [];
  for (const group of grouped.values()) {
    const sorted = [...group].sort(
      (left, right) =>
        (right.source === 'local' ? 1 : 0) - (left.source === 'local' ? 1 : 0) ||
        rowUpdatedAt(right).localeCompare(rowUpdatedAt(left))
    );
    const [first, ...rest] = sorted;
    visible.push({ ...first, duplicateCount: rest.length });
    duplicates.push(...rest.map((row) => ({ ...row, duplicateHidden: true })));
  }
  return { visible, duplicates };
}

export function rankMarketplaceListings(
  rows: MarketplaceListingRow[],
  filters: { query?: string; category?: string; type?: string } = {},
  curatedCoordinates: Map<string, string[]> = new Map()
): MarketplaceListingRow[] {
  return rows
    .map((row) => {
      const rank = rankScore(row, filters.query, filters.category, filters.type);
      const coordinate = `${row.listing.authorPublicKey}:${row.listing.id}`;
      return {
        ...row,
        rankReasons: rank.reasons,
        curatedBy: curatedCoordinates.get(coordinate) ?? [],
        _rankScore: rank.score
      } as MarketplaceListingRow & { _rankScore: number };
    })
    .sort((left, right) => right._rankScore - left._rankScore || rowUpdatedAt(right).localeCompare(rowUpdatedAt(left)))
    .map(({ _rankScore, ...row }) => {
      void _rankScore;
      return row;
    });
}

function recordConflictKey<T extends { id: string }>(record: SyncedPublicRecord<T>): string {
  return `${record.kind}:${record.authorPublicKey}:${record.payload.id}`;
}

export function findSyncedConflictGroups<T extends { id: string; updatedAt?: string }>(
  records: SyncedPublicRecord<T>[]
): SyncedConflictGroup<T>[] {
  const grouped = new Map<string, SyncedPublicRecord<T>[]>();
  for (const record of records) {
    const key = recordConflictKey(record);
    grouped.set(key, [...(grouped.get(key) ?? []), record]);
  }

  return [...grouped.entries()]
    .map(([key, group]) => {
      const eventIds = new Set(group.map((record) => record.eventId));
      const updatedAts = new Set(group.map((record) => record.payload.updatedAt ?? record.importedAt));
      if (eventIds.size < 2 && updatedAts.size < 2) return undefined;
      const preferred = [...group].sort(
        (left, right) =>
          (right.payload.updatedAt ?? right.importedAt).localeCompare(left.payload.updatedAt ?? left.importedAt) ||
          right.importedAt.localeCompare(left.importedAt)
      )[0];
      return { key, records: group, preferredRecordId: preferred.id };
    })
    .filter((group): group is SyncedConflictGroup<T> => Boolean(group));
}

export function isRecordConflicted<T>(record: SyncedPublicRecord<T>, groups: SyncedConflictGroup<T>[]): boolean {
  return groups.some((group) => group.records.some((candidate) => candidate.id === record.id));
}

export function isPreferredConflictRecord<T>(record: SyncedPublicRecord<T>, groups: SyncedConflictGroup<T>[]): boolean {
  return groups.some((group) => group.preferredRecordId === record.id);
}

export function exportCommunityAllowlist(entries: CommunityAllowlistEntry[]): CommunityAllowlistEnvelope {
  return {
    schemaVersion: 1,
    kind: 'community-allowlist',
    exportedAt: nowIso(),
    entries: entries.map((entry) => ({
      publicKey: entry.publicKey,
      label: entry.label,
      note: entry.note
    }))
  };
}

export function parseCommunityAllowlistEnvelope(raw: unknown): CommunityAllowlistEnvelope {
  return communityAllowlistEnvelopeSchema.parse(raw);
}

export function mergeCommunityAllowlist(
  existing: CommunityAllowlistEntry[],
  envelope: CommunityAllowlistEnvelope,
  createdAt = nowIso()
): CommunityAllowlistEntry[] {
  const byKey = new Map(existing.map((entry) => [entry.publicKey.toLowerCase(), { ...entry, publicKey: entry.publicKey.toLowerCase() }]));
  for (const imported of envelope.entries) {
    const publicKey = imported.publicKey.toLowerCase();
    const current = byKey.get(publicKey);
    byKey.set(publicKey, {
      id: current?.id ?? newId('allowlist'),
      publicKey,
      label: imported.label || current?.label || publicKey.slice(0, 12),
      note: current?.note || imported.note || '',
      createdAt: current?.createdAt ?? createdAt
    });
  }
  return [...byKey.values()].sort((left, right) => left.label.localeCompare(right.label));
}
