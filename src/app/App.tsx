import {
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  FileLock2,
  Handshake,
  Home,
  KeyRound,
  Languages,
  LockKeyhole,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  PlusCircle,
  Radio,
  ReceiptText,
  Scale,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  ShoppingBag,
  Upload,
  UserRound
} from 'lucide-react';
import type { Table } from 'dexie';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { attestationFromSignedEvent, createSignedAttestation, prepareAttestationEvent, verifyAttestation, type AttestationSignedEvent } from '../lib/crypto/attestations';
import { decryptDisputeBundle, encryptDisputeBundle } from '../lib/crypto/encryptedExport';
import {
  agreementReceiptStatus,
  agreementTermsPacket,
  createAgreementAcceptanceDraft,
  createAgreementAcceptanceReceipt,
  isDuplicateAgreementReceipt,
  parseAgreementReceiptImport,
  parseAgreementTermsPacket,
  receiptFromSignedAgreementAcceptanceEvent,
  receiptRoleSummary,
  unsignedAgreementAcceptanceEvent,
  verifyAgreementAcceptanceReceipt,
  type AgreementAcceptanceSignedEvent
} from '../lib/crypto/agreementReceipts';
import { base64FromBytes, newId, nowIso, utf8ToBytes } from '../lib/crypto/encoding';
import { generateAgreementHash } from '../lib/crypto/hash';
import { activeSigningPublicKey, createExtensionIdentity, createIdentity, decryptPrivateKey, identityCanUseLocalUnlock, signerIdentityStatus } from '../lib/crypto/identity';
import { decryptLocalSecret, encryptLocalSecret } from '../lib/crypto/localSecret';
import {
  categoryLabel,
  fulfillmentBadgeForListing,
  fulfillmentMatchesListing,
  paymentBadgeLabel,
  paymentMatchesListing,
  sellerSummaryForListing,
  type SellerSummary
} from '../lib/marketplace/presentation';
import {
  listingImageFromBlossomResponse,
  maxListingImages,
  sha256File,
  signBlossomUploadAuthLocally,
  signBlossomUploadAuthWithExtension,
  uploadToBlossom,
  validateListingImageFile
} from '../lib/media/blossom';
import {
  AGORAMESH_EVENT_KINDS,
  communityCurationListPayload,
  dedupeReviewItems,
  fetchAgoraEventsFromRelays,
  fetchNostrProfileMetadata,
  isoToNostrTimestamp,
  importablePayloadFromReviewItem,
  isAgoraMeshNativeListingEvent,
  nostrCoordinate,
  parseAgoraEventPayload,
  parseNostrEvent,
  publishToRelays,
  publishReceiptsFromStatuses,
  publicMediatorPayload,
  publicProfilePayload,
  publicReputationPayload,
  reviewItemHasEncryptedContent,
  signCommunityCurationList,
  signListing,
  signMediator,
  signPublicProfile,
  signReputation,
  subscribeToAgoraEvents,
  unsignedAgoraEvent,
  unsignedListing,
  publicProfileFromNostrMetadata,
  syncedRecordFromReviewItem,
  type NostrEvent,
  type NostrUnsignedEvent
} from '../lib/nostr/events';
import { normalizeNostrContact } from '../lib/nostr/contact';
import {
  createExtensionNostrIntroEvents,
  createLocalNostrIntroEvents,
  fetchNostrInboxGiftWraps,
  nostrInboxSince,
  nostrIntroPlaintext,
  NOSTR_INTRO_MESSAGE_LIMIT,
  unwrapExtensionNostrGiftWrap,
  unwrapLocalNostrGiftWrap,
  type NostrInboxFetchResult,
  type NostrIntroContext,
  type UnwrappedNostrMessage
} from '../lib/nostr/messages';
import { fetchLnurlPayMetadata, lnurlTagForPayUrl, requestLnurlInvoice } from '../lib/payments/lnurl';
import { operatorSupportConfig, type OperatorSupportConfig } from '../lib/payments/operatorSupport';
import { parseNwcUri, payNwcInvoice, requestNwcInfo, type NwcRequestResult } from '../lib/nostr/nwc';
import {
  OPERATOR_SUPPORT_PURPOSE,
  OPERATOR_SUPPORT_TAG,
  fetchZapReceiptsFromRelays,
  signZapRequestLocally,
  signZapRequestWithExtension,
  validateListingZapReceipt,
  validateOperatorSupportReceipt,
  validateZapReceipt,
  type ZapRequestArgs
} from '../lib/nostr/zaps';
import {
  connectNostrSigner,
  decryptWithNostrSigner,
  detectNostrSigner,
  encryptWithNostrSigner,
  resumeNostrConnectPairing,
  signerSupportsNip44Decryption,
  signerSupportsNip44Encryption,
  startNostrConnectPairing,
  signWithNostrSigner
} from '../lib/nostr/signer';
import { db, defaultSyncSettings, deleteLocalData, downloadJson, ensureDefaults, exportAllData, importAllData } from '../lib/storage/db';
import { sanitizePlainText, sanitizeTags, splitList } from '../lib/security/sanitize';
import {
  applyHiddenFilter,
  dedupeMarketplaceListings,
  exportCommunityAllowlist,
  findSyncedConflictGroups,
  filterReviewItems,
  isPreferredConflictRecord,
  isRecordConflicted,
  mergeCommunityAllowlist,
  rankMarketplaceListings,
  parseCommunityAllowlistEnvelope,
  relayScoresFromHealth,
  summarizeRelayFetch,
  type MarketplaceListingRow
} from '../lib/sync/quality';
import {
  agreementReputationCandidates,
  filterReputationRows,
  reputationReviewKey,
  reputationRows,
  reputationSubjectSummaries,
  shortPublicKey,
  type AgreementReputationCandidate,
  type ReputationFilterState
} from '../lib/reputation/summary';
import {
  agreementSchema,
  assertPeacefulListingText,
  blossomServerConfigSchema,
  disputeCaseSchema,
  listingCategorySchema,
  listingSchema,
  mediatorProfileSchema,
  publicProfileSchema,
  communityCurationListSchema,
  relayConfigSchema
} from '../lib/validation/schemas';
import type {
  Agreement,
  AgreementAcceptanceReceipt,
  AttestationTag,
  BlossomServerConfig,
  CommunityAllowlistEntry,
  CommunityCurationList,
  ContactKind,
  ContactMethod,
  DataSourceFilter,
  DisputeCase,
  HiddenFilter,
  IdentityRecord,
  Listing,
  ListingDiscoveryScope,
  ListingImage,
  ListingStatus,
  ListingType,
  ListingVisibility,
  ListingZapReceipt,
  LightningPaymentAttempt,
  MediatorProfile,
  NostrContactReceipt,
  NostrContactReceiptStatus,
  NostrInboxCursor,
  NostrMessageRecord,
  NostrMessageThread,
  NwcConnection,
  NostrSignerState,
  NostrReviewItem,
  OperatorSupportReceipt,
  PaymentIntent,
  PaymentPreference,
  PublicDisputeOutcome,
  PublicProfile,
  PublishObjectType,
  PublishReceipt,
  RelayConfig,
  RelayHealth,
  RelayFetchSummary,
  ReputationAttestation,
  ReviewQueueFilter,
  SignerIdentityStatus,
  SyncSettings,
  SyncStatus,
  SyncedPublicRecord,
  TrustFilter
} from '../types/domain';

type Page = 'home' | 'browse' | 'listing' | 'profile' | 'inbox' | 'mediators' | 'trade' | 'reputation' | 'settings';
type ListingRoute = `listing/local/${string}` | `listing/synced/${string}`;
type RouteTarget =
  | Page
  | ListingRoute
  | 'browse:create'
  | 'browse:mine'
  | 'profile:public'
  | 'settings:relays'
  | 'settings:review'
  | 'settings:backup'
  | 'settings:inbox';
type BrowseTab = 'discover' | 'create' | 'mine';
type SettingsTab = 'account' | 'relays' | 'cache' | 'trust' | 'media' | 'backup' | 'diagnostics';
type ProfileTab = 'identity' | 'publicProfile' | 'backup';
type TradeTab = 'agreement' | 'mediator' | 'dispute' | 'outcome';
type ReputationTab = 'create' | 'browse' | 'context';
type NextStep = { body: string; actions: { label: string; page: RouteTarget }[] };
type ProfileSaveResult = { mediatorAvailable: boolean; mediatorProfileId?: string };
type ReadinessItem = { label: string; done: boolean; detail?: string };
type ListingSourceRef = { source: 'local' | 'synced'; id: string; recordId?: string; listing: Listing };
type PublishReceiptSummary = { accepted: number; failed: number; pending: number; latest?: PublishReceipt };
type PublicSyncStep = { title: string; body: string; done: boolean; actionLabel?: string; onAction?: () => void };
type MarketplaceFetchSummary = { imported: number; updated: number; unchanged: number; skipped: number; invalid: number; relaysQueried: number };
type PublicCacheWriteResult = 'imported' | 'updated' | 'unchanged' | 'skipped';
type CacheablePayload = PublicProfile | Listing | MediatorProfile | ReputationAttestation | PublicDisputeOutcome | CommunityCurationList;
type NostrContactTarget = {
  recipientPublicKey: string;
  label: string;
  contextType: NostrContactReceipt['contextType'];
  contextId?: string;
  contextTitle?: string;
};
type LightningPaymentRequest = {
  listing: Listing;
  sellerProfile?: PublicProfile;
  lnurlSource: string;
  amountSats: number;
  publicNote: string;
};
type OperatorSupportPaymentRequest = {
  amountSats: number;
  publicNote: string;
};
type SaveNwcConnectionRequest = {
  uri: string;
  passphrase: string;
  label?: string;
};
type SendNostrContactIntroArgs = NostrContactTarget & {
  message: string;
  includeContext: boolean;
  cachePassphrase?: string;
};
type InboxFetchSummary = { fetched: number; imported: number; duplicates: number; failed: number; relays: number };
type DecryptedNostrMessage = NostrMessageRecord & { plaintext: string };
type SupportFilter = 'all' | 'supporters' | 'non-supporters';
type ReputationDraftRequest = {
  subjectPublicKey: string;
  role: 'buyer' | 'seller' | 'mediator';
  listingId?: string;
  listingTitle?: string;
  listingCoordinate?: string;
};
type ListingImageDraft =
  | { id: string; kind: 'existing'; image: ListingImage; previewUrl: string; name: string; altText: string }
  | { id: string; kind: 'new'; file: File; previewUrl: string; name: string; altText: string };
type MarketplaceFilterPreset = 'fresh' | 'trusted-synced' | 'local-only' | 'moderation';
type SignerRestoreSummary = {
  profile: number;
  listings: number;
  mediators: number;
  kept: number;
};

const categories = listingCategorySchema.options;
const attestationTags: AttestationTag[] = [
  'fulfilled-agreement',
  'clear-communication',
  'late',
  'no-show',
  'fair-mediator',
  'resolved-dispute',
  'refund-honored',
  'other'
];

const emptyContact = (): ContactMethod => ({ id: newId('contact'), kind: 'matrix', value: '' });
const marketplacePageSize = 24;
const operatorSupport = operatorSupportConfig();

function defaultListingExpirationDate(): string {
  return new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
}

function backupKey(publicKey: string): string {
  return `agoramesh.identityBackup.${publicKey}`;
}

function readBackupConfirmed(identity?: IdentityRecord): boolean {
  return identity ? localStorage.getItem(backupKey(identity.publicKey)) === 'confirmed' : false;
}

function markBackupConfirmed(identity: IdentityRecord): void {
  localStorage.setItem(backupKey(identity.publicKey), 'confirmed');
}

function clearBackupConfirmed(identity: IdentityRecord): void {
  localStorage.removeItem(backupKey(identity.publicKey));
}

async function markSyncedRecordsTrusted<T>(
  table: Table<SyncedPublicRecord<T>, string>,
  publicKey: string,
  trusted: boolean
): Promise<void> {
  const records = await table.where('authorPublicKey').equals(publicKey).toArray();
  await table.bulkPut(records.map((record) => ({ ...record, trusted })));
}

async function recomputeSyncedRecordTrust(allowlist: CommunityAllowlistEntry[]): Promise<void> {
  const trustedKeys = new Set(allowlist.map((entry) => entry.publicKey));
  await Promise.all([
    recomputeTableTrust(db.syncedProfiles, trustedKeys),
    recomputeTableTrust(db.syncedListings, trustedKeys),
    recomputeTableTrust(db.syncedMediators, trustedKeys),
    recomputeTableTrust(db.syncedAttestations, trustedKeys),
    recomputeTableTrust(db.syncedDisputeOutcomes, trustedKeys),
    recomputeTableTrust(db.syncedCommunityLists, trustedKeys)
  ]);
}

async function recomputeTableTrust<T>(table: Table<SyncedPublicRecord<T>, string>, trustedKeys: Set<string>): Promise<void> {
  const records = await table.toArray();
  await table.bulkPut(records.map((record) => ({ ...record, trusted: trustedKeys.has(record.authorPublicKey) })));
}

function syncedCoordinate<T extends CacheablePayload>(record: SyncedPublicRecord<T>): string {
  return `${record.kind}:${record.authorPublicKey.toLowerCase()}:${record.payload.id}`;
}

function payloadIsNewer(incoming: { updatedAt: string }, existing: { updatedAt: string }): boolean {
  return incoming.updatedAt.localeCompare(existing.updatedAt) > 0;
}

function signerRestoreCount(summary: SignerRestoreSummary): number {
  return summary.profile + summary.listings + summary.mediators;
}

function nostrContactForMethod(contact?: ContactMethod, fallbackPublicKey?: string): ReturnType<typeof normalizeNostrContact> {
  if (contact?.kind === 'nostr') return normalizeNostrContact(contact.value) ?? (fallbackPublicKey ? normalizeNostrContact(fallbackPublicKey) : undefined);
  return fallbackPublicKey ? normalizeNostrContact(fallbackPublicKey) : undefined;
}

function nostrContactForMethods(contacts: ContactMethod[], fallbackPublicKey?: string): ReturnType<typeof normalizeNostrContact> {
  const explicit = contacts.find((contact) => contact.kind === 'nostr');
  return nostrContactForMethod(explicit, fallbackPublicKey);
}

function nostrReceiptStatusFromRelayResults(eventStatuses: SyncStatus[][]): NostrContactReceiptStatus {
  const deliveredEvents = eventStatuses.filter((statuses) => statuses.some((status) => status.ok)).length;
  if (deliveredEvents === 0) return 'failed';
  return deliveredEvents === eventStatuses.length ? 'accepted' : 'partial';
}

function nostrThreadKey(ownerPublicKey: string, counterpartPublicKey: string, subject = '', contextId = ''): string {
  return [ownerPublicKey.toLowerCase(), counterpartPublicKey.toLowerCase(), subject.trim().toLowerCase(), contextId.trim()].join(':');
}

function nostrThreadId(threadKey: string): string {
  return `nostr_thread_${base64FromBytes(utf8ToBytes(threadKey)).replace(/[^a-z0-9]/gi, '').slice(0, 48)}`;
}

function messageContextFromPlaintext(plaintext: string): { contextTitle?: string; contextId?: string } {
  const normalized = normalizePlainTextForDisplay(plaintext);
  const contextTitle =
    normalized.match(/^Context: (.+)$/m)?.[1]?.trim() ??
    normalized.match(/^(Listing|Profile|Mediator|Thread): (.+)$/m)?.[2]?.trim();
  const contextId = normalized.match(/^Reference: (.+)$/m)?.[1]?.trim();
  return { contextTitle, contextId };
}

function messageIso(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

function normalizePlainTextForDisplay(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\s+---\s+AgoraMesh context\s+/g, '\n\n---\nAgoraMesh context\n')
    .replace(/\s+---\s*$/g, '\n---')
    .replace(/\s+(Listing|Profile|Mediator|Thread):\s+/g, '\n$1: ')
    .replace(/\s+Reference:\s+/g, '\nReference: ');
}

function PlainTextBlock({ text, className = '' }: { text: string; className?: string }): ReactNode {
  const blocks = normalizePlainTextForDisplay(text)
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.split('\n').map((line) => line.trimEnd()))
    .filter((lines) => lines.some((line) => line.trim()));
  if (blocks.length === 0) return null;
  return (
    <div className={className ? `plain-text-block ${className}` : 'plain-text-block'}>
      {blocks.map((lines, blockIndex) => {
        const isContextBlock = lines[0] === '---' && lines[lines.length - 1] === '---' && lines.some((line) => line.toLowerCase() === 'agoramesh context');
        if (isContextBlock) {
          const contextLines = lines.slice(1, -1).filter((line) => line.trim());
          const title = contextLines[0] ?? 'AgoraMesh context';
          return (
            <aside className="plain-text-context" key={`context-${blockIndex}`}>
              <strong>{title}</strong>
              {contextLines.slice(1).map((line, lineIndex) => (
                <span key={`${blockIndex}-context-${lineIndex}`}>{line}</span>
              ))}
            </aside>
          );
        }
        return (
          <p key={`paragraph-${blockIndex}`}>
            {lines.map((line, lineIndex) => (
              <span key={`${blockIndex}-${lineIndex}`}>
                {line}
                {lineIndex < lines.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function effectiveSyncedListingScope(record: SyncedPublicRecord<Listing>): ListingDiscoveryScope | undefined {
  if (record.discoveryScope === 'agoramesh-native') return 'agoramesh-native';
  try {
    if (isAgoraMeshNativeListingEvent(parseNostrEvent(JSON.parse(record.rawEvent)))) return 'agoramesh-native';
  } catch {
    // Fall back to parsed compatibility markers if the raw signed event cannot be inspected.
  }
  if (record.payload.tags.some((tag) => tag.toLowerCase() === 'agoramesh')) return 'agoramesh-native';
  return record.discoveryScope;
}

function syncedListingInDisplayScope(record: SyncedPublicRecord<Listing>, scope: ListingDiscoveryScope): boolean {
  if (scope === 'all-nip99') return true;
  return !record.discoveryScope || effectiveSyncedListingScope(record) === 'agoramesh-native';
}

function reviewItemCoordinate(item: NostrReviewItem, payload: CacheablePayload): string {
  return `${item.kind}:${item.authorPublicKey.toLowerCase()}:${payload.id}`;
}

function rawEventCreatedAt(rawEvent?: string): number {
  if (!rawEvent) return 0;
  try {
    return parseNostrEvent(JSON.parse(rawEvent)).created_at;
  } catch {
    return 0;
  }
}

function mergeRelayUrls(current: string[], relay: string): string[] {
  return [...new Set([...current, relay])];
}

async function upsertSyncedRecord<T extends CacheablePayload>(
  table: Table<SyncedPublicRecord<T>, string>,
  item: NostrReviewItem,
  allowlist: CommunityAllowlistEntry[],
  payload: T
): Promise<PublicCacheWriteResult> {
  const incoming = syncedRecordFromReviewItem(item, allowlist, payload);
  const coordinate = reviewItemCoordinate(item, payload);
  const existing = (await table.toArray()).find((record) => syncedCoordinate(record) === coordinate);
  if (!existing) {
    await table.put(incoming);
    return 'imported';
  }

  const relayUrls = mergeRelayUrls(existing.relayUrls, item.relay);
  if (rawEventCreatedAt(item.rawEvent) <= rawEventCreatedAt(existing.rawEvent)) {
    const discoveryScope =
      existing.discoveryScope === 'agoramesh-native' || incoming.discoveryScope === 'agoramesh-native'
        ? 'agoramesh-native'
        : existing.discoveryScope ?? incoming.discoveryScope;
    if (relayUrls.length !== existing.relayUrls.length || discoveryScope !== existing.discoveryScope) {
      await table.put({ ...existing, relayUrls, discoveryScope });
    }
    return 'unchanged';
  }

  await table.put({
    ...incoming,
    id: existing.id,
    trusted: existing.trusted,
    hidden: existing.hidden,
    relayUrls
  });
  return 'updated';
}

async function upsertExistingSyncedListing(
  item: NostrReviewItem,
  allowlist: CommunityAllowlistEntry[],
  listing: Listing
): Promise<PublicCacheWriteResult> {
  const incoming = syncedRecordFromReviewItem(item, allowlist, listing);
  const coordinate = reviewItemCoordinate(item, listing);
  const existing = (await db.syncedListings.toArray()).find((record) => syncedCoordinate(record) === coordinate);
  if (!existing) return 'skipped';

  const relayUrls = mergeRelayUrls(existing.relayUrls, item.relay);
  if (rawEventCreatedAt(item.rawEvent) <= rawEventCreatedAt(existing.rawEvent)) {
    const discoveryScope =
      existing.discoveryScope === 'agoramesh-native' || incoming.discoveryScope === 'agoramesh-native'
        ? 'agoramesh-native'
        : existing.discoveryScope ?? incoming.discoveryScope;
    if (relayUrls.length !== existing.relayUrls.length || discoveryScope !== existing.discoveryScope) {
      await db.syncedListings.put({ ...existing, relayUrls, discoveryScope });
    }
    return 'unchanged';
  }

  await db.syncedListings.put({
    ...incoming,
    id: existing.id,
    trusted: existing.trusted,
    hidden: existing.hidden,
    relayUrls
  });
  return 'updated';
}

async function cachePublicReviewItem(
  item: NostrReviewItem,
  allowlist: CommunityAllowlistEntry[],
  passphrase = ''
): Promise<PublicCacheWriteResult> {
  const payload = (await importablePayloadFromReviewItem(item, passphrase)) as CacheablePayload;
  if (item.kind === AGORAMESH_EVENT_KINDS.profile) return upsertSyncedRecord(db.syncedProfiles, item, allowlist, payload as PublicProfile);
  if (item.kind === AGORAMESH_EVENT_KINDS.listing) {
    const listing = listingSchema.parse(payload);

    if (!isActiveMarketplaceListing(listing)) {
      return upsertExistingSyncedListing(item, allowlist, listing);
    }

    return upsertSyncedRecord(db.syncedListings, item, allowlist, listing);
  }
  if (item.kind === AGORAMESH_EVENT_KINDS.mediator) return upsertSyncedRecord(db.syncedMediators, item, allowlist, payload as MediatorProfile);
  if (item.kind === AGORAMESH_EVENT_KINDS.reputation) return upsertSyncedRecord(db.syncedAttestations, item, allowlist, payload as ReputationAttestation);
  if (item.kind === AGORAMESH_EVENT_KINDS.disputeOutcome) return upsertSyncedRecord(db.syncedDisputeOutcomes, item, allowlist, payload as PublicDisputeOutcome);
  if (item.kind === AGORAMESH_EVENT_KINDS.communityList) return upsertSyncedRecord(db.syncedCommunityLists, item, allowlist, payload as CommunityCurationList);
  throw new Error('This event kind is not cacheable.');
}

function navFromRoute(value: string): Page {
  if (value.startsWith('listing/local/') || value.startsWith('listing/synced/')) return 'listing';
  if (value === 'agreements' || value === 'disputes') return 'trade';
  if (value === 'listing' || value === 'browse:create' || value === 'browse:mine') return 'browse';
  if (value === 'profile:public') return 'profile';
  if (value === 'settings:relays' || value === 'settings:review' || value === 'settings:backup' || value === 'settings:inbox') return 'settings';
  const pages: Page[] = ['home', 'browse', 'listing', 'profile', 'inbox', 'mediators', 'trade', 'reputation', 'settings'];
  return pages.includes(value as Page) ? (value as Page) : 'home';
}

function navFromHash(): Page {
  return navFromRoute(window.location.hash.replace('#', ''));
}

function listingRouteFromHash(): { source: 'local' | 'synced'; id: string } | undefined {
  const value = window.location.hash.replace('#', '');
  const [page, source, ...idParts] = value.split('/');
  if (page !== 'listing' || (source !== 'local' && source !== 'synced') || idParts.length === 0) return undefined;
  return { source, id: decodeURIComponent(idParts.join('/')) };
}

function browseTabFromHash(): BrowseTab {
  const value = window.location.hash.replace('#', '');
  if (value === 'listing' || value === 'browse:create') return 'create';
  if (value === 'browse:mine') return 'mine';
  return 'discover';
}

function settingsTabFromHash(): SettingsTab {
  const value = window.location.hash.replace('#', '');
  if (value === 'settings:review') return 'diagnostics';
  if (value === 'settings:inbox') return 'diagnostics';
  if (value === 'settings:relays') return 'relays';
  if (value === 'settings:backup') return 'backup';
  return 'account';
}

function listingSourceValue(ref: ListingSourceRef): string {
  return ref.source === 'synced' ? `synced:${ref.recordId ?? ref.id}` : ref.id;
}

function listingRefKey(ref: ListingSourceRef): string {
  return ref.source === 'synced' ? `synced-${ref.recordId ?? ref.id}` : `local-${ref.id}`;
}

function listingRouteForRef(ref: ListingSourceRef): ListingRoute {
  return ref.source === 'synced'
    ? `listing/synced/${encodeURIComponent(ref.recordId ?? ref.id)}`
    : `listing/local/${encodeURIComponent(ref.id)}`;
}

function stringResultField(result: Record<string, unknown> | undefined, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = result?.[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function numberResultField(result: Record<string, unknown> | undefined, ...names: string[]): number | undefined {
  for (const name of names) {
    const value = result?.[name];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.floor(value);
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed >= 0) return Math.floor(parsed);
    }
  }
  return undefined;
}

function formatReviewScore(score?: number): string {
  if (!score) return 'Unscored';
  return `${score.toFixed(1)} stars`;
}

function reputationEventTags(attestation: ReputationAttestation): string[][] {
  const tags: string[][] = [
    ['d', attestation.id],
    ['p', attestation.subjectPublicKey],
    ...(attestation.agreementHash ? [['agreement', attestation.agreementHash]] : []),
    ...(attestation.listingCoordinate ? [['a', attestation.listingCoordinate]] : []),
    ...(attestation.score ? [['score', String(attestation.score)]] : [])
  ];
  return tags;
}

function paidAttemptFromNwcResult(attempt: LightningPaymentAttempt, result: NwcRequestResult): LightningPaymentAttempt {
  const walletResult = result.payload.result;
  return {
    ...attempt,
    status: 'paid',
    nwcRequestEventId: result.request.id,
    nwcResponseEventId: result.response.id,
    nwcRelayUrl: result.relayUrl,
    nwcResult: JSON.stringify(result.payload),
    preimage: stringResultField(walletResult, 'preimage', 'payment_preimage'),
    paymentHash: stringResultField(walletResult, 'payment_hash', 'paymentHash') ?? attempt.paymentHash,
    feesPaidMsats: numberResultField(walletResult, 'fees_paid', 'fees_paid_msat', 'feesPaidMsats'),
    statusDetail: stringResultField(walletResult, 'message'),
    error: undefined,
    updatedAt: nowIso()
  };
}

function supportReceiptForPublicKey(publicKey: string | undefined, receipts: OperatorSupportReceipt[]): OperatorSupportReceipt | undefined {
  if (!publicKey) return undefined;
  const normalized = publicKey.toLowerCase();
  return receipts
    .filter((receipt) => receipt.payerPublicKey.toLowerCase() === normalized)
    .sort((left, right) => right.validatedAt.localeCompare(left.validatedAt))[0];
}

function supportFilterMatches(publicKey: string, receipts: OperatorSupportReceipt[], filter: SupportFilter): boolean {
  if (filter === 'all') return true;
  const supported = Boolean(supportReceiptForPublicKey(publicKey, receipts));
  return filter === 'supporters' ? supported : !supported;
}

function supportFilterLabel(filter: SupportFilter, t: (key: string) => string): string {
  if (filter === 'supporters') return t('support.supporters');
  if (filter === 'non-supporters') return t('support.nonSupporters');
  return t('support.all');
}

function listingCoordinateForZap(listing: Listing): string {
  return nostrCoordinate(AGORAMESH_EVENT_KINDS.listing, listing.authorPublicKey, listing.id);
}

function listingZapReceiptsForListing(listing: Listing, receipts: ListingZapReceipt[]): ListingZapReceipt[] {
  const coordinate = listingCoordinateForZap(listing);
  return receipts
    .filter((receipt) => receipt.listingCoordinate === coordinate)
    .sort((left, right) => right.paidAt.localeCompare(left.paidAt));
}

function summarizeListingReceipts(listing: Listing, publishReceipts: PublishReceipt[]): PublishReceiptSummary {
  const receipts = publishReceipts.filter((receipt) => receipt.objectType === 'listing' && receipt.objectId === listing.id);
  return {
    accepted: receipts.filter((receipt) => receipt.status === 'accepted').length,
    failed: receipts.filter((receipt) => receipt.status === 'failed').length,
    pending: receipts.filter((receipt) => receipt.status === 'pending').length,
    latest: receipts[0]
  };
}

function isListingExpired(listing: Listing): boolean {
  return new Date(listing.expiresAt).getTime() < Date.now();
}

function isActiveMarketplaceListing(listing: Listing): boolean {
  return listing.status === 'active' && !isListingExpired(listing);
}

function publicKeysMatch(left?: string, right?: string): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function reviewItemContainsExpiredListing(item: NostrReviewItem): boolean {
  if (item.kind !== AGORAMESH_EVENT_KINDS.listing) return false;
  try {
    const rawEvent: unknown = JSON.parse(item.rawEvent);
    const event = parseNostrEvent(rawEvent);
    const parsed = listingSchema.safeParse(parseAgoraEventPayload(event));
    return parsed.success && isListingExpired(parsed.data);
  } catch {
    try {
      const parsed = listingSchema.safeParse(JSON.parse(item.payloadPreview));
      return parsed.success && isListingExpired(parsed.data);
    } catch {
      return false;
    }
  }
}

export function App(): ReactNode {
  const { t, language, setLanguage } = useI18n();
  const [page, setPage] = useState<Page>(navFromHash);
  const [identity, setIdentity] = useState<IdentityRecord | undefined>();
  const [profile, setProfile] = useState<PublicProfile | undefined>();
  const [listings, setListings] = useState<Listing[]>([]);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [agreementReceipts, setAgreementReceipts] = useState<AgreementAcceptanceReceipt[]>([]);
  const [mediators, setMediators] = useState<MediatorProfile[]>([]);
  const [disputes, setDisputes] = useState<DisputeCase[]>([]);
  const [attestations, setAttestations] = useState<ReputationAttestation[]>([]);
  const [relays, setRelays] = useState<RelayConfig[]>([]);
  const [reviewItems, setReviewItems] = useState<NostrReviewItem[]>([]);
  const [syncedProfiles, setSyncedProfiles] = useState<SyncedPublicRecord<PublicProfile>[]>([]);
  const [syncedListings, setSyncedListings] = useState<SyncedPublicRecord<Listing>[]>([]);
  const [syncedMediators, setSyncedMediators] = useState<SyncedPublicRecord<MediatorProfile>[]>([]);
  const [syncedAttestations, setSyncedAttestations] = useState<SyncedPublicRecord<ReputationAttestation>[]>([]);
  const [syncedDisputeOutcomes, setSyncedDisputeOutcomes] = useState<SyncedPublicRecord<PublicDisputeOutcome>[]>([]);
  const [communityLists, setCommunityLists] = useState<CommunityCurationList[]>([]);
  const [syncedCommunityLists, setSyncedCommunityLists] = useState<SyncedPublicRecord<CommunityCurationList>[]>([]);
  const [relayHealth, setRelayHealth] = useState<RelayHealth[]>([]);
  const [publishReceipts, setPublishReceipts] = useState<PublishReceipt[]>([]);
  const [nostrContactReceipts, setNostrContactReceipts] = useState<NostrContactReceipt[]>([]);
  const [nostrMessages, setNostrMessages] = useState<NostrMessageRecord[]>([]);
  const [nostrMessageThreads, setNostrMessageThreads] = useState<NostrMessageThread[]>([]);
  const [nostrInboxCursors, setNostrInboxCursors] = useState<NostrInboxCursor[]>([]);
  const [lightningPaymentAttempts, setLightningPaymentAttempts] = useState<LightningPaymentAttempt[]>([]);
  const [operatorSupportReceipts, setOperatorSupportReceipts] = useState<OperatorSupportReceipt[]>([]);
  const [listingZapReceipts, setListingZapReceipts] = useState<ListingZapReceipt[]>([]);
  const [nwcConnections, setNwcConnections] = useState<NwcConnection[]>([]);
  const [unlockedNwcSecrets, setUnlockedNwcSecrets] = useState<Record<string, string>>({});
  const [allowlist, setAllowlist] = useState<CommunityAllowlistEntry[]>([]);
  const [syncSettings, setSyncSettings] = useState<SyncSettings>(defaultSyncSettings);
  const [blossomServers, setBlossomServers] = useState<BlossomServerConfig[]>([]);
  const [syncStatuses, setSyncStatuses] = useState<SyncStatus[]>([]);
  const [relayFetchSummaries, setRelayFetchSummaries] = useState<RelayFetchSummary[]>([]);
  const [nostrSigner, setNostrSigner] = useState<NostrSignerState>(() => detectNostrSigner());
  const [privateKeyHex, setPrivateKeyHex] = useState('');
  const [identityBackedUp, setIdentityBackedUp] = useState(false);
  const [notice, setNotice] = useState('');
  const [nextStep, setNextStep] = useState<NextStep | undefined>();
  const [tradeListingRef, setTradeListingRef] = useState<ListingSourceRef | undefined>();
  const [reputationDraftRequest, setReputationDraftRequest] = useState<ReputationDraftRequest | undefined>();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [routeHash, setRouteHash] = useState(() => window.location.hash.replace('#', ''));
  const pageLabels: Record<Page, string> = {
    home: t('nav.home'),
    browse: t('nav.browse'),
    listing: t('listing.details'),
    profile: t('nav.profile'),
    inbox: t('nav.inbox'),
    mediators: t('nav.mediators'),
    trade: t('nav.trade'),
    reputation: t('nav.reputation'),
    settings: t('nav.settings')
  };
  const primaryNavItems: { key: string; label: string; route: RouteTarget; icon: ReactNode }[] = [
    { key: 'home', label: t('nav.home'), route: 'home', icon: <Home size={18} aria-hidden="true" /> },
    { key: 'browse', label: t('nav.browse'), route: 'browse', icon: <ShoppingBag size={18} aria-hidden="true" /> },
    { key: 'post', label: t('nav.listing'), route: 'browse:create', icon: <PlusCircle size={18} aria-hidden="true" /> },
    { key: 'profile', label: t('nav.profile'), route: 'profile', icon: <UserRound size={18} aria-hidden="true" /> },
    { key: 'inbox', label: t('nav.inbox'), route: 'inbox', icon: <Radio size={18} aria-hidden="true" /> }
  ];
  const settingsNavItem = { key: 'settings', label: t('nav.settings'), route: 'settings' as RouteTarget, icon: <SettingsIcon size={18} aria-hidden="true" /> };
  const mobileNavItems = [...primaryNavItems, settingsNavItem];
  const secondaryNavItems: { key: string; label: string; route: RouteTarget; icon: ReactNode }[] = [];
  const activeNavKey = routeHash === 'browse:create' ? 'post' : page === 'listing' || page === 'browse' ? 'browse' : page;
  const renderNavButton = (item: { key: string; label: string; route: RouteTarget; icon: ReactNode }, compact = false): ReactNode => {
    const active = activeNavKey === item.key;
    return (
      <button
        aria-label={compact ? t('nav.mobileItem').replace('{label}', item.label) : undefined}
        aria-current={active ? 'page' : undefined}
        className={active ? 'active' : ''}
        key={item.key}
        onClick={() => go(item.route)}
        title={compact ? item.label : undefined}
        type="button"
      >
        {item.icon}
        <span>{item.label}</span>
      </button>
    );
  };

  const reload = async (): Promise<void> => {
    await ensureDefaults();
    const nextIdentity = await db.identity.toCollection().first();
    setIdentity(nextIdentity);
    setIdentityBackedUp(readBackupConfirmed(nextIdentity));
    setProfile(await db.profile.toCollection().first());
    setListings((await db.listings.toArray()).sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
    setAgreements((await db.agreements.toArray()).sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
    setAgreementReceipts((await db.agreementReceipts.toArray()).sort((left, right) => right.acceptedAt.localeCompare(left.acceptedAt)));
    setMediators(await db.mediators.toArray());
    setDisputes((await db.disputes.toArray()).sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
    setAttestations((await db.attestations.toArray()).sort((left, right) => right.timestamp - left.timestamp));
    setRelays(await db.relays.toArray());
    setReviewItems((await db.nostrReview.toArray()).sort((left, right) => right.receivedAt.localeCompare(left.receivedAt)));
    setSyncedProfiles((await db.syncedProfiles.toArray()).sort((left, right) => right.importedAt.localeCompare(left.importedAt)));
    setSyncedListings((await db.syncedListings.toArray()).sort((left, right) => right.importedAt.localeCompare(left.importedAt)));
    setSyncedMediators((await db.syncedMediators.toArray()).sort((left, right) => right.importedAt.localeCompare(left.importedAt)));
    setSyncedAttestations((await db.syncedAttestations.toArray()).sort((left, right) => right.importedAt.localeCompare(left.importedAt)));
    setSyncedDisputeOutcomes((await db.syncedDisputeOutcomes.toArray()).sort((left, right) => right.importedAt.localeCompare(left.importedAt)));
    setCommunityLists((await db.communityLists.toArray()).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
    setSyncedCommunityLists((await db.syncedCommunityLists.toArray()).sort((left, right) => right.importedAt.localeCompare(left.importedAt)));
    setRelayHealth(await db.relayHealth.toArray());
    setPublishReceipts((await db.publishReceipts.toArray()).sort((left, right) => right.at.localeCompare(left.at)));
    setNostrContactReceipts((await db.nostrContactReceipts.toArray()).sort((left, right) => right.sentAt.localeCompare(left.sentAt)));
    setNostrMessages((await db.nostrMessages.toArray()).sort((left, right) => right.messageCreatedAt.localeCompare(left.messageCreatedAt)));
    setNostrMessageThreads((await db.nostrMessageThreads.toArray()).sort((left, right) => right.lastMessageAt.localeCompare(left.lastMessageAt)));
    setNostrInboxCursors(await db.nostrInboxCursors.toArray());
    setLightningPaymentAttempts((await db.lightningPaymentAttempts.toArray()).sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
    setOperatorSupportReceipts((await db.operatorSupportReceipts.toArray()).sort((left, right) => right.validatedAt.localeCompare(left.validatedAt)));
    setListingZapReceipts((await db.listingZapReceipts.toArray()).sort((left, right) => right.validatedAt.localeCompare(left.validatedAt)));
    setNwcConnections((await db.nwcConnections.toArray()).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
    setAllowlist(await db.allowlist.toArray());
    setSyncSettings((await db.syncSettings.get('default')) ?? defaultSyncSettings);
    setBlossomServers(await db.blossomServers.toArray());
  };

  useEffect(() => {
    void reload();
    const onHash = (): void => {
      const nextRoute = window.location.hash.replace('#', '');
      setRouteHash(nextRoute);
      setPage(navFromRoute(nextRoute));
    };
    const onFocus = (): void => {
      const next = detectNostrSigner();
      setNostrSigner((current) => (current.connected ? current : next));
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const go = (next: RouteTarget): void => {
    window.location.hash = next;
    setRouteHash(next);
    setPage(navFromRoute(next));
  };

  const showNotice = (message: string, next?: NextStep): void => {
    setNotice(message);
    setNextStep(next);
  };

  useEffect(() => {
    if (!notice && !nextStep) return undefined;
    const timeout = window.setTimeout(() => {
      setNotice('');
      setNextStep(undefined);
    }, nextStep ? 8000 : 5000);
    return () => window.clearTimeout(timeout);
  }, [notice, nextStep]);

  useEffect(() => {
    if (!syncSettings.liveSyncEnabled || relays.length === 0) return undefined;
    const sinceByRelay = Object.fromEntries(relayHealth.map((entry) => [entry.url, isoToNostrTimestamp(entry.lastConnectedAt)]));
    const stop = subscribeToAgoraEvents(
      relays,
      (item) => {
        void (async () => {
          const existing = await db.nostrReview.where('eventId').equals(item.eventId).first();
          if (!existing) {
            await db.nostrReview.put(item);
          }
          const health = (await db.relayHealth.get(item.relay)) ?? {
            url: item.relay,
            enabled: true,
            eventsReceived: 0,
            eventsPublished: 0,
            consecutiveFailures: 0
          };
          await db.relayHealth.put({
            ...health,
            lastConnectedAt: nowIso(),
            lastError: undefined,
            eventsReceived: health.eventsReceived + 1,
            consecutiveFailures: 0
          });
          await reload();
        })();
      },
      sinceByRelay,
      (status) => {
        void (async () => {
          const health = (await db.relayHealth.get(status.relay)) ?? {
            url: status.relay,
            enabled: true,
            eventsReceived: 0,
            eventsPublished: 0,
            consecutiveFailures: 0
          };
          await db.relayHealth.put({
            ...health,
            lastConnectedAt: status.ok ? status.at : health.lastConnectedAt,
            lastError: status.ok ? undefined : status.message,
            consecutiveFailures: status.ok ? 0 : health.consecutiveFailures + 1
          });
          await reload();
        })();
      },
      syncSettings.listingDiscoveryScope
    );
    return stop;
  }, [syncSettings.liveSyncEnabled, syncSettings.listingDiscoveryScope, relays, relayHealth]);

  const publishEvent = async (
    objectType: PublishObjectType,
    objectId: string,
    eventFactory: (key: string) => NostrEvent | Promise<NostrEvent>,
    signerFactory?: () => NostrUnsignedEvent | Promise<NostrUnsignedEvent>,
    expectedPublicKey?: string
  ): Promise<void> => {
    let event: NostrEvent;
    const signingPublicKey = activeSigningPublicKey(identity, nostrSigner, privateKeyHex, expectedPublicKey);
    if (nostrSigner.connected && nostrSigner.publicKey === signingPublicKey && signerFactory && expectedPublicKey) {
      try {
        event = await signWithNostrSigner(await signerFactory(), expectedPublicKey);
      } catch (error) {
        const message = error instanceof Error ? error.message : t('signer.rejected');
        setNostrSigner((current) => ({ ...current, lastError: message }));
        showNotice(message);
        return;
      }
    } else if (identityCanUseLocalUnlock(identity) && privateKeyHex && signingPublicKey === identity?.publicKey) {
      event = await eventFactory(privateKeyHex);
    } else if (expectedPublicKey && nostrSigner.connected && nostrSigner.publicKey && nostrSigner.publicKey.toLowerCase() !== expectedPublicKey.toLowerCase()) {
      showNotice(t('signer.pubkeyMismatch'));
      return;
    } else {
      showNotice(identity?.keySource === 'nostr-extension' ? t('identity.extensionReconnect') : t('identity.decrypt'));
      return;
    }
    if (!nostrSigner.connected && identity && !identityBackedUp) {
      showNotice(t('identity.backupBeforePublish'));
      return;
    }
    const statuses = await publishToRelays(event, relays);
    await db.publishReceipts.bulkPut(publishReceiptsFromStatuses(objectType, objectId, event.id, statuses));
    await Promise.all(
      statuses.map(async (status) => {
        const existing = (await db.relayHealth.get(status.relay)) ?? {
          url: status.relay,
          enabled: true,
          eventsReceived: 0,
          eventsPublished: 0,
          consecutiveFailures: 0
        };
        await db.relayHealth.put({
          ...existing,
          lastConnectedAt: status.ok ? status.at : existing.lastConnectedAt,
          lastError: status.ok ? undefined : status.message,
          eventsPublished: status.ok ? existing.eventsPublished + 1 : existing.eventsPublished,
          consecutiveFailures: status.ok ? 0 : existing.consecutiveFailures + 1
        });
      })
    );
    setSyncStatuses(statuses);
    showNotice(t('notice.publishComplete'));
    await reload();
  };

  const saveListingDiscoveryScope = async (listingDiscoveryScope: ListingDiscoveryScope): Promise<void> => {
    const next = { ...syncSettings, listingDiscoveryScope };
    await db.syncSettings.put(next);
    setSyncSettings(next);
  };

  const fetchMarketplacePublicData = async (listingDiscoveryScope: ListingDiscoveryScope): Promise<MarketplaceFetchSummary> => {
    const startedAt = Date.now();
    const marketplaceLookbackDays = 180;
    const marketplaceSince = Math.floor((Date.now() - marketplaceLookbackDays * 86_400_000) / 1000);

    const sinceByRelay = Object.fromEntries(
      relays
        .filter((relay) => relay.enabled)
        .map((relay) => [relay.url, marketplaceSince])
    );

    const rawFetched = await fetchAgoraEventsFromRelays(relays, sinceByRelay, listingDiscoveryScope);
    const fetched = dedupeReviewItems(rawFetched);
    const summary: MarketplaceFetchSummary = {
      imported: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      invalid: 0,
      relaysQueried: relays.filter((relay) => relay.enabled).length
    };

    for (const item of fetched) {
      if (reviewItemHasEncryptedContent(item)) {
        summary.skipped += 1;
        continue;
      }
      if (item.importStatus !== 'pending' || !item.signatureValid) {
        if (item.signatureValid) summary.skipped += 1;
        else summary.invalid += 1;
        continue;
      }
      try {
        const result = await cachePublicReviewItem(item, allowlist);
        summary[result] += 1;
      } catch {
        summary.invalid += 1;
      }
    }

    if (operatorSupport.enabled) {
      try {
        await refreshOperatorSupportReceipts();
      } catch {
        // Support badge refresh should not fail the normal public marketplace fetch.
      }
    }

    setRelayFetchSummaries(summarizeRelayFetch(relays, rawFetched, [], startedAt));
    await Promise.all(
      relays
        .filter((relay) => relay.enabled)
        .map(async (relay) => {
          const health = (await db.relayHealth.get(relay.url)) ?? {
            url: relay.url,
            enabled: relay.enabled,
            eventsReceived: 0,
            eventsPublished: 0,
            consecutiveFailures: 0
          };
          const received = rawFetched.filter((item) => item.relay === relay.url).length;
          const invalid = rawFetched.filter((item) => item.relay === relay.url && item.importStatus === 'invalid' && !item.signatureValid).length;
          await db.relayHealth.put({
            ...health,
            enabled: relay.enabled,
            lastConnectedAt: invalid === 0 ? nowIso() : health.lastConnectedAt,
            lastError: invalid > 0 && received === invalid ? t('sync.fetchInvalid') : undefined,
            latencyMs: Date.now() - startedAt,
            eventsReceived: health.eventsReceived + received,
            consecutiveFailures: invalid > 0 && received === invalid ? health.consecutiveFailures + 1 : 0
          });
        })
    );
    await reload();
    return summary;
  };

  const setSyncedRecordHidden = async (kind: number, id: string, hidden: boolean): Promise<void> => {
    if (kind === AGORAMESH_EVENT_KINDS.profile) await db.syncedProfiles.update(id, { hidden });
    if (kind === AGORAMESH_EVENT_KINDS.listing) await db.syncedListings.update(id, { hidden });
    if (kind === AGORAMESH_EVENT_KINDS.mediator) await db.syncedMediators.update(id, { hidden });
    if (kind === AGORAMESH_EVENT_KINDS.reputation) await db.syncedAttestations.update(id, { hidden });
    if (kind === AGORAMESH_EVENT_KINDS.disputeOutcome) await db.syncedDisputeOutcomes.update(id, { hidden });
    if (kind === AGORAMESH_EVENT_KINDS.communityList) await db.syncedCommunityLists.update(id, { hidden });
    showNotice(hidden ? t('sync.hiddenSaved') : t('sync.visibleSaved'));
    await reload();
  };

  const connectSigner = async (): Promise<NostrSignerState> => {
    const next = await connectNostrSigner();
    setNostrSigner(next);
    showNotice(next.connected ? t('signer.connected') : next.lastError ?? t('signer.unavailable'));
    return next;
  };

  const localProfileForSigner = async (publicKey: string): Promise<PublicProfile | undefined> => {
    const normalized = publicKey.toLowerCase();
    const matching = (await db.syncedProfiles.toArray())
      .filter(
        (record) =>
          !record.hidden &&
          record.authorPublicKey.toLowerCase() === normalized &&
          record.payload.publicKey.toLowerCase() === normalized
      )
      .sort((left, right) => right.importedAt.localeCompare(left.importedAt));
    return matching[0]?.payload;
  };

  const restoreOwnedSyncedRecordsForSigner = async (publicKey: string): Promise<SignerRestoreSummary> => {
    const normalized = publicKey.toLowerCase();
    const summary: SignerRestoreSummary = { profile: 0, listings: 0, mediators: 0, kept: 0 };
    const matchingProfile = await localProfileForSigner(publicKey);
    if (matchingProfile) {
      const localProfile = await db.profile.toCollection().first();
      if (!localProfile || localProfile.publicKey.toLowerCase() !== normalized || payloadIsNewer(matchingProfile, localProfile)) {
        await db.profile.clear();
        await db.profile.put(matchingProfile);
        summary.profile += 1;
      } else {
        summary.kept += 1;
      }
    }

    const authoredListings = (await db.syncedListings.toArray()).filter(
      (record) =>
        !record.hidden &&
        record.authorPublicKey.toLowerCase() === normalized &&
        String(record.payload.authorPublicKey ?? '').toLowerCase() === normalized
    );
    for (const record of authoredListings) {
      const parsed = listingSchema.safeParse(record.payload);
      if (!parsed.success) {
        summary.kept += 1;
        continue;
      }
      const listing = parsed.data;
      const existing = await db.listings.get(listing.id);
      if (!existing) {
        await db.listings.put(listing);
        summary.listings += 1;
      } else if (payloadIsNewer(listing, existing)) {
        await db.listings.put(listing);
        summary.listings += 1;
      } else {
        summary.kept += 1;
      }
    }

    const authoredMediators = (await db.syncedMediators.toArray()).filter(
      (record) =>
        !record.hidden &&
        record.authorPublicKey.toLowerCase() === normalized &&
        String(record.payload.publicKey ?? '').toLowerCase() === normalized
    );
    for (const record of authoredMediators) {
      const parsed = mediatorProfileSchema.safeParse(record.payload);
      if (!parsed.success) {
        summary.kept += 1;
        continue;
      }
      const mediator = parsed.data;
      const existingById = await db.mediators.get(mediator.id);
      const existingByPublicKey = existingById
        ? undefined
        : (await db.mediators.toArray()).find((entry) => entry.publicKey.toLowerCase() === normalized);
      const existing = existingById ?? existingByPublicKey;
      if (!existing) {
        await db.mediators.put(mediator);
        summary.mediators += 1;
      } else if (payloadIsNewer(mediator, existing)) {
        if (existing.id !== mediator.id) await db.mediators.delete(existing.id);
        await db.mediators.put(mediator);
        summary.mediators += 1;
      } else {
        summary.kept += 1;
      }
    }

    return summary;
  };

  const useConnectedSignerAsIdentity = async (displayName?: string, signerOverride?: NostrSignerState): Promise<void> => {
    const next = signerOverride?.connected && signerOverride.publicKey ? signerOverride : nostrSigner.connected && nostrSigner.publicKey ? nostrSigner : await connectSigner();
    if (!next.connected || !next.publicKey) return;
    if (identity && identity.publicKey.toLowerCase() !== next.publicKey.toLowerCase() && !window.confirm(t('identity.switchConfirm'))) return;
    const matchingProfile = await localProfileForSigner(next.publicKey);
    await db.identity.clear();
    await db.identity.put(
      createExtensionIdentity(next.publicKey, matchingProfile?.displayName || displayName || profile?.displayName || identity?.displayName || t('identity.extensionDisplayName'))
    );
    const restored = await restoreOwnedSyncedRecordsForSigner(next.publicKey);
    const restoredCount = signerRestoreCount(restored);
    setPrivateKeyHex('');
    showNotice(
      restoredCount > 0
        ? t('notice.extensionIdentityRecordsRestored').replace('{count}', String(restoredCount))
        : matchingProfile
          ? t('notice.extensionIdentityProfileSaved')
          : t('notice.extensionIdentitySaved'),
      restoredCount === 0
        ? {
            body: t('next.fetchOwnRecords'),
            actions: [{ label: t('next.openBrowse'), page: 'browse' }]
          }
        : undefined
    );
    await reload();
  };

  const sendNostrContactIntro = async (args: SendNostrContactIntroArgs): Promise<NostrContactReceipt> => {
    const recipient = normalizeNostrContact(args.recipientPublicKey);
    if (!recipient) throw new Error(t('nostrContact.invalidRecipient'));
    if (!identity) throw new Error(t('nostrContact.identityRequired'));
    if (args.message.trim().length === 0) throw new Error(t('nostrContact.messageRequired'));
    if (args.message.trim().length > NOSTR_INTRO_MESSAGE_LIMIT) throw new Error(t('nostrContact.messageTooLong'));
    if (relays.filter((relay) => relay.enabled).length === 0) throw new Error(t('nostrContact.relaysRequired'));

    const context: NostrIntroContext | undefined = args.includeContext
      ? { type: args.contextType, id: args.contextId, title: args.contextTitle }
      : undefined;
    const senderPublicKey = identity.publicKey.toLowerCase();
    const localSigningKey = activeSigningPublicKey(identity, nostrSigner, privateKeyHex, senderPublicKey);
    let events: NostrEvent[];

    if (identityCanUseLocalUnlock(identity) && privateKeyHex && localSigningKey) {
      events = createLocalNostrIntroEvents({
        senderPrivateKeyHex: privateKeyHex,
        recipientPublicKey: recipient.publicKey,
        message: args.message,
        context
      });
    } else {
      const signer = nostrSigner.connected && nostrSigner.publicKey ? nostrSigner : await connectSigner();
      if (!signer.connected || !signer.publicKey || signer.publicKey.toLowerCase() !== senderPublicKey) {
        throw new Error(t('nostrContact.signerRequired'));
      }
      if (!signerSupportsNip44Encryption()) {
        throw new Error(t('nostrContact.signerNoNip44'));
      }
      events = await createExtensionNostrIntroEvents({
        senderPublicKey,
        recipientPublicKey: recipient.publicKey,
        message: args.message,
        context,
        encryptWithSigner: encryptWithNostrSigner,
        signWithSigner: (event) => signWithNostrSigner(event, senderPublicKey)
      });
    }

    const eventStatuses = await Promise.all(events.map((event) => publishToRelays(event, relays)));
    const receipt: NostrContactReceipt = {
      id: newId('nostr_contact'),
      senderPublicKey,
      recipientPublicKey: recipient.publicKey,
      recipientNpub: recipient.npub,
      contextType: args.contextType,
      contextId: args.contextId,
      contextTitle: args.contextTitle,
      eventIds: events.map((event) => event.id),
      relayReceipts: eventStatuses.flat(),
      status: nostrReceiptStatusFromRelayResults(eventStatuses),
      sentAt: nowIso()
    };
    await db.nostrContactReceipts.put(receipt);
    if (args.cachePassphrase && args.cachePassphrase.length >= 10) {
      const selfCopy = events.find((event) => event.tags.some((tag) => tag[0] === 'p' && tag[1]?.toLowerCase() === senderPublicKey)) ?? events[0];
      if (selfCopy) {
        const plaintext = nostrIntroPlaintext(args.message, context);
        const subject = context?.title;
        const contextId = context?.id;
        const counterpartPublicKey = recipient.publicKey.toLowerCase();
        const existingThreads = await db.nostrMessageThreads.where('ownerPublicKey').equals(senderPublicKey).toArray();
        const exactThreadKey = nostrThreadKey(senderPublicKey, counterpartPublicKey, subject, contextId);
        const matchingThread =
          existingThreads.find((thread) => thread.counterpartPublicKey.toLowerCase() === counterpartPublicKey && thread.threadKey === exactThreadKey) ??
          existingThreads
            .filter(
              (thread) =>
                thread.counterpartPublicKey.toLowerCase() === counterpartPublicKey &&
                (!subject || thread.subject?.trim().toLowerCase() === subject.trim().toLowerCase())
            )
            .sort((left, right) => right.lastMessageAt.localeCompare(left.lastMessageAt))[0];
        const threadKey = matchingThread?.threadKey ?? exactThreadKey;
        const record: NostrMessageRecord = {
          id: `nostr_msg_${selfCopy.id}`,
          ownerPublicKey: senderPublicKey,
          eventId: selfCopy.id,
          wrapPublicKey: selfCopy.pubkey,
          senderPublicKey,
          recipientPublicKey: senderPublicKey,
          counterpartPublicKey,
          direction: 'outgoing',
          threadKey,
          subject: matchingThread?.subject ?? subject,
          contextType: context?.type ?? matchingThread?.contextType,
          contextId: matchingThread?.contextId ?? contextId,
          wrapCreatedAt: messageIso(selfCopy.created_at),
          messageCreatedAt: nowIso(),
          receivedAt: nowIso(),
          relayUrls: relays.filter((relay) => relay.enabled).map((relay) => relay.url),
          rawEvent: JSON.stringify(selfCopy),
          encryptedPlaintext: await encryptLocalSecret(plaintext, args.cachePassphrase),
          read: true,
          archived: false
        };
        await db.nostrMessages.put(record);
        await rebuildNostrThread(threadKey);
      }
    }
    setNostrContactReceipts((current) => [receipt, ...current.filter((entry) => entry.id !== receipt.id)]);
    showNotice(receipt.status === 'failed' ? t('nostrContact.sentFailed') : t('nostrContact.sent'));
    return receipt;
  };

  const rebuildNostrThread = async (threadKey: string): Promise<void> => {
    const messages = (await db.nostrMessages.where('threadKey').equals(threadKey).toArray()).sort((left, right) =>
      right.messageCreatedAt.localeCompare(left.messageCreatedAt)
    );
    const newest = messages[0];
    if (!newest) return;
    const thread: NostrMessageThread = {
      id: nostrThreadId(threadKey),
      ownerPublicKey: newest.ownerPublicKey,
      counterpartPublicKey: newest.counterpartPublicKey,
      threadKey,
      subject: newest.subject,
      contextType: newest.contextType,
      contextId: newest.contextId,
      lastMessageAt: newest.messageCreatedAt,
      lastMessageId: newest.id,
      unreadCount: messages.filter((message) => !message.read && message.direction === 'incoming').length,
      archived: messages.every((message) => message.archived),
      updatedAt: nowIso()
    };
    await db.nostrMessageThreads.put(thread);
  };

  const cacheUnwrappedNostrMessage = async (
    unwrapped: UnwrappedNostrMessage,
    relayUrl: string,
    inboxPassphrase: string
  ): Promise<'imported' | 'duplicate' | 'skipped'> => {
    if (!identity) return 'skipped';
    const ownerPublicKey = identity.publicKey.toLowerCase();
    const existing = await db.nostrMessages.where('eventId').equals(unwrapped.wrap.id).first();
    if (existing) {
      const relayUrls = mergeRelayUrls(existing.relayUrls, relayUrl);
      if (relayUrls.length !== existing.relayUrls.length) await db.nostrMessages.put({ ...existing, relayUrls });
      return 'duplicate';
    }
    const parsedContext = messageContextFromPlaintext(unwrapped.rumor.content);
    const direction: NostrMessageRecord['direction'] = unwrapped.senderPublicKey.toLowerCase() === ownerPublicKey ? 'outgoing' : 'incoming';
    const sentReceipt =
      direction === 'outgoing'
        ? (await db.nostrContactReceipts.toArray()).find(
            (receipt) => receipt.senderPublicKey.toLowerCase() === ownerPublicKey && receipt.eventIds.includes(unwrapped.wrap.id)
          )
        : undefined;
    const counterpartPublicKey = direction === 'outgoing' ? sentReceipt?.recipientPublicKey.toLowerCase() ?? ownerPublicKey : unwrapped.senderPublicKey;
    const subject = unwrapped.subject ?? parsedContext.contextTitle ?? sentReceipt?.contextTitle;
    const contextId = parsedContext.contextId ?? sentReceipt?.contextId;
    const exactThreadKey = nostrThreadKey(ownerPublicKey, counterpartPublicKey, subject, contextId);
    const existingThreads = await db.nostrMessageThreads.where('ownerPublicKey').equals(ownerPublicKey).toArray();
    const counterpartThreads = existingThreads.filter((thread) => thread.counterpartPublicKey.toLowerCase() === counterpartPublicKey.toLowerCase());
    const matchingThread =
      counterpartThreads.find((thread) => thread.threadKey === exactThreadKey) ??
      (subject
        ? counterpartThreads
            .filter((thread) => thread.subject?.trim().toLowerCase() === subject.trim().toLowerCase())
            .sort((left, right) => right.lastMessageAt.localeCompare(left.lastMessageAt))[0]
        : undefined) ??
      (!subject && !contextId && counterpartThreads.length === 1 ? counterpartThreads[0] : undefined);
    const threadKey = matchingThread?.threadKey ?? exactThreadKey;
    const record: NostrMessageRecord = {
      id: `nostr_msg_${unwrapped.wrap.id}`,
      ownerPublicKey,
      eventId: unwrapped.wrap.id,
      wrapPublicKey: unwrapped.wrap.pubkey,
      senderPublicKey: unwrapped.senderPublicKey,
      recipientPublicKey: ownerPublicKey,
      counterpartPublicKey,
      direction,
      threadKey,
      subject: matchingThread?.subject ?? subject,
      contextType: sentReceipt?.contextType ?? matchingThread?.contextType,
      contextId: matchingThread?.contextId ?? contextId,
      wrapCreatedAt: messageIso(unwrapped.wrap.created_at),
      messageCreatedAt: messageIso(unwrapped.rumor.created_at),
      receivedAt: nowIso(),
      relayUrls: [relayUrl],
      rawEvent: JSON.stringify(unwrapped.wrap),
      encryptedPlaintext: await encryptLocalSecret(unwrapped.rumor.content, inboxPassphrase),
      read: direction === 'outgoing',
      archived: false
    };
    await db.nostrMessages.put(record);
    await rebuildNostrThread(threadKey);
    return 'imported';
  };

  const unwrapFetchedNostrMessage = async (event: NostrEvent): Promise<UnwrappedNostrMessage> => {
    if (!identity) throw new Error(t('nostrInbox.identityRequired'));
    if (identityCanUseLocalUnlock(identity) && privateKeyHex) {
      return unwrapLocalNostrGiftWrap(event, privateKeyHex, identity.publicKey);
    }
    const signer = nostrSigner.connected && nostrSigner.publicKey ? nostrSigner : await connectSigner();
    if (!signer.connected || signer.publicKey?.toLowerCase() !== identity.publicKey.toLowerCase()) {
      throw new Error(t('nostrInbox.signerRequired'));
    }
    if (!signerSupportsNip44Decryption()) {
      throw new Error(t('nostrInbox.signerNoDecrypt'));
    }
    return unwrapExtensionNostrGiftWrap(event, identity.publicKey, decryptWithNostrSigner);
  };

  const fetchNostrInbox = async (inboxPassphrase: string): Promise<InboxFetchSummary> => {
    if (!identity) throw new Error(t('nostrInbox.identityRequired'));
    if (inboxPassphrase.length < 10) throw new Error(t('nostrInbox.passphraseTooShort'));
    const enabledRelays = relays.filter((relay) => relay.enabled);
    if (enabledRelays.length === 0) throw new Error(t('nostrContact.relaysRequired'));
    if (!identityCanUseLocalUnlock(identity) || !privateKeyHex) {
      const signer = nostrSigner.connected && nostrSigner.publicKey ? nostrSigner : await connectSigner();
      if (!signer.connected || signer.publicKey?.toLowerCase() !== identity.publicKey.toLowerCase()) throw new Error(t('nostrInbox.signerRequired'));
      if (!signerSupportsNip44Decryption()) throw new Error(t('nostrInbox.signerNoDecrypt'));
    }
    const ownerPublicKey = identity.publicKey.toLowerCase();
    const cursorMap = new Map(nostrInboxCursors.filter((cursor) => cursor.ownerPublicKey === ownerPublicKey).map((cursor) => [cursor.relayUrl, cursor]));
    const sinceByRelay = Object.fromEntries(enabledRelays.map((relay) => [relay.url, nostrInboxSince(cursorMap.get(relay.url)?.newestCreatedAt)]));
    const results: NostrInboxFetchResult[] = await fetchNostrInboxGiftWraps(relays, ownerPublicKey, sinceByRelay);
    const summary: InboxFetchSummary = { fetched: 0, imported: 0, duplicates: 0, failed: 0, relays: enabledRelays.length };

    for (const result of results) {
      if (!result.ok) summary.failed += 1;
      summary.fetched += result.events.length;
      for (const event of result.events) {
        try {
          const cached = await cacheUnwrappedNostrMessage(await unwrapFetchedNostrMessage(event), result.relayUrl, inboxPassphrase);
          if (cached === 'imported') summary.imported += 1;
          if (cached === 'duplicate') summary.duplicates += 1;
        } catch {
          summary.failed += 1;
        }
      }
      if (result.ok) {
        await db.nostrInboxCursors.put({
          id: `nostr_cursor_${ownerPublicKey}_${result.relayUrl}`,
          ownerPublicKey,
          relayUrl: result.relayUrl,
          since: sinceByRelay[result.relayUrl],
          newestCreatedAt: result.newestCreatedAt,
          lastFetchedAt: nowIso()
        });
      }
    }
    showNotice(t('nostrInbox.fetchComplete').replace('{count}', String(summary.imported)));
    await reload();
    return summary;
  };

  const createLightningPaymentAttempt = async (request: LightningPaymentRequest): Promise<LightningPaymentAttempt> => {
    if (!identity) throw new Error(t('payment.identityRequired'));
    const enabledRelays = relays.filter((relay) => relay.enabled);
    if (enabledRelays.length === 0) throw new Error(t('nostrContact.relaysRequired'));
    if (!Number.isInteger(request.amountSats) || request.amountSats <= 0) throw new Error(t('payment.amountRequired'));
    const buyerPublicKey = identity.publicKey.toLowerCase();
    const sellerPublicKey = request.listing.authorPublicKey.toLowerCase();
    const amountMsats = request.amountSats * 1000;
    const metadata = await fetchLnurlPayMetadata(request.lnurlSource);
    const lnurlTag = lnurlTagForPayUrl(request.lnurlSource);
    const zapRecipientPublicKey = metadata.nostrPubkey.toLowerCase();
    const listingCoordinate = nostrCoordinate(AGORAMESH_EVENT_KINDS.listing, sellerPublicKey, request.listing.id);
    const zapArgs: ZapRequestArgs = {
      buyerPublicKey,
      sellerPublicKey: zapRecipientPublicKey,
      amountMsats,
      lnurl: lnurlTag,
      relays: enabledRelays.map((relay) => relay.url),
      content: sanitizePlainText(request.publicNote),
      listingCoordinate
    };
    let zapRequest: NostrEvent;
    if (identityCanUseLocalUnlock(identity) && privateKeyHex) {
      zapRequest = signZapRequestLocally(zapArgs, privateKeyHex);
    } else {
      const signer = nostrSigner.connected && nostrSigner.publicKey ? nostrSigner : await connectSigner();
      if (!signer.connected || signer.publicKey?.toLowerCase() !== buyerPublicKey) throw new Error(t('payment.signerRequired'));
      zapRequest = await signZapRequestWithExtension(zapArgs, (event) => signWithNostrSigner(event, buyerPublicKey));
    }
    const invoice = await requestLnurlInvoice(metadata, amountMsats, JSON.stringify(zapRequest));
    const at = nowIso();
    const attempt: LightningPaymentAttempt = {
      id: newId('lightning_payment'),
      buyerPublicKey,
      sellerPublicKey,
      listingId: request.listing.id,
      listingTitle: request.listing.title,
      amountSats: request.amountSats,
      amountMsats,
      lnurlSource: request.lnurlSource,
      callbackUrl: metadata.callback,
      sellerWalletPubkey: metadata.nostrPubkey,
      zapRequestId: zapRequest.id,
      zapRequest: JSON.stringify(zapRequest),
      bolt11: invoice.bolt11,
      receiptRelayUrls: [],
      status: 'invoice-created',
      createdAt: at,
      updatedAt: at
    };
    await db.lightningPaymentAttempts.put(attempt);
    await reload();
    return attempt;
  };

  const checkLightningPaymentReceipt = async (attempt: LightningPaymentAttempt): Promise<LightningPaymentAttempt> => {
    const zapRequest = parseNostrEvent(JSON.parse(attempt.zapRequest));
    const since = Math.max(0, Math.floor(new Date(attempt.createdAt).getTime() / 1000) - 600);
    const results = await fetchZapReceiptsFromRelays(relays, attempt.sellerWalletPubkey, since);
    const receiptRelayUrls: string[] = [];
    for (const result of results) {
      for (const event of result.events) {
        try {
          const receipt = validateZapReceipt({
            receipt: event,
            zapRequest,
            bolt11: attempt.bolt11,
            sellerWalletPubkey: attempt.sellerWalletPubkey
          });
          receiptRelayUrls.push(result.relayUrl);
          const updated: LightningPaymentAttempt = {
            ...attempt,
            receiptEventId: receipt.id,
            receiptEvent: JSON.stringify(receipt),
            receiptRelayUrls,
            status: 'receipt-found',
            updatedAt: nowIso(),
            error: undefined
          };
          await db.lightningPaymentAttempts.put(updated);
          await reload();
          return updated;
        } catch {
          // Keep scanning for a matching, validated receipt.
        }
      }
    }
    const updated: LightningPaymentAttempt = {
      ...attempt,
      receiptRelayUrls: results.filter((result) => result.ok).map((result) => result.relayUrl),
      updatedAt: nowIso(),
      error: t('payment.receiptNotFound')
    };
    await db.lightningPaymentAttempts.put(updated);
    await reload();
    return updated;
  };

  const cacheOperatorSupportReceipt = async (
    receipt: NostrEvent,
    relayUrls: string[],
    config: OperatorSupportConfig,
    payerPublicKey?: string,
    operatorWalletPubkey?: string
  ): Promise<OperatorSupportReceipt> => {
    const operatorLnurlTag = lnurlTagForPayUrl(config.lnurl);
    const validation = validateOperatorSupportReceipt({
      receipt,
      payerPublicKey,
      operatorWalletPubkey: operatorWalletPubkey ?? receipt.pubkey,
      operatorLnurl: operatorLnurlTag,
      minimumMsats: config.minimumSats * 1000
    });
    const at = nowIso();
    const id = `operator_support_${validation.zapRequest.pubkey.toLowerCase()}_${receipt.id}`;
    const existing = await db.operatorSupportReceipts.get(id);
    const cached: OperatorSupportReceipt = {
      id,
      payerPublicKey: validation.zapRequest.pubkey.toLowerCase(),
      operatorLnurl: config.lnurl,
      operatorWalletPubkey: receipt.pubkey.toLowerCase(),
      amountMsats: validation.amountMsats,
      minimumSats: config.minimumSats,
      zapRequestId: validation.zapRequest.id,
      zapRequest: JSON.stringify(validation.zapRequest),
      receiptEventId: receipt.id,
      receiptEvent: JSON.stringify(receipt),
      relayUrls: [...new Set([...(existing?.relayUrls ?? []), ...relayUrls])],
      paidAt: new Date(receipt.created_at * 1000).toISOString(),
      validatedAt: at
    };
    await db.operatorSupportReceipts.put(cached);
    return cached;
  };

  const createOperatorSupportPaymentAttempt = async (request: OperatorSupportPaymentRequest): Promise<LightningPaymentAttempt> => {
    if (!operatorSupport.enabled) throw new Error(t('support.notConfigured'));
    if (!identity) throw new Error(t('payment.identityRequired'));
    const enabledRelays = relays.filter((relay) => relay.enabled);
    if (enabledRelays.length === 0) throw new Error(t('nostrContact.relaysRequired'));
    const amountSats = Math.max(operatorSupport.minimumSats, Math.floor(Number(request.amountSats)));
    const amountMsats = amountSats * 1000;
    const buyerPublicKey = identity.publicKey.toLowerCase();
    const metadata = await fetchLnurlPayMetadata(operatorSupport.lnurl);
    const operatorLnurlTag = lnurlTagForPayUrl(operatorSupport.lnurl);
    const zapArgs: ZapRequestArgs = {
      buyerPublicKey,
      sellerPublicKey: metadata.nostrPubkey.toLowerCase(),
      amountMsats,
      lnurl: operatorLnurlTag,
      relays: enabledRelays.map((relay) => relay.url),
      content: sanitizePlainText(request.publicNote),
      customTags: [
        ['t', OPERATOR_SUPPORT_TAG],
        ['purpose', OPERATOR_SUPPORT_PURPOSE]
      ]
    };
    let zapRequest: NostrEvent;
    if (identityCanUseLocalUnlock(identity) && privateKeyHex) {
      zapRequest = signZapRequestLocally(zapArgs, privateKeyHex);
    } else {
      const signer = nostrSigner.connected && nostrSigner.publicKey ? nostrSigner : await connectSigner();
      if (!signer.connected || signer.publicKey?.toLowerCase() !== buyerPublicKey) throw new Error(t('payment.signerRequired'));
      zapRequest = await signZapRequestWithExtension(zapArgs, (event) => signWithNostrSigner(event, buyerPublicKey));
    }
    const invoice = await requestLnurlInvoice(metadata, amountMsats, JSON.stringify(zapRequest));
    const at = nowIso();
    const attempt: LightningPaymentAttempt = {
      id: newId('lightning_payment'),
      buyerPublicKey,
      sellerPublicKey: metadata.nostrPubkey.toLowerCase(),
      purpose: 'operator-support',
      badgeSubjectPublicKey: buyerPublicKey,
      amountSats,
      amountMsats,
      lnurlSource: operatorSupport.lnurl,
      callbackUrl: metadata.callback,
      sellerWalletPubkey: metadata.nostrPubkey,
      zapRequestId: zapRequest.id,
      zapRequest: JSON.stringify(zapRequest),
      bolt11: invoice.bolt11,
      receiptRelayUrls: [],
      status: 'invoice-created',
      createdAt: at,
      updatedAt: at
    };
    await db.lightningPaymentAttempts.put(attempt);
    await reload();
    return attempt;
  };

  const checkOperatorSupportReceipt = async (attempt?: LightningPaymentAttempt): Promise<OperatorSupportReceipt | undefined> => {
    if (!operatorSupport.enabled) throw new Error(t('support.notConfigured'));
    const metadata = await fetchLnurlPayMetadata(operatorSupport.lnurl);
    const since = attempt ? Math.max(0, Math.floor(new Date(attempt.createdAt).getTime() / 1000) - 600) : undefined;
    const results = await fetchZapReceiptsFromRelays(relays, metadata.nostrPubkey, since);
    let cached: OperatorSupportReceipt | undefined;
    for (const result of results) {
      for (const event of result.events) {
        try {
          if (attempt) {
            const zapRequest = parseNostrEvent(JSON.parse(attempt.zapRequest));
            validateZapReceipt({
              receipt: event,
              zapRequest,
              bolt11: attempt.bolt11,
              sellerWalletPubkey: attempt.sellerWalletPubkey
            });
          }
          cached = await cacheOperatorSupportReceipt(
            event,
            [result.relayUrl],
            operatorSupport,
            attempt?.badgeSubjectPublicKey ?? attempt?.buyerPublicKey,
            metadata.nostrPubkey
          );
          if (attempt && cached) {
            const updated: LightningPaymentAttempt = {
              ...attempt,
              receiptEventId: cached.receiptEventId,
              receiptEvent: cached.receiptEvent,
              receiptRelayUrls: cached.relayUrls,
              status: 'receipt-found',
              updatedAt: nowIso(),
              error: undefined
            };
            await db.lightningPaymentAttempts.put(updated);
          }
        } catch {
          // Continue scanning for a matching, validated support receipt.
        }
      }
    }
    await reload();
    if (!cached && attempt) throw new Error(t('support.receiptNotFound'));
    return cached;
  };

  const refreshOperatorSupportReceipts = async (): Promise<number> => {
    if (!operatorSupport.enabled) return 0;
    const metadata = await fetchLnurlPayMetadata(operatorSupport.lnurl);
    const newest = operatorSupportReceipts
      .filter((receipt) => receipt.operatorWalletPubkey.toLowerCase() === metadata.nostrPubkey.toLowerCase())
      .sort((left, right) => right.paidAt.localeCompare(left.paidAt))[0];
    const since = newest ? Math.max(0, Math.floor(new Date(newest.paidAt).getTime() / 1000) - 600) : undefined;
    const results = await fetchZapReceiptsFromRelays(relays, metadata.nostrPubkey, since);
    let cachedCount = 0;
    for (const result of results) {
      for (const event of result.events) {
        try {
          await cacheOperatorSupportReceipt(event, [result.relayUrl], operatorSupport, undefined, metadata.nostrPubkey);
          cachedCount += 1;
        } catch {
          // Ignore receipts that are not valid operator support zaps for this build.
        }
      }
    }
    await reload();
    return cachedCount;
  };

  const cacheListingZapReceipt = async (
    listing: Listing,
    receipt: NostrEvent,
    relayUrls: string[],
    sellerWalletPubkey: string,
    lnurl: string
  ): Promise<ListingZapReceipt> => {
    const listingCoordinate = listingCoordinateForZap(listing);
    const validation = validateListingZapReceipt({
      receipt,
      sellerWalletPubkey,
      listingCoordinate,
      lnurl
    });
    const id = `listing_zap_${listing.id}_${receipt.id}`;
    const existing = await db.listingZapReceipts.get(id);
    const cached: ListingZapReceipt = {
      id,
      listingId: listing.id,
      listingTitle: listing.title,
      listingCoordinate,
      sellerPublicKey: listing.authorPublicKey.toLowerCase(),
      buyerPublicKey: validation.buyerPublicKey,
      lnurl,
      sellerWalletPubkey: sellerWalletPubkey.toLowerCase(),
      amountMsats: validation.amountMsats,
      zapRequestId: validation.zapRequest.id,
      zapRequest: JSON.stringify(validation.zapRequest),
      receiptEventId: receipt.id,
      receiptEvent: JSON.stringify(receipt),
      bolt11: validation.bolt11,
      relayUrls: [...new Set([...(existing?.relayUrls ?? []), ...relayUrls])],
      paidAt: new Date(receipt.created_at * 1000).toISOString(),
      validatedAt: nowIso()
    };
    await db.listingZapReceipts.put(cached);
    return cached;
  };

  const checkListingZapReceipts = async (listing: Listing, sellerProfile?: PublicProfile): Promise<ListingZapReceipt[]> => {
    const lnurlSource = listingLightningSource(listing, sellerProfile);
    if (!lnurlSource) throw new Error(t('listingZap.noLightningSource'));
    const metadata = await fetchLnurlPayMetadata(lnurlSource);
    const lnurl = lnurlTagForPayUrl(lnurlSource);
    const newest = listingZapReceiptsForListing(listing, listingZapReceipts)[0];
    const since = newest ? Math.max(0, Math.floor(new Date(newest.paidAt).getTime() / 1000) - 600) : undefined;
    const results = await fetchZapReceiptsFromRelays(relays, metadata.nostrPubkey, since);
    const cached: ListingZapReceipt[] = [];
    for (const result of results) {
      for (const event of result.events) {
        try {
          cached.push(await cacheListingZapReceipt(listing, event, [result.relayUrl], metadata.nostrPubkey, lnurl));
        } catch {
          // Keep scanning for receipts tied to this listing coordinate.
        }
      }
    }
    await reload();
    showNotice(t('listingZap.checkComplete').replace('{count}', String(cached.length)));
    return cached;
  };

  const saveNwcConnection = async ({ uri, passphrase, label }: SaveNwcConnectionRequest): Promise<NwcConnection> => {
    const parsed = parseNwcUri(uri);
    const at = nowIso();
    const connection: NwcConnection = {
      id: 'nwc_default',
      label: label?.trim() || parsed.lud16 || `${shortPublicKey(parsed.walletPublicKey)} wallet`,
      walletPublicKey: parsed.walletPublicKey,
      clientPublicKey: parsed.clientPublicKey,
      relayUrls: parsed.relayUrls,
      encryptedSecret: await encryptLocalSecret(parsed.clientSecret, passphrase),
      lud16: parsed.lud16,
      createdAt: nwcConnections.find((entry) => entry.id === 'nwc_default')?.createdAt ?? at,
      updatedAt: at,
      lastError: undefined
    };
    await db.transaction('rw', db.nwcConnections, async () => {
      await db.nwcConnections.clear();
      await db.nwcConnections.put(connection);
    });
    setUnlockedNwcSecrets({ [connection.id]: parsed.clientSecret });
    await reload();
    showNotice(t('nwc.saved'));
    return connection;
  };

  const unlockNwcConnection = async (connection: NwcConnection, passphrase: string): Promise<void> => {
    const secret = await decryptLocalSecret(connection.encryptedSecret, passphrase);
    const parsed = parseNwcUri(`nostr+walletconnect://${connection.walletPublicKey}?relay=${encodeURIComponent(connection.relayUrls[0])}&secret=${secret}`);
    if (parsed.clientPublicKey.toLowerCase() !== connection.clientPublicKey.toLowerCase()) {
      throw new Error(t('nwc.unlockFailed'));
    }
    setUnlockedNwcSecrets((current) => ({ ...current, [connection.id]: secret }));
    showNotice(t('nwc.unlocked'));
  };

  const lockNwcConnection = (connectionId: string): void => {
    setUnlockedNwcSecrets((current) => {
      const next = { ...current };
      delete next[connectionId];
      return next;
    });
    showNotice(t('nwc.locked'));
  };

  const disconnectNwcConnection = async (connectionId: string): Promise<void> => {
    await db.nwcConnections.delete(connectionId);
    setUnlockedNwcSecrets((current) => {
      const next = { ...current };
      delete next[connectionId];
      return next;
    });
    await reload();
    showNotice(t('nwc.disconnected'));
  };

  const testNwcConnection = async (connection: NwcConnection): Promise<void> => {
    const secret = unlockedNwcSecrets[connection.id];
    if (!secret) throw new Error(t('nwc.unlockRequired'));
    try {
      await requestNwcInfo(connection, secret);
      await db.nwcConnections.put({ ...connection, lastConnectedAt: nowIso(), lastError: undefined, updatedAt: nowIso() });
      await reload();
      showNotice(t('nwc.testSuccess'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('nwc.testFailed');
      await db.nwcConnections.put({ ...connection, lastError: message, updatedAt: nowIso() });
      await reload();
      throw new Error(message);
    }
  };

  const payLightningAttemptWithNwc = async (attempt: LightningPaymentAttempt, connectionId: string): Promise<LightningPaymentAttempt> => {
    const connection = nwcConnections.find((entry) => entry.id === connectionId);
    if (!connection) throw new Error(t('nwc.noWallet'));
    const secret = unlockedNwcSecrets[connection.id];
    if (!secret) throw new Error(t('nwc.unlockRequired'));
    if ((attempt.status === 'paid' || attempt.status === 'receipt-found') && attempt.nwcRequestEventId) return attempt;
    const pending: LightningPaymentAttempt = {
      ...attempt,
      nwcConnectionId: connection.id,
      nwcRelayUrl: connection.relayUrls[0],
      status: 'wallet-payment-pending',
      statusDetail: t('nwc.waitingForWallet'),
      error: undefined,
      updatedAt: nowIso()
    };
    await db.lightningPaymentAttempts.put(pending);
    setLightningPaymentAttempts((current) => [pending, ...current.filter((entry) => entry.id !== pending.id)]);
    try {
      const result = await payNwcInvoice(connection, secret, attempt.bolt11);
      const paid = paidAttemptFromNwcResult(pending, result);
      await db.lightningPaymentAttempts.put(paid);
      await db.nwcConnections.put({ ...connection, lastConnectedAt: nowIso(), lastError: undefined, updatedAt: nowIso() });
      await reload();
      showNotice(t('nwc.paymentPaid'));
      return paid;
    } catch (error) {
      const message = error instanceof Error ? error.message : t('nwc.paymentFailed');
      const failed: LightningPaymentAttempt = {
        ...pending,
        status: 'failed',
        error: message,
        statusDetail: message,
        updatedAt: nowIso()
      };
      await db.lightningPaymentAttempts.put(failed);
      await db.nwcConnections.put({ ...connection, lastError: message, updatedAt: nowIso() });
      await reload();
      throw new Error(message);
    }
  };

  const updateNostrThread = async (thread: NostrMessageThread, changes: { read?: boolean; archived?: boolean }): Promise<void> => {
    const messages = await db.nostrMessages.where('threadKey').equals(thread.threadKey).toArray();
    await db.nostrMessages.bulkPut(messages.map((message) => ({ ...message, ...changes })));
    await rebuildNostrThread(thread.threadKey);
    await reload();
  };

  return (
    <div className={sidebarCollapsed ? 'app-shell sidebar-collapsed' : 'app-shell'}>
      <a className="skip-link" href="#main-content">
        {t('a11y.skipToContent')}
      </a>
      <aside className={sidebarCollapsed ? 'app-sidebar collapsed' : 'app-sidebar'} aria-label={t('app.name')}>
        <div className="sidebar-header">
          <button className="brand" onClick={() => go('home')} type="button" aria-label={t('app.name')}>
            <img className="brand-mark" src="/icons/icon.svg" alt="" aria-hidden="true" />
            <span className="brand-name">{t('app.name')}</span>
          </button>
          <button
            className="sidebar-collapse-button subtle"
            onClick={() => setSidebarCollapsed((current) => !current)}
            type="button"
            aria-label={sidebarCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            title={sidebarCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={17} aria-hidden="true" /> : <PanelLeftClose size={17} aria-hidden="true" />}
          </button>
        </div>
        <nav className="nav primary-nav" aria-label={t('nav.primary')}>
          {primaryNavItems.map((item) => renderNavButton(item))}
        </nav>
        {secondaryNavItems.length > 0 ? (
          <nav className="nav secondary-nav" aria-label={t('nav.secondary')}>
            {secondaryNavItems.map((item) => renderNavButton(item))}
          </nav>
        ) : null}
        <div className="sidebar-footer">
          <nav className="nav footer-nav" aria-label={t('nav.settings')}>
            {renderNavButton(settingsNavItem)}
          </nav>
          <p className="muted">{identity ? identity.displayName : t('identity.noIdentity')}</p>
          <div className="language-switch" aria-label={t('language.switcher')} role="group">
            <Languages size={16} aria-hidden="true" />
            <button
              aria-pressed={language === 'en'}
              className={language === 'en' ? 'active' : ''}
              onClick={() => setLanguage('en')}
              type="button"
            >
              EN
            </button>
            <button
              aria-pressed={language === 'cs'}
              className={language === 'cs' ? 'active' : ''}
              onClick={() => setLanguage('cs')}
              type="button"
            >
              CS
            </button>
          </div>
        </div>
      </aside>
      <header className="mobile-topbar" role="banner">
        <button className="brand" onClick={() => go('home')} type="button" aria-label={t('app.name')}>
          <img className="brand-mark" src="/icons/icon.svg" alt="" aria-hidden="true" />
          <span className="brand-name">{t('app.name')}</span>
        </button>
        <div className="language-switch compact" aria-label={t('language.mobileSwitcher')} role="group">
          <Languages size={16} aria-hidden="true" />
          <button aria-pressed={language === 'en'} className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')} type="button">
            EN
          </button>
          <button aria-pressed={language === 'cs'} className={language === 'cs' ? 'active' : ''} onClick={() => setLanguage('cs')} type="button">
            CS
          </button>
        </div>
      </header>
      <nav className="mobile-bottom-nav" aria-label={t('nav.mobile')}>
        {mobileNavItems.map((item) => renderNavButton(item, true))}
      </nav>

      {notice || nextStep ? (
        <div className="toast-stack">
          {notice ? <StatusMessage>{notice}</StatusMessage> : null}
          {nextStep ? (
            <NextStepActions
              nextStep={nextStep}
              go={go}
              onDismiss={() => {
                setNotice('');
                setNextStep(undefined);
              }}
            />
          ) : null}
        </div>
      ) : null}

      <main aria-label={pageLabels[page]} id="main-content" tabIndex={-1}>
        {page === 'home' ? (
          <HomePage
            go={go}
          />
        ) : null}
        {page === 'browse' ? (
          <BrowsePage
            identity={identity}
            profile={profile}
            listings={listings}
            syncedListings={syncedListings}
            syncedProfiles={syncedProfiles}
            operatorSupportReceipts={operatorSupportReceipts}
            communityLists={communityLists}
            syncedCommunityLists={syncedCommunityLists}
            blossomServers={blossomServers}
            relays={relays}
            syncSettings={syncSettings}
            privateKeyHex={privateKeyHex}
            nostrSigner={nostrSigner}
            go={go}
            onConnectSigner={() => void connectSigner()}
            onUseConnectedSignerAsIdentity={() => void useConnectedSignerAsIdentity()}
            onToggleHidden={(record, hidden) => void setSyncedRecordHidden(record.kind, record.id, hidden)}
            onFetchMarketplace={(scope) => fetchMarketplacePublicData(scope)}
            onListingDiscoveryScopeChange={(scope) => void saveListingDiscoveryScope(scope)}
            onListingSaved={(listing) => {
              setListings((current) => [listing, ...current.filter((entry) => entry.id !== listing.id)]);
              showNotice(t('notice.listingSaved'), {
                body: listing.visibility === 'public' ? t('next.listingPublicSaved') : t('next.listingSaved'),
                actions: [
                  {
                    label: listing.visibility === 'public' ? t('next.reviewPublishOptions') : t('next.browseListings'),
                    page: listingRouteForRef({ source: 'local', id: listing.id, listing })
                  },
                  { label: t('next.configureRelays'), page: 'settings' }
                ]
              });
              void reload();
            }}
            onPublishCommunityList={(list) =>
              publishEvent(
                'communityList',
                list.id,
                (key) => signCommunityCurationList(list, key),
                () =>
                  unsignedAgoraEvent(
                    AGORAMESH_EVENT_KINDS.communityList,
                    [
                      ['d', list.id],
                      ['title', list.title],
                      ...list.referencedCoordinates.map((coordinate) => ['a', coordinate])
                    ],
                    communityCurationListPayload(list)
                  ),
                list.authorPublicKey
              )
            }
            onCommunityListSaved={() => {
              showNotice(t('notice.communityListSaved'));
              void reload();
            }}
            onNavigateListing={(listingRef) => go(listingRouteForRef(listingRef))}
          />
        ) : null}
        {page === 'listing' ? (
          <ListingPage
            route={listingRouteFromHash()}
            listings={listings}
            syncedListings={syncedListings}
            syncedProfiles={syncedProfiles}
            profile={profile}
            attestations={attestations}
            syncedAttestations={syncedAttestations}
            allowlist={allowlist}
            identity={identity}
            blossomServers={blossomServers}
            privateKeyHex={privateKeyHex}
            nostrSigner={nostrSigner}
            publishReceipts={publishReceipts}
            nostrContactReceipts={nostrContactReceipts}
            lightningPaymentAttempts={lightningPaymentAttempts}
            operatorSupportReceipts={operatorSupportReceipts}
            listingZapReceipts={listingZapReceipts}
            nwcConnections={nwcConnections}
            unlockedNwcConnectionIds={Object.keys(unlockedNwcSecrets)}
            relays={relays}
            syncSettings={syncSettings}
            communityLists={communityLists}
            syncedCommunityLists={syncedCommunityLists}
            onBack={() => go('browse')}
            onCreateIdentity={() => go('profile')}
            onConnectSigner={() => void connectSigner()}
            onUseConnectedSignerAsIdentity={() => void useConnectedSignerAsIdentity()}
            onListingSaved={(listing) => {
              setListings((current) => [listing, ...current.filter((entry) => entry.id !== listing.id)]);
              showNotice(t('notice.listingSaved'), {
                body: listing.visibility === 'public' ? t('next.listingPublicUpdated') : t('next.listingUpdated'),
                actions: [
                  {
                    label: listing.visibility === 'public' ? t('next.reviewPublishUpdate') : t('next.browseListings'),
                    page: listingRouteForRef({ source: 'local', id: listing.id, listing })
                  },
                  { label: t('next.configureRelays'), page: 'settings' }
                ]
              });
              void reload();
            }}
            onPublish={(listing) =>
              publishEvent(
                'listing',
                listing.id,
                (key) => signListing(listing, key),
                () => unsignedListing(listing),
                listing.authorPublicKey
              )
            }
            onSendNostrIntro={sendNostrContactIntro}
            onCreateLightningPaymentAttempt={createLightningPaymentAttempt}
            onCheckLightningPaymentReceipt={checkLightningPaymentReceipt}
            onCheckListingZapReceipts={checkListingZapReceipts}
            onCreateOperatorSupportPaymentAttempt={createOperatorSupportPaymentAttempt}
            onCheckOperatorSupportReceipt={checkOperatorSupportReceipt}
            onSaveNwcConnection={saveNwcConnection}
            onUnlockNwcConnection={unlockNwcConnection}
            onPayLightningAttemptWithNwc={payLightningAttemptWithNwc}
            onReviewSeller={(request) => {
              setReputationDraftRequest(request);
              go('reputation');
            }}
            onStartTrade={(listingRef) => {
              setTradeListingRef(listingRef);
              go('trade');
            }}
            onToggleHidden={(record, hidden) => void setSyncedRecordHidden(record.kind, record.id, hidden)}
          />
        ) : null}
        {page === 'profile' ? (
          <ProfilePage
            identity={identity}
            profile={profile}
            relays={relays}
            blossomServers={blossomServers}
            nostrSigner={nostrSigner}
            privateKeyHex={privateKeyHex}
            identityBackedUp={identityBackedUp}
            mediators={mediators}
            operatorSupportConfig={operatorSupport}
            operatorSupportReceipts={operatorSupportReceipts}
            lightningPaymentAttempts={lightningPaymentAttempts}
            nwcConnections={nwcConnections}
            unlockedNwcConnectionIds={Object.keys(unlockedNwcSecrets)}
            onPrivateKey={setPrivateKeyHex}
            onLock={() => setPrivateKeyHex('')}
            onConnectSigner={connectSigner}
            onNostrConnectConnected={setNostrSigner}
            onUseConnectedSignerAsIdentity={useConnectedSignerAsIdentity}
            onIdentityForgotten={async () => {
              if (!identity) return;
              clearBackupConfirmed(identity);
              await db.identity.clear();
              setPrivateKeyHex('');
              setIdentity(undefined);
              setIdentityBackedUp(false);
              showNotice(t('notice.identityForgotten'));
              await reload();
            }}
            onBackupConfirmed={() => {
              if (identity) markBackupConfirmed(identity);
              setIdentityBackedUp(true);
              showNotice(t('identity.backupConfirmed'));
            }}
            onIdentitySaved={(message) => {
              showNotice(message ?? t('notice.identitySaved'), {
                body: t('next.identitySaved'),
                actions: [
                  { label: t('next.openBackup'), page: 'profile' },
                  { label: t('next.createListing'), page: 'browse:create' }
                ]
              });
              void reload();
            }}
            onSaved={(result) => {
              showNotice(result.mediatorAvailable ? t('notice.profileMediatorSaved') : t('notice.profileSaved'), {
                body: result.mediatorAvailable ? t('next.profileMediatorSaved') : t('next.profileSaved'),
                actions: result.mediatorAvailable
                  ? [
                      { label: t('next.reviewProfilePublish'), page: 'profile:public' },
                      { label: t('next.reviewMediatorPublish'), page: 'mediators' },
                      { label: t('next.configureRelays'), page: 'settings:relays' }
                    ]
                  : [
                      { label: t('next.createListing'), page: 'browse:create' },
                      { label: t('next.openBrowse'), page: 'browse' }
                    ]
              });
              void reload();
            }}
            onPublish={(publicProfile) =>
              publishEvent(
                'profile',
                publicProfile.id,
                (key) => signPublicProfile(publicProfile, key),
                () => unsignedAgoraEvent(AGORAMESH_EVENT_KINDS.profile, [['d', publicProfile.id]], publicProfilePayload(publicProfile)),
                publicProfile.publicKey
              )
            }
            onCreateOperatorSupportPaymentAttempt={createOperatorSupportPaymentAttempt}
            onCheckOperatorSupportReceipt={checkOperatorSupportReceipt}
            onSaveNwcConnection={saveNwcConnection}
            onUnlockNwcConnection={unlockNwcConnection}
            onPayLightningAttemptWithNwc={payLightningAttemptWithNwc}
          />
        ) : null}
        {page === 'mediators' ? (
          <MediatorPage
            identity={identity}
            profile={profile}
            mediators={mediators}
            syncedProfiles={syncedProfiles}
            syncedMediators={syncedMediators}
            operatorSupportReceipts={operatorSupportReceipts}
            syncSettings={syncSettings}
            relays={relays}
            nostrSigner={nostrSigner}
            privateKeyHex={privateKeyHex}
            nostrContactReceipts={nostrContactReceipts}
            onConnectSigner={() => void connectSigner()}
            onToggleHidden={(record, hidden) => void setSyncedRecordHidden(record.kind, record.id, hidden)}
            onSaved={() => {
              showNotice(t('notice.mediatorSaved'));
              void reload();
            }}
            onPublish={(mediator) =>
              publishEvent(
                'mediator',
                mediator.id,
                (key) => signMediator(mediator, key),
                () => unsignedAgoraEvent(AGORAMESH_EVENT_KINDS.mediator, [['d', mediator.id]], publicMediatorPayload(mediator)),
                mediator.publicKey
              )
            }
            onSendNostrIntro={sendNostrContactIntro}
          />
        ) : null}
        {page === 'trade' ? (
          <TradePage
            listings={listings}
            syncedListings={syncedListings}
            selectedListingRef={tradeListingRef}
            agreements={agreements}
            agreementReceipts={agreementReceipts}
            mediators={mediators}
            syncedMediators={syncedMediators}
            disputes={disputes}
            identity={identity}
            privateKeyHex={privateKeyHex}
            nostrSigner={nostrSigner}
            syncSettings={syncSettings}
            onAgreementSaved={() => {
              showNotice(t('notice.agreementSaved'));
              void reload();
            }}
            onReceiptSaved={() => {
              showNotice(t('notice.agreementReceiptSaved'));
              void reload();
            }}
            onDisputeSaved={() => {
              showNotice(t('notice.disputeSaved'));
              void reload();
            }}
            onSelectedListingConsumed={() => setTradeListingRef(undefined)}
          />
        ) : null}
        {page === 'reputation' ? (
          <ReputationPage
            identity={identity}
            privateKeyHex={privateKeyHex}
            nostrSigner={nostrSigner}
            agreements={agreements}
            agreementReceipts={agreementReceipts}
            attestations={attestations}
            syncedAttestations={syncedAttestations}
            operatorSupportReceipts={operatorSupportReceipts}
            allowlist={allowlist}
            syncSettings={syncSettings}
            draftRequest={reputationDraftRequest}
            onDraftRequestConsumed={() => setReputationDraftRequest(undefined)}
            onToggleHidden={(record, hidden) => void setSyncedRecordHidden(record.kind, record.id, hidden)}
            onSaved={() => {
              showNotice(t('notice.reputationSaved'));
              void reload();
            }}
            onPublish={(attestation) =>
              publishEvent(
                'reputation',
                attestation.id,
                (key) => signReputation(attestation, key),
                () =>
                  unsignedAgoraEvent(
                    AGORAMESH_EVENT_KINDS.reputation,
                    reputationEventTags(attestation),
                    publicReputationPayload(attestation)
                  ),
                attestation.reviewerPublicKey
              )
            }
          />
        ) : null}
        {page === 'inbox' ? (
          <section className="page">
            <div className="panel">
              <SectionHeader icon={<Radio />} title={t('nostrInbox.title')} body={t('nostrInbox.pageBody')} />
              <NostrInboxPanel
                cursors={nostrInboxCursors}
                defaultOpen
                identity={identity}
                messages={nostrMessages}
                nostrSigner={nostrSigner}
                privateKeyHex={privateKeyHex}
                receipts={nostrContactReceipts}
                relays={relays}
                threads={nostrMessageThreads}
                onConnectSigner={() => void connectSigner()}
                onFetch={fetchNostrInbox}
                onSend={sendNostrContactIntro}
                onThreadChange={(thread, changes) => void updateNostrThread(thread, changes)}
              />
            </div>
          </section>
        ) : null}
        {page === 'settings' ? (
          <SettingsPage
            listings={listings}
            relays={relays}
            reviewItems={reviewItems}
            relayHealth={relayHealth}
            publishReceipts={publishReceipts}
            nostrContactReceipts={nostrContactReceipts}
            lightningPaymentAttempts={lightningPaymentAttempts}
            operatorSupportReceipts={operatorSupportReceipts}
            nwcConnections={nwcConnections}
            unlockedNwcConnectionIds={Object.keys(unlockedNwcSecrets)}
            nostrMessages={nostrMessages}
            nostrMessageThreads={nostrMessageThreads}
            nostrInboxCursors={nostrInboxCursors}
            allowlist={allowlist}
            syncedProfiles={syncedProfiles}
            syncedListings={syncedListings}
            syncedMediators={syncedMediators}
            syncedAttestations={syncedAttestations}
            syncedDisputeOutcomes={syncedDisputeOutcomes}
            syncedCommunityLists={syncedCommunityLists}
            syncSettings={syncSettings}
            syncStatuses={syncStatuses}
            relayFetchSummaries={relayFetchSummaries}
            blossomServers={blossomServers}
            identity={identity}
            nostrSigner={nostrSigner}
            privateKeyHex={privateKeyHex}
            go={go}
            onConnectSigner={() => void connectSigner()}
            onNostrConnectConnected={setNostrSigner}
            onUseConnectedSignerAsIdentity={() => void useConnectedSignerAsIdentity()}
            onRelayFetchSummaries={setRelayFetchSummaries}
            onToggleHidden={(record, hidden) => void setSyncedRecordHidden(record.kind, record.id, hidden)}
            onFetchNostrInbox={fetchNostrInbox}
            onNostrThreadChange={(thread, changes) => void updateNostrThread(thread, changes)}
            onSendNostrIntro={sendNostrContactIntro}
            onSaveNwcConnection={saveNwcConnection}
            onUnlockNwcConnection={unlockNwcConnection}
            onLockNwcConnection={lockNwcConnection}
            onDisconnectNwcConnection={(connectionId) => void disconnectNwcConnection(connectionId)}
            onTestNwcConnection={testNwcConnection}
            onChanged={(message = t('common.created'), next) => {
              showNotice(message, next);
              void reload();
            }}
          />
        ) : null}
      </main>
    </div>
  );
}

function HomePage({
  go
}: {
  go: (page: RouteTarget) => void;
}): ReactNode {
  const { t } = useI18n();
  return (
    <section className="hero minimal-home">
      <div className="mesh" aria-hidden="true" />
      <div className="hero-content">
        <div className="hero-copy">
          <p className="eyebrow">{t('home.eyebrow')}</p>
          <h1>{t('home.title')}</h1>
          <p className="lead">{t('home.subtitle')}</p>
          <div className="actions hero-actions">
            <button onClick={() => go('browse')} type="button">
              <Search size={18} /> {t('home.browseMarketplace')}
            </button>
            <button className="subtle" onClick={() => go('browse:create')} type="button">
              <Megaphone size={18} /> {t('home.post')}
            </button>
          </div>
          <p className="home-privacy-line">{t('home.privacyLine')}</p>
        </div>
        <HeroSignalPanel />
      </div>
      <div className="product-story" aria-label={t('home.productSections')}>
        <ProductSection title={t('home.whatAgora')} body={t('home.whatAgoraBody')} actions={[{ label: t('home.browseMarketplace'), page: 'browse' }]} />
        <ProductSection title={t('home.securityPromises')} body={t('home.securityPromisesBody')} />
        <ProductSection title={t('home.staysLocal')} body={t('home.staysLocalBody')} actions={[{ label: t('nav.trade'), page: 'trade' }]} />
        <ProductSection title={t('home.canBePublic')} body={t('home.canBePublicBody')} actions={[{ label: t('home.post'), page: 'browse:create' }]} />
        <ProductSection title={t('home.publicPath')} body={t('home.publicPathBody')} actions={[{ label: t('next.openBrowse'), page: 'browse' }]} />
        <ProductSection title={t('home.nostrSync')} body={t('home.nostrSyncBody')} actions={[{ label: t('settings.tab.relaysSync'), page: 'settings:relays' }]} />
        <ProductSection title={t('home.signerKeys')} body={t('home.signerKeysBody')} actions={[{ label: t('settings.tab.relaysSync'), page: 'settings:relays' }]} />
        <ProductSection title={t('home.paymentsNoCustody')} body={t('home.paymentsNoCustodyBody')} />
        <ProductSection title={t('home.tradeDisputes')} body={t('home.tradeDisputesBody')} actions={[{ label: t('nav.trade'), page: 'trade' }]} />
        <ProductSection title={t('home.communityTrust')} body={t('home.communityTrustBody')} actions={[{ label: t('curation.title'), page: 'browse' }]} />
        <ProductSection title={t('home.releaseVerification')} body={t('home.releaseVerificationBody')} actions={[{ label: t('settings.tab.backupDanger'), page: 'settings:backup' }]} />
        <ProductSection title={t('home.faq')} body={t('home.faqBody')} />
      </div>
    </section>
  );
}

function HeroSignalPanel(): ReactNode {
  const { t } = useI18n();
  const items = [
    {
      icon: <Search size={17} />,
      title: t('home.heroFlowDiscover'),
      body: t('home.heroFlowDiscoverBody')
    },
    {
      icon: <Megaphone size={17} />,
      title: t('home.heroFlowPublish'),
      body: t('home.heroFlowPublishBody')
    },
    {
      icon: <Handshake size={17} />,
      title: t('home.heroFlowTrade'),
      body: t('home.heroFlowTradeBody')
    },
    {
      icon: <ShieldCheck size={17} />,
      title: t('home.heroFlowProtect'),
      body: t('home.heroFlowProtectBody')
    }
  ];

  return (
    <aside className="hero-signal-panel" aria-label={t('home.heroPanelLabel')}>
      <div className="hero-panel-header">
        <span>{t('home.heroPanelEyebrow')}</span>
        <strong>{t('home.heroPanelTitle')}</strong>
      </div>
      <ol className="hero-flow">
        {items.map((item) => (
          <li key={item.title}>
            <span className="hero-flow-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span>
              <strong>{item.title}</strong>
              <small>{item.body}</small>
            </span>
          </li>
        ))}
      </ol>
      <p>{t('home.heroPanelFooter')}</p>
    </aside>
  );
}

function ProductSection({
  title,
  body,
  actions = []
}: {
  title: string;
  body: string;
  actions?: { label: string; page: RouteTarget }[];
}): ReactNode {
  return (
    <article className="product-section">
      <h2>{title}</h2>
      <p>{body}</p>
      {actions.length > 0 ? (
        <div className="actions small">
          {actions.map((action) => (
            <button className="subtle" key={action.label} onClick={() => (window.location.hash = action.page)} type="button">
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function formatContact(contact: ContactMethod): string {
  if (contact.kind === 'nostr') {
    const normalized = normalizeNostrContact(contact.value);
    return normalized ? `nostr: ${normalized.npub}` : `nostr: ${contact.value}`;
  }
  return `${contact.kind}: ${contact.value}`;
}

function formatListingPrice(listing: Listing): string {
  if (listing.price.currency.toUpperCase() === 'FREE' || listing.price.amount === '0') {
    return listing.price.frequency ? `FREE / ${listing.price.frequency}` : 'FREE';
  }
  const base = `${listing.price.amount} ${listing.price.currency}`.trim();
  return listing.price.frequency ? `${base} / ${listing.price.frequency}` : base;
}

function AvatarCircle({ avatarUrl, label, size = 'regular' }: { avatarUrl?: string; label: string; size?: 'small' | 'regular' }): ReactNode {
  const fallback = label.trim().slice(0, 1).toUpperCase() || '?';
  return (
    <span className={`avatar-circle ${size === 'small' ? 'small' : ''}`} aria-hidden="true">
      {avatarUrl ? <img alt="" src={avatarUrl} loading="lazy" /> : fallback}
    </span>
  );
}

function SupporterBadge({ receipt, compact = false }: { receipt?: OperatorSupportReceipt; compact?: boolean }): ReactNode {
  const { t } = useI18n();
  if (!receipt) return null;
  return (
    <span className={compact ? 'supporter-badge compact' : 'supporter-badge'} title={t('support.badgeTitle').replace('{amount}', String(Math.floor(receipt.amountMsats / 1000)))}>
      <BadgeCheck size={14} aria-hidden="true" /> {compact ? t('support.badgeShort') : t('support.badge')}
    </span>
  );
}

function SellerSummaryCard({
  summary,
  supportReceipt,
  onReview
}: {
  summary: SellerSummary;
  supportReceipt?: OperatorSupportReceipt;
  onReview?: () => void;
}): ReactNode {
  const { t } = useI18n();
  return (
    <article className="inline-card seller-summary">
      <AvatarCircle avatarUrl={summary.avatarUrl} label={summary.displayName} />
      <div>
        <div className="row">
          <strong>{summary.displayName}</strong>
          <span className="pill">{summary.trusted ? t('sync.trusted') : t('sync.untrusted')}</span>
          {summary.mediatorAvailable ? <span className="pill">{t('profile.mediatorAvailable')}</span> : null}
          <SupporterBadge receipt={supportReceipt} />
        </div>
        <p className="key">{summary.shortKey}</p>
        {summary.region || summary.languages.length > 0 ? (
          <p className="muted">
            {[summary.region, summary.languages.join(', ')].filter(Boolean).join(' · ')}
          </p>
        ) : null}
        {summary.skills.length > 0 ? (
          <div className="tags compact-tags">
            {summary.skills.slice(0, 5).map((skill) => (
              <span key={skill}>{skill}</span>
            ))}
          </div>
        ) : null}
        {summary.contactMethods.length > 0 ? (
          <p className="muted">
            {t('profile.contacts')}: {summary.contactMethods.map((contact) => contact.kind).join(', ')}
          </p>
        ) : null}
        <p className="muted">
          {t('seller.reputation')}: {summary.reputationAverage ? `${formatReviewScore(summary.reputationAverage)} · ` : ''}{summary.reputationCount}
          {summary.reputationTags.length > 0 ? ` · ${summary.reputationTags.join(', ')}` : ''}
          {summary.trustedReviewCount > 0 ? ` · ${summary.trustedReviewCount} ${t('reputation.trustedReviews')}` : ''}
        </p>
        <p className="muted">{t('seller.notVerified')}</p>
        {onReview ? (
          <button className="subtle" onClick={onReview} type="button">
            <BadgeCheck size={16} /> {t('reputation.reviewSeller')}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function ListingDetails({ listing, sellerSummary, hideSeller = false }: { listing: Listing; sellerSummary: SellerSummary; hideSeller?: boolean }): ReactNode {
  const { t } = useI18n();
  const copyPaymentIntent = (intent: PaymentIntent): void => {
    void navigator.clipboard?.writeText(intent.value);
  };
  const paymentIntentHref = (intent: PaymentIntent): string | undefined =>
    /^(https?:|bitcoin:|lightning:|cashu:|monero:)/i.test(intent.value) ? intent.value : undefined;
  return (
    <div className="listing-details">
      {hideSeller ? null : <SellerSummaryCard summary={sellerSummary} />}
      <PlainTextBlock className="listing-description" text={listing.description} />
      <dl className="meta">
        <div>
          <dt>{t('listing.location')}</dt>
          <dd>{listing.region || '-'}</dd>
        </div>
        <div>
          <dt>{t('listing.price')}</dt>
          <dd>{formatListingPrice(listing)}</dd>
        </div>
        <div>
          <dt>{t('listing.contact')}</dt>
          <dd>{formatContact(listing.contactMethod)}</dd>
        </div>
        <div>
          <dt>{t('listing.expires')}</dt>
          <dd>{listing.expiresAt}</dd>
        </div>
        <div>
          <dt>{t('listing.status')}</dt>
          <dd>{t(`listing.status.${listing.status}`)}</dd>
        </div>
        {listing.price.note ? (
          <div>
            <dt>{t('listing.priceNote')}</dt>
            <dd>{listing.price.note}</dd>
          </div>
        ) : null}
        {listing.publishedAt ? (
          <div>
            <dt>{t('listing.publishedAt')}</dt>
            <dd>{listing.publishedAt}</dd>
          </div>
        ) : null}
        <div>
          <dt>{t('listing.fulfillment')}</dt>
          <dd>{fulfillmentBadgeForListing(listing, t)}</dd>
        </div>
        {listing.fulfillmentNotes ? (
          <div>
            <dt>{t('listing.fulfillmentNotes')}</dt>
            <dd>{listing.fulfillmentNotes}</dd>
          </div>
        ) : null}
        <div>
          <dt>{t('agreement.mediator')}</dt>
          <dd>{listing.mediatorPreference || '-'}</dd>
        </div>
        <div>
          <dt>{t('common.publicKey')}</dt>
          <dd className="key">{listing.authorPublicKey}</dd>
        </div>
      </dl>
      {listing.paymentIntents && listing.paymentIntents.length > 0 ? (
        <div className="payment-intents">
          <h4>{t('listing.paymentIntent')}</h4>
          {listing.paymentIntents.map((intent) => (
            <article className="inline-card" key={intent.id}>
              <div className="row between">
                <span className="pill">{paymentBadgeLabel(intent.method, t)}</span>
                <div className="actions small">
                  <button className="subtle" onClick={() => copyPaymentIntent(intent)} type="button">
                    {t('listing.paymentIntentCopy')}
                  </button>
                  {paymentIntentHref(intent) ? (
                    <button
                      className="subtle"
                      onClick={() => {
                        const href = paymentIntentHref(intent);
                        if (href) window.open(href, '_blank', 'noopener,noreferrer');
                      }}
                      type="button"
                    >
                      {t('listing.paymentIntentOpen')}
                    </button>
                  ) : null}
                </div>
              </div>
              <p className="key">{intent.value}</p>
              {intent.note ? <p className="muted">{intent.note}</p> : null}
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ListingImageGallery({ images = [], title }: { images?: ListingImage[]; title: string }): ReactNode {
  const { t } = useI18n();
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const visibleImages = images.filter((image) => !failedImages.includes(image.url));
  useEffect(() => {
    if (activeIndex >= visibleImages.length) setActiveIndex(Math.max(0, visibleImages.length - 1));
  }, [activeIndex, visibleImages.length]);
  if (visibleImages.length === 0) {
    return (
      <div className="listing-gallery empty-gallery">
        <span>{t('listing.noImages')}</span>
      </div>
    );
  }
  const displayIndex = Math.min(activeIndex, visibleImages.length - 1);
  const activeImage = visibleImages[displayIndex] ?? visibleImages[0];
  const move = (direction: -1 | 1): void => {
    setActiveIndex((current) => (current + direction + visibleImages.length) % visibleImages.length);
  };
  return (
    <div className="listing-gallery listing-image-flipper" aria-label={t('listing.images')}>
      <figure className="listing-image-viewer">
        <img
          src={activeImage.url}
          alt={activeImage.altText || title}
          loading="eager"
          onError={() => setFailedImages((current) => [...new Set([...current, activeImage.url])])}
        />
        <figcaption>
          <span>{activeImage.altText || title}</span>
          <span>{t('listing.imageCount').replace('{current}', String(displayIndex + 1)).replace('{total}', String(visibleImages.length))}</span>
        </figcaption>
      </figure>
      {visibleImages.length > 1 ? (
        <>
          <div className="image-flipper-controls">
            <button className="subtle" onClick={() => move(-1)} type="button">
              <ChevronLeft size={16} /> {t('listing.imagePrevious')}
            </button>
            <button className="subtle" onClick={() => move(1)} type="button">
              {t('listing.imageNext')} <ChevronRight size={16} />
            </button>
          </div>
          <div className="image-flipper-thumbs" aria-label={t('listing.imageThumbnails')}>
            {visibleImages.map((image, index) => (
              <button
                aria-label={t('listing.imageSelect').replace('{index}', String(index + 1))}
                className={index === displayIndex ? 'active' : undefined}
                key={image.id}
                onClick={() => setActiveIndex(index)}
                type="button"
              >
                <img src={image.url} alt="" loading="lazy" onError={() => setFailedImages((current) => [...new Set([...current, image.url])])} />
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function listingLightningSource(listing: Listing, sellerProfile?: PublicProfile): string {
  return (
    listing.paymentIntents?.find((intent) => intent.method === 'lightning' && intent.value.trim())?.value.trim() ||
    sellerProfile?.lightningAddress?.trim() ||
    sellerProfile?.lnurl?.trim() ||
    ''
  );
}

function defaultLightningAmountSats(listing: Listing): string {
  const amount = Number(listing.price.amount);
  const currency = listing.price.currency.toUpperCase();
  if (Number.isFinite(amount) && amount > 0 && ['SAT', 'SATS', 'MSAT', 'MSATS'].includes(currency)) {
    return String(currency.startsWith('MSAT') ? Math.max(1, Math.ceil(amount / 1000)) : Math.ceil(amount));
  }
  return '100';
}

function LightningPaymentPanel({
  listing,
  sellerProfile,
  identity,
  privateKeyHex,
  nostrSigner,
  relays,
  attempts,
  nwcConnections,
  unlockedNwcConnectionIds,
  onConnectSigner,
  onCreatePaymentAttempt,
  onCheckReceipt,
  onSaveNwcConnection,
  onUnlockNwcConnection,
  onPayWithNwc
}: {
  listing: Listing;
  sellerProfile?: PublicProfile;
  identity?: IdentityRecord;
  privateKeyHex: string;
  nostrSigner: NostrSignerState;
  relays: RelayConfig[];
  attempts: LightningPaymentAttempt[];
  nwcConnections: NwcConnection[];
  unlockedNwcConnectionIds: string[];
  onConnectSigner: () => void;
  onCreatePaymentAttempt: (request: LightningPaymentRequest) => Promise<LightningPaymentAttempt>;
  onCheckReceipt: (attempt: LightningPaymentAttempt) => Promise<LightningPaymentAttempt>;
  onSaveNwcConnection: (request: SaveNwcConnectionRequest) => Promise<NwcConnection>;
  onUnlockNwcConnection: (connection: NwcConnection, passphrase: string) => Promise<void>;
  onPayWithNwc: (attempt: LightningPaymentAttempt, connectionId: string) => Promise<LightningPaymentAttempt>;
}): ReactNode {
  const { t } = useI18n();
  const source = listingLightningSource(listing, sellerProfile);
  const [amountSats, setAmountSats] = useState(defaultLightningAmountSats(listing));
  const [publicNote, setPublicNote] = useState('');
  const [walletUri, setWalletUri] = useState('');
  const [walletPassphrase, setWalletPassphrase] = useState('');
  const [showWalletConnect, setShowWalletConnect] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [activeAttempt, setActiveAttempt] = useState<LightningPaymentAttempt | undefined>();
  const onCheckReceiptRef = useRef(onCheckReceipt);
  const activeAttemptRef = useRef(activeAttempt);
  useEffect(() => {
    onCheckReceiptRef.current = onCheckReceipt;
  }, [onCheckReceipt]);
  useEffect(() => {
    activeAttemptRef.current = activeAttempt;
  }, [activeAttempt]);
  const enabledRelayCount = relays.filter((relay) => relay.enabled).length;
  const canUseLocal = Boolean(identityCanUseLocalUnlock(identity) && privateKeyHex);
  const canUseSigner = Boolean(identity && nostrSigner.connected && nostrSigner.publicKey?.toLowerCase() === identity.publicKey.toLowerCase());
  const listingAttempts = attempts.filter((attempt) => attempt.listingId === listing.id);
  const visibleAttempt = activeAttempt ?? listingAttempts[0];
  const walletConnection = nwcConnections[0];
  const walletUnlocked = Boolean(walletConnection && unlockedNwcConnectionIds.includes(walletConnection.id));
  const watchedAttemptId = activeAttempt?.id;
  const watchedAttemptStatus = activeAttempt?.status;
  const canGenerate = Boolean(identity && enabledRelayCount > 0 && Number(amountSats) > 0 && (canUseLocal || canUseSigner));
  const canPayWithWallet = Boolean(source && canGenerate && walletConnection && walletUnlocked);
  const duplicatePaymentSent = Boolean(visibleAttempt?.nwcRequestEventId && visibleAttempt.status !== 'failed');
  const generate = async (): Promise<LightningPaymentAttempt> => {
    setError('');
    setWorking(true);
    try {
      const attempt = await onCreatePaymentAttempt({
        listing,
        sellerProfile,
        lnurlSource: source,
        amountSats: Math.floor(Number(amountSats)),
        publicNote
      });
      setActiveAttempt(attempt);
      return attempt;
    } catch (err) {
      setError(err instanceof Error ? err.message : t('payment.invoiceFailed'));
      throw err;
    } finally {
      setWorking(false);
    }
  };
  const connectWallet = async (): Promise<void> => {
    setError('');
    setWorking(true);
    try {
      await onSaveNwcConnection({ uri: walletUri, passphrase: walletPassphrase });
      setWalletUri('');
      setShowWalletConnect(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('nwc.invalidUri'));
    } finally {
      setWorking(false);
    }
  };
  const unlockWallet = async (): Promise<void> => {
    if (!walletConnection) return;
    setError('');
    setWorking(true);
    try {
      await onUnlockNwcConnection(walletConnection, walletPassphrase);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('nwc.unlockFailed'));
    } finally {
      setWorking(false);
    }
  };
  const pay = async (): Promise<void> => {
    setError('');
    if (!walletConnection) {
      setShowWalletConnect(true);
      return;
    }
    if (!walletUnlocked) {
      setError(t('nwc.unlockRequired'));
      return;
    }
    if (duplicatePaymentSent) {
      setError(t('nwc.duplicateWarning'));
      return;
    }
    setWorking(true);
    try {
      const attempt =
        visibleAttempt && (visibleAttempt.status === 'invoice-created' || visibleAttempt.status === 'failed') ? visibleAttempt : await generate();
      setActiveAttempt(await onPayWithNwc(attempt, walletConnection.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('nwc.paymentFailed'));
    } finally {
      setWorking(false);
    }
  };
  const check = async (attempt: LightningPaymentAttempt): Promise<void> => {
    setError('');
    setWorking(true);
    try {
      setActiveAttempt(await onCheckReceipt(attempt));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('payment.receiptCheckFailed'));
    } finally {
      setWorking(false);
    }
  };
  useEffect(() => {
    const watchedAttempt = activeAttemptRef.current;
    if (!watchedAttempt || watchedAttempt.status !== 'invoice-created') return;
    let cancelled = false;
    let checks = 0;
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
    const tick = (): void => {
      if (cancelled || checks >= 5) return;
      checks += 1;
      void onCheckReceiptRef.current(watchedAttempt)
        .then((updated) => {
          if (cancelled) return;
          setActiveAttempt(updated);
          if (updated.status === 'invoice-created' && checks < 5) {
            timer = globalThis.setTimeout(tick, 12000);
          }
        })
        .catch(() => {
          if (!cancelled && checks < 5) timer = globalThis.setTimeout(tick, 12000);
        });
    };
    timer = globalThis.setTimeout(tick, 12000);
    return () => {
      cancelled = true;
      if (timer) globalThis.clearTimeout(timer);
    };
  }, [watchedAttemptId, watchedAttemptStatus]);
  if (!source) return null;
  return (
    <section className="lightning-payment-panel">
      <div className="row">
        <ReceiptText size={16} aria-hidden="true" />
        <strong>{t('payment.lightningTitle')}</strong>
      </div>
      <p className="muted">{walletConnection ? t('nwc.confirmationWarning') : t('nwc.noWalletInline')}</p>
      <label>
        {t('payment.amountSats')}
        <input inputMode="numeric" min="1" type="number" value={amountSats} onChange={(event) => setAmountSats(event.target.value)} />
      </label>
      <label>
        {t('payment.publicNote')}
        <input maxLength={240} placeholder={t('payment.publicNotePlaceholder')} value={publicNote} onChange={(event) => setPublicNote(event.target.value)} />
      </label>
      {!identity ? <p className="warning compact-warning">{t('payment.identityRequired')}</p> : null}
      {identity && enabledRelayCount === 0 ? <p className="warning compact-warning">{t('nostrContact.relaysRequired')}</p> : null}
      {identity && !canUseLocal && !canUseSigner ? <p className="warning compact-warning">{t('payment.signerRequired')}</p> : null}
      {walletConnection && !walletUnlocked ? <p className="warning compact-warning">{t('nwc.unlockRequired')}</p> : null}
      {error ? <p className="warning" role="alert">{error}</p> : null}
      {showWalletConnect || !walletConnection ? (
        <div className="inline-card">
          <strong>{t('nwc.title')}</strong>
          <label>
            {t('nwc.uri')}
            <input placeholder={t('nwc.uriPlaceholder')} value={walletUri} onChange={(event) => setWalletUri(event.target.value)} />
          </label>
          <label>
            {t('nwc.passphrase')}
            <input type="password" value={walletPassphrase} onChange={(event) => setWalletPassphrase(event.target.value)} />
          </label>
          <p className="muted">{t('nwc.notBackedUp')}</p>
          <button disabled={working || !walletUri || walletPassphrase.length < 10} onClick={() => void connectWallet()} type="button">
            {t('nwc.connect')}
          </button>
        </div>
      ) : !walletUnlocked ? (
        <div className="inline-card">
          <strong>{walletConnection.label}</strong>
          <label>
            {t('nwc.passphrase')}
            <input type="password" value={walletPassphrase} onChange={(event) => setWalletPassphrase(event.target.value)} />
          </label>
          <button disabled={working || walletPassphrase.length < 10} onClick={() => void unlockWallet()} type="button">
            {t('nwc.unlock')}
          </button>
        </div>
      ) : (
        <p className="ok compact-warning">{t('nwc.connected')}</p>
      )}
      <div className="actions small">
        {identity && !canUseLocal && !canUseSigner ? (
          <button className="subtle" onClick={onConnectSigner} type="button">
            <KeyRound size={16} /> {nostrSigner.connected ? t('signer.reconnect') : t('signer.connect')}
          </button>
        ) : null}
        <button disabled={!canPayWithWallet || working || duplicatePaymentSent} onClick={() => void pay()} type="button">
          {working
            ? t('payment.working')
            : visibleAttempt?.status === 'failed'
              ? t('nwc.retryPayment')
              : visibleAttempt?.status === 'paid'
                ? t('nwc.paymentPaid')
                : t('nwc.pay')}
        </button>
      </div>
      {visibleAttempt ? (
        <article className="inline-card">
          <div className="row between">
            <strong>{t(`payment.status.${visibleAttempt.status}`)}</strong>
            {visibleAttempt.status === 'failed' && visibleAttempt.nwcConnectionId ? <span className="warning mini">{t('nwc.retryWarning')}</span> : null}
          </div>
          {visibleAttempt.error ? <p className="muted">{visibleAttempt.error}</p> : null}
          {visibleAttempt.statusDetail ? <p className="muted">{visibleAttempt.statusDetail}</p> : null}
        </article>
      ) : null}
      <DisclosurePanel title={t('payment.details')}>
        <SafetyNotice>{t('payment.metadataWarning')}</SafetyNotice>
        <p className="key">{source}</p>
        {visibleAttempt ? (
          <div className="actions small">
            <button className="subtle" onClick={() => void navigator.clipboard?.writeText(visibleAttempt.bolt11)} type="button">
              {t('payment.copyInvoice')}
            </button>
            <button className="subtle" onClick={() => window.open(`lightning:${visibleAttempt.bolt11}`, '_blank', 'noopener,noreferrer')} type="button">
              {t('payment.openInvoice')}
            </button>
            <button className="subtle" onClick={() => void check(visibleAttempt)} disabled={working} type="button">
              {t('payment.checkReceipt')}
            </button>
          </div>
        ) : (
          <button disabled={!canGenerate || working} onClick={() => void generate()} type="button">
            {working ? t('payment.working') : t('payment.generateInvoice')}
          </button>
        )}
        {visibleAttempt?.nwcRequestEventId ? <p className="key">{visibleAttempt.nwcRequestEventId}</p> : null}
        {visibleAttempt?.nwcResponseEventId ? <p className="key">{visibleAttempt.nwcResponseEventId}</p> : null}
        {listingAttempts.slice(0, 3).map((attempt) => (
          <p className="muted" key={attempt.id}>
            {attempt.createdAt} · {attempt.amountSats} sats · {t(`payment.status.${attempt.status}`)}
          </p>
        ))}
      </DisclosurePanel>
    </section>
  );
}

function ListingZapReceiptsPanel({
  receipts,
  onCheck
}: {
  receipts: ListingZapReceipt[];
  onCheck: () => Promise<ListingZapReceipt[]>;
}): ReactNode {
  const { t } = useI18n();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const totalSats = receipts.reduce((total, receipt) => total + Math.floor(receipt.amountMsats / 1000), 0);
  const check = async (): Promise<void> => {
    setError('');
    setChecking(true);
    try {
      await onCheck();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('listingZap.checkFailed'));
    } finally {
      setChecking(false);
    }
  };
  return (
    <section className="inline-card">
      <div className="row">
        <ReceiptText size={16} aria-hidden="true" />
        <strong>{t('listingZap.title')}</strong>
      </div>
      <p className="muted">
        {receipts.length > 0
          ? t('listingZap.summary').replace('{count}', String(receipts.length)).replace('{sats}', String(totalSats))
          : t('listingZap.empty')}
      </p>
      <button className="subtle" disabled={checking} onClick={() => void check()} type="button">
        {checking ? t('listingZap.checking') : t('listingZap.check')}
      </button>
      {error ? <p className="warning compact-warning" role="alert">{error}</p> : null}
      {receipts.length > 0 ? (
        <DisclosurePanel title={t('listingZap.receipts')}>
          <SafetyNotice>{t('listingZap.warning')}</SafetyNotice>
          {receipts.slice(0, 5).map((receipt) => (
            <p className="muted" key={receipt.id}>
              {receipt.paidAt} · {Math.floor(receipt.amountMsats / 1000)} sats · {shortPublicKey(receipt.buyerPublicKey)}
            </p>
          ))}
        </DisclosurePanel>
      ) : null}
    </section>
  );
}

function OperatorSupportPanel({
  config,
  identity,
  privateKeyHex,
  nostrSigner,
  relays,
  attempts,
  receipts,
  nwcConnections,
  unlockedNwcConnectionIds,
  onConnectSigner,
  onCreatePaymentAttempt,
  onCheckReceipt,
  onSaveNwcConnection,
  onUnlockNwcConnection,
  onPayWithNwc
}: {
  config: OperatorSupportConfig;
  identity?: IdentityRecord;
  privateKeyHex: string;
  nostrSigner: NostrSignerState;
  relays: RelayConfig[];
  attempts: LightningPaymentAttempt[];
  receipts: OperatorSupportReceipt[];
  nwcConnections: NwcConnection[];
  unlockedNwcConnectionIds: string[];
  onConnectSigner: () => void;
  onCreatePaymentAttempt: (request: OperatorSupportPaymentRequest) => Promise<LightningPaymentAttempt>;
  onCheckReceipt: (attempt?: LightningPaymentAttempt) => Promise<OperatorSupportReceipt | undefined>;
  onSaveNwcConnection: (request: SaveNwcConnectionRequest) => Promise<NwcConnection>;
  onUnlockNwcConnection: (connection: NwcConnection, passphrase: string) => Promise<void>;
  onPayWithNwc: (attempt: LightningPaymentAttempt, connectionId: string) => Promise<LightningPaymentAttempt>;
}): ReactNode {
  const { t } = useI18n();
  const [amountSats, setAmountSats] = useState(config.minimumSats);
  const [publicNote, setPublicNote] = useState('');
  const [walletUri, setWalletUri] = useState('');
  const [walletPassphrase, setWalletPassphrase] = useState('');
  const [showWalletConnect, setShowWalletConnect] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [activeAttempt, setActiveAttempt] = useState<LightningPaymentAttempt | undefined>();
  const enabledRelayCount = relays.filter((relay) => relay.enabled).length;
  const canUseLocal = Boolean(identityCanUseLocalUnlock(identity) && privateKeyHex);
  const canUseSigner = Boolean(identity && nostrSigner.connected && nostrSigner.publicKey?.toLowerCase() === identity.publicKey.toLowerCase());
  const supportReceipt = supportReceiptForPublicKey(identity?.publicKey, receipts);
  const supportAttempts = attempts.filter((attempt) => attempt.purpose === 'operator-support' && publicKeysMatch(attempt.badgeSubjectPublicKey, identity?.publicKey));
  const visibleAttempt = activeAttempt ?? supportAttempts[0];
  const walletConnection = nwcConnections[0];
  const walletUnlocked = Boolean(walletConnection && unlockedNwcConnectionIds.includes(walletConnection.id));
  const canGenerate = Boolean(identity && enabledRelayCount > 0 && Number(amountSats) >= config.minimumSats && (canUseLocal || canUseSigner));
  const canPayWithWallet = Boolean(canGenerate && walletConnection && walletUnlocked);
  const duplicatePaymentSent = Boolean(visibleAttempt?.nwcRequestEventId && visibleAttempt.status !== 'failed');

  const generate = async (): Promise<LightningPaymentAttempt> => {
    setError('');
    setWorking(true);
    try {
      const attempt = await onCreatePaymentAttempt({ amountSats: Math.floor(Number(amountSats)), publicNote });
      setActiveAttempt(attempt);
      return attempt;
    } catch (err) {
      setError(err instanceof Error ? err.message : t('payment.invoiceFailed'));
      throw err;
    } finally {
      setWorking(false);
    }
  };
  const connectWallet = async (): Promise<void> => {
    setError('');
    setWorking(true);
    try {
      await onSaveNwcConnection({ uri: walletUri, passphrase: walletPassphrase });
      setWalletUri('');
      setShowWalletConnect(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('nwc.invalidUri'));
    } finally {
      setWorking(false);
    }
  };
  const unlockWallet = async (): Promise<void> => {
    if (!walletConnection) return;
    setError('');
    setWorking(true);
    try {
      await onUnlockNwcConnection(walletConnection, walletPassphrase);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('nwc.unlockFailed'));
    } finally {
      setWorking(false);
    }
  };
  const pay = async (): Promise<void> => {
    setError('');
    if (!walletConnection) {
      setShowWalletConnect(true);
      return;
    }
    if (!walletUnlocked) {
      setError(t('nwc.unlockRequired'));
      return;
    }
    if (duplicatePaymentSent) {
      setError(t('nwc.duplicateWarning'));
      return;
    }
    setWorking(true);
    try {
      const attempt =
        visibleAttempt && (visibleAttempt.status === 'invoice-created' || visibleAttempt.status === 'failed') ? visibleAttempt : await generate();
      setActiveAttempt(await onPayWithNwc(attempt, walletConnection.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('nwc.paymentFailed'));
    } finally {
      setWorking(false);
    }
  };
  const check = async (attempt?: LightningPaymentAttempt): Promise<void> => {
    setError('');
    setWorking(true);
    try {
      await onCheckReceipt(attempt);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('support.receiptNotFound'));
    } finally {
      setWorking(false);
    }
  };

  if (!config.enabled) return null;
  if (supportReceipt) {
    return (
      <section className="operator-support-panel">
        <div className="row between">
          <div>
            <strong>{t('support.title')}</strong>
            <p className="muted">{t('support.alreadyPaid')}</p>
          </div>
          <SupporterBadge receipt={supportReceipt} />
        </div>
        <div className="actions small">
          <button className="subtle" disabled={working} onClick={() => void check()} type="button">
            {working ? t('payment.working') : t('support.refreshBadges')}
          </button>
        </div>
        {error ? <p className="warning compact-warning" role="alert">{error}</p> : null}
        <DisclosurePanel title={t('payment.details')}>
          <SafetyNotice>{t('support.metadataWarning')}</SafetyNotice>
          <p className="key">{supportReceipt.receiptEventId}</p>
          <p className="muted">
            {Math.floor(supportReceipt.amountMsats / 1000)} sats · {supportReceipt.validatedAt}
          </p>
          <p className="key">{supportReceipt.operatorLnurl}</p>
        </DisclosurePanel>
      </section>
    );
  }
  return (
    <section className="operator-support-panel">
      <div className="row between">
        <div>
          <strong>{t('support.title')}</strong>
          <p className="muted">{t('support.body').replace('{amount}', String(config.minimumSats)).replace('{operator}', config.label)}</p>
        </div>
        <SupporterBadge receipt={supportReceipt} />
      </div>
      <label>
        {t('payment.amountSats')}
        <input inputMode="numeric" min={config.minimumSats} type="number" value={amountSats} onChange={(event) => setAmountSats(Number(event.target.value))} />
      </label>
      <label>
        {t('payment.publicNote')}
        <input maxLength={240} placeholder={t('support.publicNotePlaceholder')} value={publicNote} onChange={(event) => setPublicNote(event.target.value)} />
      </label>
      {!identity ? <p className="warning compact-warning">{t('payment.identityRequired')}</p> : null}
      {identity && enabledRelayCount === 0 ? <p className="warning compact-warning">{t('nostrContact.relaysRequired')}</p> : null}
      {identity && !canUseLocal && !canUseSigner ? <p className="warning compact-warning">{t('payment.signerRequired')}</p> : null}
      {walletConnection && !walletUnlocked ? <p className="warning compact-warning">{t('nwc.unlockRequired')}</p> : null}
      {error ? <p className="warning" role="alert">{error}</p> : null}
      {showWalletConnect || !walletConnection ? (
        <DisclosurePanel title={t('nwc.title')}>
          <label>
            {t('nwc.uri')}
            <input placeholder={t('nwc.uriPlaceholder')} value={walletUri} onChange={(event) => setWalletUri(event.target.value)} />
          </label>
          <label>
            {t('nwc.passphrase')}
            <input type="password" value={walletPassphrase} onChange={(event) => setWalletPassphrase(event.target.value)} />
          </label>
          <p className="muted">{t('nwc.notBackedUp')}</p>
          <button disabled={working || !walletUri || walletPassphrase.length < 10} onClick={() => void connectWallet()} type="button">
            {t('nwc.connect')}
          </button>
        </DisclosurePanel>
      ) : !walletUnlocked ? (
        <DisclosurePanel title={walletConnection.label}>
          <label>
            {t('nwc.passphrase')}
            <input type="password" value={walletPassphrase} onChange={(event) => setWalletPassphrase(event.target.value)} />
          </label>
          <button disabled={working || walletPassphrase.length < 10} onClick={() => void unlockWallet()} type="button">
            {t('nwc.unlock')}
          </button>
        </DisclosurePanel>
      ) : null}
      <div className="actions small">
        {identity && !canUseLocal && !canUseSigner ? (
          <button className="subtle" onClick={onConnectSigner} type="button">
            <KeyRound size={16} /> {nostrSigner.connected ? t('signer.reconnect') : t('signer.connect')}
          </button>
        ) : null}
        <button disabled={!canPayWithWallet || working || duplicatePaymentSent} onClick={() => void pay()} type="button">
          {working ? t('payment.working') : t('support.pay')}
        </button>
        <button className="subtle" disabled={working || !identity} onClick={() => void check()} type="button">
          {t('support.checkReceipts')}
        </button>
      </div>
      <DisclosurePanel title={t('payment.details')}>
        <SafetyNotice>{t('support.metadataWarning')}</SafetyNotice>
        <p className="key">{config.lnurl}</p>
        {visibleAttempt ? (
          <div className="actions small">
            <button className="subtle" onClick={() => void navigator.clipboard?.writeText(visibleAttempt.bolt11)} type="button">
              {t('payment.copyInvoice')}
            </button>
            <button className="subtle" onClick={() => window.open(`lightning:${visibleAttempt.bolt11}`, '_blank', 'noopener,noreferrer')} type="button">
              {t('payment.openInvoice')}
            </button>
            <button className="subtle" onClick={() => void check(visibleAttempt)} disabled={working} type="button">
              {t('payment.checkReceipt')}
            </button>
          </div>
        ) : (
          <button disabled={!canGenerate || working} onClick={() => void generate()} type="button">
            {working ? t('payment.working') : t('payment.generateInvoice')}
          </button>
        )}
        {visibleAttempt ? (
          <p className="muted">
            {visibleAttempt.createdAt} · {visibleAttempt.amountSats} sats · {t(`payment.status.${visibleAttempt.status}`)}
          </p>
        ) : null}
      </DisclosurePanel>
    </section>
  );
}

function NwcWalletPanel({
  connections,
  unlockedConnectionIds,
  onSave,
  onUnlock,
  onLock,
  onDisconnect,
  onTest
}: {
  connections: NwcConnection[];
  unlockedConnectionIds: string[];
  onSave: (request: SaveNwcConnectionRequest) => Promise<NwcConnection>;
  onUnlock: (connection: NwcConnection, passphrase: string) => Promise<void>;
  onLock: (connectionId: string) => void;
  onDisconnect: (connectionId: string) => void;
  onTest: (connection: NwcConnection) => Promise<void>;
}): ReactNode {
  const { t } = useI18n();
  const [uri, setUri] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const connection = connections[0];
  const unlocked = Boolean(connection && unlockedConnectionIds.includes(connection.id));
  const run = async (action: () => Promise<void>, fallback: string): Promise<void> => {
    setMessage('');
    setWorking(true);
    try {
      await action();
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : fallback);
    } finally {
      setWorking(false);
    }
  };
  return (
    <DisclosurePanel title={t('nwc.title')} defaultOpen>
      <p className="muted">{t('nwc.body')}</p>
      {connection ? (
        <article className="inline-card">
          <div className="row between">
            <strong>{connection.label}</strong>
            <span className={unlocked ? 'ok mini' : 'warning mini'}>{unlocked ? t('nwc.unlocked') : t('nwc.locked')}</span>
          </div>
          <p className="key">{connection.walletPublicKey}</p>
          <p className="muted">
            {connection.relayUrls.join(', ')}
            {connection.lastConnectedAt ? ` · ${connection.lastConnectedAt}` : ''}
          </p>
          {connection.lastError ? <p className="warning">{connection.lastError}</p> : null}
          {!unlocked ? (
            <label>
              {t('nwc.passphrase')}
              <input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} />
            </label>
          ) : null}
          {message ? <p className="warning" role="alert">{message}</p> : null}
          <div className="actions small">
            {!unlocked ? (
              <button disabled={working || passphrase.length < 10} onClick={() => void run(() => onUnlock(connection, passphrase), t('nwc.unlockFailed'))} type="button">
                {t('nwc.unlock')}
              </button>
            ) : (
              <button className="subtle" onClick={() => onLock(connection.id)} type="button">
                {t('nwc.lock')}
              </button>
            )}
            <button className="subtle" disabled={working || !unlocked} onClick={() => void run(() => onTest(connection), t('nwc.testFailed'))} type="button">
              {t('nwc.test')}
            </button>
            <button className="danger" disabled={working} onClick={() => onDisconnect(connection.id)} type="button">
              {t('nwc.disconnect')}
            </button>
          </div>
        </article>
      ) : (
        <div className="inline-card">
          <label>
            {t('nwc.uri')}
            <input placeholder={t('nwc.uriPlaceholder')} value={uri} onChange={(event) => setUri(event.target.value)} />
          </label>
          <label>
            {t('nwc.passphrase')}
            <input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} />
          </label>
          <p className="muted">{t('nwc.notBackedUp')}</p>
          {message ? <p className="warning" role="alert">{message}</p> : null}
          <button
            disabled={working || !uri.trim() || passphrase.length < 10}
            onClick={() =>
              void run(async () => {
                await onSave({ uri, passphrase });
                setUri('');
              }, t('nwc.invalidUri'))
            }
            type="button"
          >
            {t('nwc.connect')}
          </button>
        </div>
      )}
    </DisclosurePanel>
  );
}

function NostrContactPanel({
  target,
  identity,
  relays,
  nostrSigner,
  privateKeyHex,
  receipts,
  defaultOpen = false,
  onConnectSigner,
  onSend
}: {
  target: NostrContactTarget;
  identity?: IdentityRecord;
  relays: RelayConfig[];
  nostrSigner: NostrSignerState;
  privateKeyHex: string;
  receipts: NostrContactReceipt[];
  defaultOpen?: boolean;
  onConnectSigner: () => void;
  onSend: (args: SendNostrContactIntroArgs) => Promise<NostrContactReceipt>;
}): ReactNode {
  const { t } = useI18n();
  const normalized = normalizeNostrContact(target.recipientPublicKey);
  const [open, setOpen] = useState(defaultOpen);
  const [message, setMessage] = useState('');
  const [includeContext, setIncludeContext] = useState(Boolean(target.contextTitle));
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [lastSentReceipt, setLastSentReceipt] = useState<NostrContactReceipt | undefined>();
  const enabledRelayCount = relays.filter((relay) => relay.enabled).length;
  const canUseLocal = Boolean(identityCanUseLocalUnlock(identity) && privateKeyHex);
  const canUseSigner = Boolean(
    identity &&
      nostrSigner.connected &&
      nostrSigner.publicKey?.toLowerCase() === identity.publicKey.toLowerCase() &&
      signerSupportsNip44Encryption()
  );
  const canSend = Boolean(normalized && identity && enabledRelayCount > 0 && message.trim() && message.trim().length <= NOSTR_INTRO_MESSAGE_LIMIT && (canUseLocal || canUseSigner));
  const contextReceipts = receipts.filter(
    (receipt) =>
      receipt.recipientPublicKey.toLowerCase() === normalized?.publicKey.toLowerCase() &&
      receipt.contextType === target.contextType &&
      (!target.contextId || receipt.contextId === target.contextId)
  );
  const visibleReceipt = lastSentReceipt ?? contextReceipts[0];
  const sendBlocker = !identity
    ? t('nostrContact.identityRequired')
    : enabledRelayCount === 0
      ? t('nostrContact.relaysRequired')
      : !canUseLocal && !canUseSigner
        ? t('nostrContact.signerRequired')
        : '';
  const copy = (value: string): void => {
    void navigator.clipboard?.writeText(value);
  };

  const send = async (): Promise<void> => {
    if (!normalized) return;
    setError('');
    setSending(true);
    try {
      const receipt = await onSend({
        ...target,
        recipientPublicKey: normalized.publicKey,
        message,
        includeContext
      });
      setLastSentReceipt(receipt);
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('nostrContact.sendFailed'));
    } finally {
      setSending(false);
    }
  };

  if (!normalized) return null;

  return (
    <section className="nostr-contact">
      <button className="subtle" onClick={() => setOpen((current) => !current)} type="button">
        <Radio size={16} /> {t('nostrContact.messageAction')}
      </button>
      {open ? (
        <div className="nostr-contact-panel">
          <div className="row between">
            <div>
              <strong>{target.label}</strong>
              <p className="muted">{t('nostrContact.title')}</p>
            </div>
          </div>
          {target.contextTitle ? (
            <div className="message-context">
              <span className="form-eyebrow">{t('nostrContact.context')}</span>
              <strong>{target.contextTitle}</strong>
              <p className="muted">{t(`nostrContact.context.${target.contextType}`)}</p>
              <label className="context-toggle">
                <input type="checkbox" checked={includeContext} onChange={(event) => setIncludeContext(event.target.checked)} />
                <span>{t('nostrContact.includeContext')}</span>
              </label>
            </div>
          ) : null}
          <label>
            {t('nostrContact.message')}
            <textarea
              maxLength={NOSTR_INTRO_MESSAGE_LIMIT}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={t('nostrContact.placeholder')}
              value={message}
            />
          </label>
          <p className="muted compact-meta">{t('nostrContact.length').replace('{count}', String(message.length)).replace('{limit}', String(NOSTR_INTRO_MESSAGE_LIMIT))}</p>
          {sendBlocker ? <p className="warning compact-warning">{sendBlocker}</p> : null}
          {error ? <p className="warning" role="alert">{error}</p> : null}
          <div className="actions small">
            {identity && !canUseLocal && !canUseSigner ? (
              <button className="subtle" onClick={onConnectSigner} type="button">
                <KeyRound size={16} /> {nostrSigner.connected ? t('signer.reconnect') : t('signer.connect')}
              </button>
            ) : null}
            <button disabled={!canSend || sending} onClick={() => void send()} type="button">
              {sending ? t('nostrContact.sending') : t('nostrContact.send')}
            </button>
            <button className="subtle" onClick={() => (window.location.hash = 'inbox')} type="button">
              {t('nostrInbox.open')}
            </button>
          </div>
          {lastSentReceipt ? (
            <p className={lastSentReceipt.status === 'failed' ? 'warning compact-warning' : 'ok compact-meta'}>
              {lastSentReceipt.status === 'failed' ? t('nostrContact.sentFailedCompact') : t('nostrContact.sentCompact')}
            </p>
          ) : null}
          <DisclosurePanel title={t('nostrContact.details')}>
            <SafetyNotice>{t('nostrContact.metadataWarning')}</SafetyNotice>
            <p className="muted">{t('nostrContact.relaysEnabled').replace('{count}', String(enabledRelayCount))}</p>
            {!canUseLocal && !canUseSigner ? <ActionHint>{t('nostrContact.copyFallback')}</ActionHint> : null}
            <div className="actions small">
              <button className="subtle" onClick={() => copy(normalized.npub)} type="button">
                {t('nostrContact.copyNpub')}
              </button>
              <button className="subtle" onClick={() => copy(normalized.uri)} type="button">
                {t('nostrContact.copyUri')}
              </button>
              <button className="subtle" disabled={!message.trim()} onClick={() => copy(message)} type="button">
                {t('nostrContact.copyDraft')}
              </button>
            </div>
            {visibleReceipt ? (
              <div className="receipt-summary">
                <p className="muted">
                  {t('nostrContact.recentReceipt')}: {visibleReceipt.status} · {visibleReceipt.sentAt}
                </p>
                <p className="muted">{t('nostrContact.lookupHint')}</p>
                <p className="key">{visibleReceipt.eventIds.join(', ')}</p>
                <button className="subtle" onClick={() => copy(visibleReceipt.eventIds.join('\n'))} type="button">
                  {t('nostrContact.copyEventIds')}
                </button>
              </div>
            ) : null}
          </DisclosurePanel>
        </div>
      ) : null}
    </section>
  );
}

function ListingPage({
  route,
  listings,
  syncedListings,
  syncedProfiles,
  profile,
  attestations,
  syncedAttestations,
  allowlist,
  identity,
  blossomServers,
  privateKeyHex,
  nostrSigner,
  publishReceipts,
  nostrContactReceipts,
  lightningPaymentAttempts,
  operatorSupportReceipts,
  listingZapReceipts,
  nwcConnections,
  unlockedNwcConnectionIds,
  relays,
  syncSettings,
  communityLists,
  syncedCommunityLists,
  onBack,
  onCreateIdentity,
  onConnectSigner,
  onUseConnectedSignerAsIdentity,
  onListingSaved,
  onPublish,
  onSendNostrIntro,
  onCreateLightningPaymentAttempt,
  onCheckLightningPaymentReceipt,
  onCheckListingZapReceipts,
  onCreateOperatorSupportPaymentAttempt,
  onCheckOperatorSupportReceipt,
  onSaveNwcConnection,
  onUnlockNwcConnection,
  onPayLightningAttemptWithNwc,
  onReviewSeller,
  onStartTrade,
  onToggleHidden
}: {
  route?: { source: 'local' | 'synced'; id: string };
  listings: Listing[];
  syncedListings: SyncedPublicRecord<Listing>[];
  syncedProfiles: SyncedPublicRecord<PublicProfile>[];
  profile?: PublicProfile;
  attestations: ReputationAttestation[];
  syncedAttestations: SyncedPublicRecord<ReputationAttestation>[];
  allowlist: CommunityAllowlistEntry[];
  identity?: IdentityRecord;
  blossomServers: BlossomServerConfig[];
  privateKeyHex: string;
  nostrSigner: NostrSignerState;
  publishReceipts: PublishReceipt[];
  nostrContactReceipts: NostrContactReceipt[];
  lightningPaymentAttempts: LightningPaymentAttempt[];
  operatorSupportReceipts: OperatorSupportReceipt[];
  listingZapReceipts: ListingZapReceipt[];
  nwcConnections: NwcConnection[];
  unlockedNwcConnectionIds: string[];
  relays: RelayConfig[];
  syncSettings: SyncSettings;
  communityLists: CommunityCurationList[];
  syncedCommunityLists: SyncedPublicRecord<CommunityCurationList>[];
  onBack: () => void;
  onCreateIdentity: () => void;
  onConnectSigner: () => void;
  onUseConnectedSignerAsIdentity: () => void;
  onListingSaved: (listing: Listing) => void;
  onPublish: (listing: Listing) => void;
  onSendNostrIntro: (args: SendNostrContactIntroArgs) => Promise<NostrContactReceipt>;
  onCreateLightningPaymentAttempt: (request: LightningPaymentRequest) => Promise<LightningPaymentAttempt>;
  onCheckLightningPaymentReceipt: (attempt: LightningPaymentAttempt) => Promise<LightningPaymentAttempt>;
  onCheckListingZapReceipts: (listing: Listing, sellerProfile?: PublicProfile) => Promise<ListingZapReceipt[]>;
  onCreateOperatorSupportPaymentAttempt: (request: OperatorSupportPaymentRequest) => Promise<LightningPaymentAttempt>;
  onCheckOperatorSupportReceipt: (attempt?: LightningPaymentAttempt) => Promise<OperatorSupportReceipt | undefined>;
  onSaveNwcConnection: (request: SaveNwcConnectionRequest) => Promise<NwcConnection>;
  onUnlockNwcConnection: (connection: NwcConnection, passphrase: string) => Promise<void>;
  onPayLightningAttemptWithNwc: (attempt: LightningPaymentAttempt, connectionId: string) => Promise<LightningPaymentAttempt>;
  onReviewSeller: (request: ReputationDraftRequest) => void;
  onStartTrade: (listingRef: ListingSourceRef) => void;
  onToggleHidden: (record: SyncedPublicRecord<Listing>, hidden: boolean) => void;
}): ReactNode {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const conflictGroups = useMemo(() => findSyncedConflictGroups(syncedListings), [syncedListings]);
  const localListing = route?.source === 'local' ? listings.find((listing) => listing.id === route.id) : undefined;
  const syncedRecord = route?.source === 'synced' ? syncedListings.find((record) => record.id === route.id) : undefined;
  const listing = localListing ?? syncedRecord?.payload;
  if (!route || !listing) {
    return (
      <section className="page listing-page">
        <button className="subtle" onClick={onBack} type="button">
          {t('listing.backToMarketplace')}
        </button>
        <EmptyState title={t('empty.browseTitle')} body={t('listing.notFound')} />
      </section>
    );
  }

  const source = localListing ? 'local' : 'synced';
  const listingRef: ListingSourceRef =
    source === 'local'
      ? { source: 'local', id: listing.id, listing }
      : { source: 'synced', id: listing.id, recordId: syncedRecord?.id, listing };
  const sellerSummary = sellerSummaryForListing(listing, profile ? [profile] : [], syncedProfiles, attestations, syncedAttestations, allowlist);
  const sellerSupportReceipt = supportReceiptForPublicKey(listing.authorPublicKey, operatorSupportReceipts);
  const sellerProfile =
    profile?.publicKey.toLowerCase() === listing.authorPublicKey.toLowerCase()
      ? profile
      : syncedProfiles.find((record) => record.payload.publicKey.toLowerCase() === listing.authorPublicKey.toLowerCase())?.payload;
  const listingZaps = listingZapReceiptsForListing(listing, listingZapReceipts);
  const receiptSummary = summarizeListingReceipts(listing, publishReceipts);
  const nostrContact = nostrContactForMethod(listing.contactMethod, listing.authorPublicKey);
  const canPublish = relays.some((relay) => relay.enabled);
  const canEdit =
    Boolean(localListing) &&
    (publicKeysMatch(identity?.publicKey, listing.authorPublicKey) || publicKeysMatch(nostrSigner.publicKey, listing.authorPublicKey));
  const canReviewSeller = Boolean(identity && !publicKeysMatch(identity.publicKey, listing.authorPublicKey));
  const curatedBy = [...communityLists, ...syncedCommunityLists.map((record) => record.payload)]
    .filter((list) => list.referencedCoordinates.includes(nostrCoordinate(AGORAMESH_EVENT_KINDS.listing, listing.authorPublicKey, listing.id)))
    .map((list) => list.title);

  return (
    <section className="page listing-page">
      <button className="subtle" onClick={onBack} type="button">
        {t('listing.backToMarketplace')}
      </button>
      {editing && localListing ? (
        <ListingCreatePanel
          identity={identity}
          profile={profile}
          blossomServers={blossomServers}
          privateKeyHex={privateKeyHex}
          nostrSigner={nostrSigner}
          initialListing={localListing}
          onCreateIdentity={onCreateIdentity}
          onConnectSigner={onConnectSigner}
          onUseConnectedSignerAsIdentity={onUseConnectedSignerAsIdentity}
          onSaved={(updated) => {
            setEditing(false);
            onListingSaved(updated);
          }}
        />
      ) : (
      <div className="listing-page-layout">
        <ListingImageGallery images={listing.images} title={listing.title} />
        <article className="panel listing-main">
          <section className="listing-section">
            <div className="row between">
              <span className="pill">{listing.type === 'offer' ? t('listing.offer') : t('listing.request')}</span>
              <span className="muted">
                {syncSettings.showDataSource
                  ? source === 'synced'
                    ? `${t('sync.syncedData')} · ${syncedRecord?.trusted ? t('sync.trusted') : t('sync.untrusted')}`
                    : t('sync.localData')
                  : listing.visibility}
              </span>
            </div>
            <h1>{listing.title}</h1>
            <div className="listing-price-hero">
              <strong>{formatListingPrice(listing)}</strong>
              <span>{listing.region || t('listing.location')}</span>
            </div>
            <div className="badge-row">
              <span className="pill subtle-pill">{t(`listing.status.${listing.status}`)}</span>
              <span className="pill subtle-pill">{categoryLabel(listing.category, t)}</span>
              <span className="pill subtle-pill">{fulfillmentBadgeForListing(listing, t)}</span>
              {listing.paymentPreferences.map((entry) => (
                <span className="pill subtle-pill" key={entry}>
                  {paymentBadgeLabel(entry, t)}
                </span>
              ))}
            </div>
          </section>
          <section className="listing-section">
            <h2>{t('listing.sectionSeller')}</h2>
            <SellerSummaryCard
              summary={sellerSummary}
              supportReceipt={sellerSupportReceipt}
              onReview={
                canReviewSeller
                  ? () =>
                      onReviewSeller({
                        subjectPublicKey: listing.authorPublicKey,
                        role: 'seller',
                        listingId: listing.id,
                        listingTitle: listing.title,
                        listingCoordinate: nostrCoordinate(AGORAMESH_EVENT_KINDS.listing, listing.authorPublicKey, listing.id)
                      })
                  : undefined
              }
            />
          </section>
          <section className="listing-section">
            <h2>{t('listing.sectionDetails')}</h2>
            <ListingDetails listing={listing} sellerSummary={sellerSummary} hideSeller />
            {listing.tags.length > 0 ? <div className="tags">{listing.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
          </section>
          <section className="listing-section">
            <h2>{t('listing.sectionTrustSource')}</h2>
            {curatedBy.length > 0 ? (
              <p className="muted">
                {t('curation.curatedBy')}: {curatedBy.join(', ')}
              </p>
            ) : null}
            {syncedRecord ? (
              <SyncedQualityBadges
                conflict={isRecordConflicted(syncedRecord, conflictGroups)}
                hidden={syncedRecord.hidden}
                preferred={isPreferredConflictRecord(syncedRecord, conflictGroups)}
              />
            ) : (
              <p className="muted">{t('sync.localData')}</p>
            )}
          </section>
        </article>
        <aside className="panel listing-actions">
          <LightningPaymentPanel
            listing={listing}
            sellerProfile={sellerProfile}
            identity={identity}
            privateKeyHex={privateKeyHex}
            nostrSigner={nostrSigner}
            relays={relays}
            attempts={lightningPaymentAttempts}
            nwcConnections={nwcConnections}
            unlockedNwcConnectionIds={unlockedNwcConnectionIds}
            onConnectSigner={onConnectSigner}
            onCreatePaymentAttempt={onCreateLightningPaymentAttempt}
            onCheckReceipt={onCheckLightningPaymentReceipt}
            onSaveNwcConnection={onSaveNwcConnection}
            onUnlockNwcConnection={onUnlockNwcConnection}
            onPayWithNwc={onPayLightningAttemptWithNwc}
          />
          {publicKeysMatch(identity?.publicKey, listing.authorPublicKey) ? (
            <ListingZapReceiptsPanel
              receipts={listingZaps}
              onCheck={() => onCheckListingZapReceipts(listing, sellerProfile)}
            />
          ) : null}
          {publicKeysMatch(identity?.publicKey, listing.authorPublicKey) ? (
            <OperatorSupportPanel
              config={operatorSupport}
              identity={identity}
              privateKeyHex={privateKeyHex}
              nostrSigner={nostrSigner}
              relays={relays}
              attempts={lightningPaymentAttempts}
              receipts={operatorSupportReceipts}
              nwcConnections={nwcConnections}
              unlockedNwcConnectionIds={unlockedNwcConnectionIds}
              onConnectSigner={onConnectSigner}
              onCreatePaymentAttempt={onCreateOperatorSupportPaymentAttempt}
              onCheckReceipt={onCheckOperatorSupportReceipt}
              onSaveNwcConnection={onSaveNwcConnection}
              onUnlockNwcConnection={onUnlockNwcConnection}
              onPayWithNwc={onPayLightningAttemptWithNwc}
            />
          ) : null}
          {nostrContact ? (
            <NostrContactPanel
              target={{
                recipientPublicKey: nostrContact.publicKey,
                label: sellerSummary.displayName,
                contextType: 'listing',
                contextId: listing.id,
                contextTitle: listing.title
              }}
              identity={identity}
              relays={relays}
              nostrSigner={nostrSigner}
              privateKeyHex={privateKeyHex}
              receipts={nostrContactReceipts}
              onConnectSigner={onConnectSigner}
              onSend={onSendNostrIntro}
            />
          ) : null}
          <button onClick={() => onStartTrade(listingRef)} type="button">
            <Handshake size={16} /> {t('marketplace.startTrade')}
          </button>
          {canReviewSeller ? (
            <button
              className="subtle"
              onClick={() =>
                onReviewSeller({
                  subjectPublicKey: listing.authorPublicKey,
                  role: 'seller',
                  listingId: listing.id,
                  listingTitle: listing.title,
                  listingCoordinate: nostrCoordinate(AGORAMESH_EVENT_KINDS.listing, listing.authorPublicKey, listing.id)
                })
              }
              type="button"
            >
              <BadgeCheck size={16} /> {t('reputation.reviewSeller')}
            </button>
          ) : null}
          {canEdit ? (
            <button className="subtle" onClick={() => setEditing(true)} type="button">
              <Pencil size={16} /> {t('listing.edit')}
            </button>
          ) : null}
          {localListing && listing.visibility === 'public' ? (
            <DisclosurePanel title={t('listing.publishOptions')}>
              <PublishReceiptSummaryView summary={receiptSummary} />
              {!canPublish ? <ActionHint>{t('marketplace.noEnabledRelays')}</ActionHint> : null}
              <DisclosurePanel title={t('ui.whyMatters')}>
                <SafetyNotice>{t('safety.publicPublish')}</SafetyNotice>
                <InlineHelp>{t('safety.nip99Publish')}</InlineHelp>
              </DisclosurePanel>
              <button disabled={!canPublish} onClick={() => onPublish(listing)} title={!canPublish ? t('marketplace.noEnabledRelays') : undefined} type="button">
                <Radio size={16} /> {t('listing.publishNip99')}
              </button>
            </DisclosurePanel>
          ) : null}
          {syncedRecord ? (
            <SyncedRecordActions
              conflict={isRecordConflicted(syncedRecord, conflictGroups)}
              preferred={isPreferredConflictRecord(syncedRecord, conflictGroups)}
              record={syncedRecord}
              onToggleHidden={onToggleHidden}
            />
          ) : null}
        </aside>
      </div>
      )}
    </section>
  );
}

function BrowsePage({
  identity,
  profile,
  listings,
  syncedListings,
  syncedProfiles,
  operatorSupportReceipts,
  communityLists,
  syncedCommunityLists,
  blossomServers,
  relays,
  syncSettings,
  privateKeyHex,
  nostrSigner,
  go,
  onConnectSigner,
  onUseConnectedSignerAsIdentity,
  onToggleHidden,
  onFetchMarketplace,
  onListingDiscoveryScopeChange,
  onListingSaved,
  onPublishCommunityList,
  onCommunityListSaved,
  onNavigateListing
}: {
  identity?: IdentityRecord;
  profile?: PublicProfile;
  listings: Listing[];
  syncedListings: SyncedPublicRecord<Listing>[];
  syncedProfiles: SyncedPublicRecord<PublicProfile>[];
  operatorSupportReceipts: OperatorSupportReceipt[];
  communityLists: CommunityCurationList[];
  syncedCommunityLists: SyncedPublicRecord<CommunityCurationList>[];
  blossomServers: BlossomServerConfig[];
  relays: RelayConfig[];
  syncSettings: SyncSettings;
  privateKeyHex: string;
  nostrSigner: NostrSignerState;
  go: (page: RouteTarget) => void;
  onConnectSigner: () => void;
  onUseConnectedSignerAsIdentity: () => void;
  onToggleHidden: (record: SyncedPublicRecord<Listing>, hidden: boolean) => void;
  onFetchMarketplace: (scope: ListingDiscoveryScope) => Promise<MarketplaceFetchSummary>;
  onListingDiscoveryScopeChange: (scope: ListingDiscoveryScope) => void;
  onListingSaved: (listing: Listing) => void;
  onPublishCommunityList: (list: CommunityCurationList) => void;
  onCommunityListSaved: () => void;
  onNavigateListing: (listingRef: ListingSourceRef) => void;
}): ReactNode {
  const { t } = useI18n();
  const [activeBrowseTab, setActiveBrowseTab] = useState<BrowseTab>(browseTabFromHash);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [type, setType] = useState('all');
  const [payment, setPayment] = useState('all');
  const [fulfillment, setFulfillment] = useState('all');
  const [region, setRegion] = useState('');
  const [sort, setSort] = useState<'newest' | 'expiring'>('newest');
  const [source, setSource] = useState<DataSourceFilter>(syncSettings.defaultBrowseSource);
  const [trust, setTrust] = useState<TrustFilter>('all');
  const [support, setSupport] = useState<SupportFilter>('all');
  const [hidden, setHidden] = useState<HiddenFilter>('visible');
  const [curationFilter, setCurationFilter] = useState('all');
  const [showExpired, setShowExpired] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(marketplacePageSize);
  const [curationForm, setCurationForm] = useState({ title: '', description: '', selectedCoordinates: [] as string[] });
  const [failedListingImages, setFailedListingImages] = useState<string[]>([]);
  const [fetchingMarketplace, setFetchingMarketplace] = useState(false);
  const [marketplaceFetchSummary, setMarketplaceFetchSummary] = useState<MarketplaceFetchSummary | undefined>();
  const [marketplaceFetchError, setMarketplaceFetchError] = useState('');
  const enabledRelays = relays.filter((relay) => relay.enabled);
  const scopedSyncedListings = useMemo(
    () => syncedListings.filter((record) => syncedListingInDisplayScope(record, syncSettings.listingDiscoveryScope)),
    [syncedListings, syncSettings.listingDiscoveryScope]
  );
  const syncedVisibleListings = scopedSyncedListings.filter((record) => !record.hidden);
  const visibleCommunityLists = syncedCommunityLists.filter((record) => !record.hidden);
  const curationCoordinateMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const record of visibleCommunityLists) {
      for (const coordinate of record.payload.referencedCoordinates) {
        const [, pubkey, id] = coordinate.split(':');
        const key = `${pubkey}:${id}`;
        map.set(key, [...(map.get(key) ?? []), record.payload.title]);
      }
    }
    return map;
  }, [visibleCommunityLists]);
  const selectedCurationCoordinates = useMemo(() => {
    if (curationFilter === 'all') return undefined;
    return visibleCommunityLists.find((record) => record.id === curationFilter)?.payload.referencedCoordinates;
  }, [curationFilter, visibleCommunityLists]);

  useEffect(() => {
    const onHash = (): void => {
      if (navFromHash() === 'browse') setActiveBrowseTab(browseTabFromHash());
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    setVisibleLimit(marketplacePageSize);
  }, [category, curationFilter, fulfillment, hidden, payment, query, region, showExpired, sort, source, support, syncSettings.listingDiscoveryScope, trust, type]);

  const filtered = useMemo(() => {
    const normalized = query.toLowerCase();
    const localRows: MarketplaceListingRow[] =
      source === 'synced' || hidden === 'hidden'
        ? []
        : listings.map((listing) => ({ listing, source: 'local' as const, trusted: true, record: undefined }));
    const syncedRows: MarketplaceListingRow[] =
      source === 'local'
        ? []
        : applyHiddenFilter(scopedSyncedListings, hidden)
            .filter((record) => (trust === 'all' ? true : trust === 'trusted' ? record.trusted : !record.trusted))
            .map((record) => ({ listing: record.payload, source: 'synced' as const, trusted: record.trusted, record }));

    const curated = selectedCurationCoordinates ? new Set(selectedCurationCoordinates.map((coordinate) => coordinate.split(':').slice(1).join(':'))) : undefined;
    const filteredRows = [...localRows, ...syncedRows]
      .filter(({ listing }) => (category === 'all' ? true : listing.category === category))
      .filter(({ listing }) => (type === 'all' ? true : listing.type === type))
      .filter(({ listing }) => paymentMatchesListing(listing, payment))
      .filter(({ listing }) => fulfillmentMatchesListing(listing, fulfillment))
      .filter(({ listing }) => (region ? listing.region.toLowerCase().includes(region.toLowerCase()) : true))
      .filter(({ listing }) => (showExpired ? true : !isListingExpired(listing)))
      .filter(({ listing }) => listing.status !== 'deleted')
      .filter(({ listing }) => supportFilterMatches(listing.authorPublicKey, operatorSupportReceipts, support))
      .filter(({ listing }) => `${listing.title} ${listing.description} ${listing.tags.join(' ')}`.toLowerCase().includes(normalized))
      .filter(({ listing }) => (curated ? curated.has(`${listing.authorPublicKey}:${listing.id}`) : true));
    const { visible } = dedupeMarketplaceListings(filteredRows);
    const ranked = rankMarketplaceListings(visible, { query, category, type }, curationCoordinateMap);
    return sort === 'expiring' ? ranked.sort((left, right) => left.listing.expiresAt.localeCompare(right.listing.expiresAt)) : ranked;
  }, [category, curationCoordinateMap, fulfillment, hidden, listings, operatorSupportReceipts, payment, query, region, scopedSyncedListings, selectedCurationCoordinates, showExpired, sort, source, support, trust, type]);
  const duplicateHiddenCount = useMemo(() => {
    const normalized = query.toLowerCase();
    const localRows: MarketplaceListingRow[] =
      source === 'synced' || hidden === 'hidden'
        ? []
        : listings.map((listing) => ({ listing, source: 'local' as const, trusted: true, record: undefined }));
    const syncedRows: MarketplaceListingRow[] =
      source === 'local'
        ? []
        : applyHiddenFilter(scopedSyncedListings, hidden)
            .filter((record) => (trust === 'all' ? true : trust === 'trusted' ? record.trusted : !record.trusted))
            .map((record) => ({ listing: record.payload, source: 'synced' as const, trusted: record.trusted, record }));
    const curated = selectedCurationCoordinates ? new Set(selectedCurationCoordinates.map((coordinate) => coordinate.split(':').slice(1).join(':'))) : undefined;
    const filteredRows = [...localRows, ...syncedRows]
      .filter(({ listing }) => (category === 'all' ? true : listing.category === category))
      .filter(({ listing }) => (type === 'all' ? true : listing.type === type))
      .filter(({ listing }) => paymentMatchesListing(listing, payment))
      .filter(({ listing }) => fulfillmentMatchesListing(listing, fulfillment))
      .filter(({ listing }) => (region ? listing.region.toLowerCase().includes(region.toLowerCase()) : true))
      .filter(({ listing }) => (showExpired ? true : !isListingExpired(listing)))
      .filter(({ listing }) => listing.status !== 'deleted')
      .filter(({ listing }) => supportFilterMatches(listing.authorPublicKey, operatorSupportReceipts, support))
      .filter(({ listing }) => `${listing.title} ${listing.description} ${listing.tags.join(' ')}`.toLowerCase().includes(normalized))
      .filter(({ listing }) => (curated ? curated.has(`${listing.authorPublicKey}:${listing.id}`) : true));
    return dedupeMarketplaceListings(filteredRows).duplicates.length;
  }, [category, fulfillment, hidden, listings, operatorSupportReceipts, payment, query, region, scopedSyncedListings, selectedCurationCoordinates, showExpired, source, support, trust, type]);
  const visibleFiltered = filtered.slice(0, visibleLimit);
  const curationCandidates = visibleFiltered.slice(0, 12).map(({ listing, source: rowSource }) => ({
    label: `${listing.title} · ${categoryLabel(listing.category, t)} · ${rowSource === 'synced' ? t('marketplace.sourceSynced') : t('marketplace.sourceLocal')}${
      supportReceiptForPublicKey(listing.authorPublicKey, operatorSupportReceipts) ? ` · ${t('support.badge')}` : ''
    }`,
    coordinate: nostrCoordinate(AGORAMESH_EVENT_KINDS.listing, listing.authorPublicKey, listing.id)
  }));
  const advancedFilterLabels = [
    category !== 'all' ? `${t('common.category')}: ${categoryLabel(category, t)}` : undefined,
    region ? `${t('common.region')}: ${region}` : undefined,
    fulfillment !== 'all' ? `${t('listing.fulfillment')}: ${t(`fulfillment.${fulfillment}`)}` : undefined,
    payment !== 'all' ? `${t('listing.paymentIntentMethod')}: ${paymentBadgeLabel(payment as PaymentPreference, t)}` : undefined,
    sort !== 'newest' ? `${t('common.sort')}: ${t('common.expiring')}` : undefined,
    source !== syncSettings.defaultBrowseSource ? `${t('sync.source')}: ${source}` : undefined,
    trust !== 'all' ? `${t('sync.trust')}: ${trust}` : undefined,
    support !== 'all' ? `${t('support.filter')}: ${supportFilterLabel(support, t)}` : undefined,
    hidden !== 'visible' ? `${t('sync.hiddenFilter')}: ${hidden}` : undefined,
    curationFilter !== 'all' ? `${t('curation.filter')}: ${visibleCommunityLists.find((record) => record.id === curationFilter)?.payload.title ?? curationFilter}` : undefined,
    showExpired ? t('marketplace.showExpired') : undefined
  ].filter((label): label is string => Boolean(label));
  const resetAdvancedFilters = (): void => {
    setCategory('all');
    setPayment('all');
    setFulfillment('all');
    setRegion('');
    setSort('newest');
    setSource(syncSettings.defaultBrowseSource);
    setTrust('all');
    setSupport('all');
    setHidden('visible');
    setCurationFilter('all');
    setShowExpired(false);
  };
  const applyMarketplacePreset = (preset: MarketplaceFilterPreset): void => {
    resetAdvancedFilters();
    if (preset === 'trusted-synced') {
      setSource('synced');
      setTrust('trusted');
    }
    if (preset === 'local-only') {
      setSource('local');
    }
    if (preset === 'moderation') {
      setSource('synced');
      setHidden('all');
      setShowExpired(true);
    }
  };
  const resetFilters = (): void => {
    setQuery('');
    setType('all');
    resetAdvancedFilters();
  };

  const saveCommunityList = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!identity || curationForm.selectedCoordinates.length === 0) return;
    const at = nowIso();
    const list = communityCurationListSchema.parse({
      id: newId('curation'),
      title: sanitizePlainText(curationForm.title),
      description: sanitizePlainText(curationForm.description),
      authorPublicKey: identity.publicKey,
      referencedCoordinates: curationForm.selectedCoordinates,
      createdAt: at,
      updatedAt: at
    });
    await db.communityLists.put(list);
    setCurationForm({ title: '', description: '', selectedCoordinates: [] });
    onCommunityListSaved();
  };

  const setVisibleSyncedListingsHidden = async (nextHidden: boolean): Promise<void> => {
    const records = filtered.map((row) => row.record).filter((record): record is SyncedPublicRecord<Listing> => Boolean(record));
    await Promise.all(records.map((record) => onToggleHidden(record, nextHidden)));
  };

  const fetchMarketplace = async (): Promise<void> => {
    setFetchingMarketplace(true);
    setMarketplaceFetchError('');
    try {
      const summary = await onFetchMarketplace(syncSettings.listingDiscoveryScope);
      setMarketplaceFetchSummary(summary);
      if (source === 'local') setSource('combined');
    } catch {
      setMarketplaceFetchError(t('marketplace.fetchFailed'));
    } finally {
      setFetchingMarketplace(false);
    }
  };

  const toggleCurationCoordinate = (coordinate: string, checked: boolean): void => {
    setCurationForm((current) => ({
      ...current,
      selectedCoordinates: checked
        ? [...new Set([...current.selectedCoordinates, coordinate])]
        : current.selectedCoordinates.filter((entry) => entry !== coordinate)
    }));
  };

  const localListingRows = useMemo(
    () =>
      listings
        .filter((listing) => listing.status !== 'deleted')
        .map((listing) => ({ listing, source: 'local' as const, trusted: true, record: undefined })),
    [listings]
  );
  const marketplaceStatusItems: [string, string][] = [
    [t('marketplace.status.local'), String(listings.length)],
    [t('marketplace.status.synced'), String(syncedVisibleListings.length)],
    [t('marketplace.status.relays'), String(enabledRelays.length)],
    [t('marketplace.status.scope'), syncSettings.listingDiscoveryScope === 'all-nip99' ? t('sync.scopeAllNip99') : t('sync.scopeAgoraMeshNative')]
  ];
  const marketplaceEmptyBody =
    enabledRelays.length === 0
      ? t('empty.browseNoRelays')
      : syncedVisibleListings.length === 0 && listings.length === 0
        ? t('empty.browseNoRecords')
        : t('empty.browseNoMatches');

  const renderListingThumb = (listing: Listing): ReactNode => {
    const firstImage = listing.images?.find((image) => !failedListingImages.includes(image.url));
    const visibleImageCount = listing.images?.filter((image) => !failedListingImages.includes(image.url)).length ?? 0;
    return (
      <div className={firstImage ? 'listing-card-thumb' : 'listing-card-thumb empty'} aria-hidden="true">
        {firstImage ? (
          <>
            <img
              src={firstImage.url}
              alt=""
              loading="lazy"
              onError={() => setFailedListingImages((current) => [...new Set([...current, firstImage.url])])}
            />
            {visibleImageCount > 1 ? <span className="listing-card-image-count">{visibleImageCount}</span> : null}
          </>
        ) : (
          <span>{categoryLabel(listing.category, t)}</span>
        )}
      </div>
    );
  };

  const renderListingCard = ({
    listing,
    source: rowSource,
    trusted,
    record
  }: {
    listing: Listing;
    source: 'local' | 'synced';
    trusted: boolean;
    record?: SyncedPublicRecord<Listing>;
  }): ReactNode => {
    const listingKey = record?.id ?? `${rowSource}-${listing.id}`;
    const listingRef: ListingSourceRef =
      rowSource === 'synced' && record
        ? { source: 'synced', id: listing.id, recordId: record.id, listing }
        : { source: 'local', id: listing.id, listing };
    const recordScope = record ? effectiveSyncedListingScope(record) : undefined;
    const sourceLabel = syncSettings.showDataSource
      ? `${rowSource === 'synced' ? t('sync.syncedData') : t('sync.localData')}${rowSource === 'synced' ? ` · ${trusted ? t('sync.trusted') : t('sync.untrusted')}` : ''}${
          recordScope ? ` · ${recordScope === 'all-nip99' ? t('sync.scopeAllNip99') : t('sync.scopeAgoraMeshNative')}` : ''
        }`
      : listing.visibility;
    const visibleTags = listing.tags.slice(0, 3);
    const seller = sellerSummaryForListing(listing, profile ? [profile] : [], syncedProfiles, [], [], []);
    const supportReceipt = supportReceiptForPublicKey(listing.authorPublicKey, operatorSupportReceipts);
    return (
      <article className="card listing-card" key={listingKey}>
        {renderListingThumb(listing)}
        <div className="listing-card-body">
          <div className="listing-card-meta">
            <span className="pill">{listing.type === 'offer' ? t('listing.offer') : t('listing.request')}</span>
            <span className="muted">{sourceLabel}</span>
          </div>
          <h2>{listing.title}</h2>
          <div className="listing-card-primary">
            <strong>{formatListingPrice(listing)}</strong>
            <span>{t(`listing.status.${listing.status}`)}</span>
          </div>
          <p className="muted listing-card-region">{listing.region || t('listing.location')}</p>
          <div className="badge-row listing-card-taxonomy">
            <span className="pill subtle-pill">{categoryLabel(listing.category, t)}</span>
            {visibleTags.map((tag) => (
              <span className="pill subtle-pill" key={tag}>
                {tag}
              </span>
            ))}
            {listing.tags.length > visibleTags.length ? <span className="pill subtle-pill">+{listing.tags.length - visibleTags.length}</span> : null}
          </div>
          <p className="muted listing-card-settlement">
            {fulfillmentBadgeForListing(listing, t)} · {listing.paymentPreferences.map((entry) => paymentBadgeLabel(entry, t)).join(', ')}
          </p>
          <div className="listing-card-seller">
            <AvatarCircle avatarUrl={seller.avatarUrl} label={seller.displayName} size="small" />
            <span className="muted">{seller.displayName}</span>
            <SupporterBadge receipt={supportReceipt} compact />
          </div>
          <button onClick={() => onNavigateListing(listingRef)} type="button">
            {t('listing.viewItem')}
          </button>
        </div>
      </article>
    );
  };

  return (
    <section className="page marketplace-page">
      <div className="marketplace-heading">
        <h1>{t('marketplace.title')}</h1>
      </div>
      <CompactTabs
        active={activeBrowseTab}
        label={t('marketplace.title')}
        onChange={(tab) => {
          setActiveBrowseTab(tab);
          window.location.hash = tab === 'create' ? 'browse:create' : tab === 'mine' ? 'browse:mine' : 'browse';
        }}
        tabs={[
          ['discover', t('marketplace.tab.discover')],
          ['create', t('marketplace.tab.create')],
          ['mine', t('marketplace.tab.mine')]
        ]}
      />
      {activeBrowseTab === 'discover' ? (
        <>
          <div className="marketplace-toolbar">
            <div className="marketplace-searchbar">
              <label className="sr-only" htmlFor="marketplace-search">
                {t('common.search')}
              </label>
              <input
                aria-label={t('common.search')}
                id="marketplace-search"
                placeholder={t('marketplace.searchPlaceholder')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="quick-filter-group" role="group" aria-label={t('common.type')}>
              {[
                ['all', t('common.all')],
                ['offer', t('listing.offer')],
                ['request', t('listing.request')]
              ].map(([value, label]) => (
                <button className={type === value ? 'filter-chip active' : 'filter-chip'} key={value} onClick={() => setType(value)} type="button">
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                setActiveBrowseTab('create');
                window.location.hash = 'browse:create';
              }}
              type="button"
            >
              {t('listing.create')}
            </button>
          </div>
          <div className="marketplace-discovery-panel" aria-live="polite">
            <div className="scope-switch-heading">
              <strong>{t('marketplace.discoveryTitle')}</strong>
              <span className="muted">
                {t('marketplace.fetchActiveScope').replace(
                  '{scope}',
                  syncSettings.listingDiscoveryScope === 'all-nip99' ? t('sync.scopeAllNip99') : t('marketplace.scopeAgoraMeshOnly')
                )}
              </span>
            </div>
            <div className="segmented-control" role="group" aria-label={t('marketplace.fetchScope')}>
              {[
                ['agoramesh-native', t('marketplace.scopeAgoraMeshOnly')],
                ['all-nip99', t('sync.scopeAllNip99')]
              ].map(([value, label]) => (
                <button
                  aria-pressed={syncSettings.listingDiscoveryScope === value}
                  className={syncSettings.listingDiscoveryScope === value ? 'filter-chip active' : 'filter-chip'}
                  key={value}
                  onClick={() => onListingDiscoveryScopeChange(value as ListingDiscoveryScope)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="muted discovery-relay-count">
              {t('marketplace.enabledRelays').replace('{count}', String(enabledRelays.length))}
            </span>
            <button disabled={fetchingMarketplace || enabledRelays.length === 0} onClick={() => void fetchMarketplace()} type="button">
              <Radio size={16} /> {fetchingMarketplace ? t('marketplace.fetching') : t('marketplace.fetch')}
            </button>
            {marketplaceFetchSummary ? (
              <p className="muted marketplace-fetch-summary">
                {t('marketplace.fetchSummary')
                  .replace('{imported}', String(marketplaceFetchSummary.imported))
                  .replace('{updated}', String(marketplaceFetchSummary.updated))
                  .replace('{unchanged}', String(marketplaceFetchSummary.unchanged))
                  .replace('{skipped}', String(marketplaceFetchSummary.skipped))
                  .replace('{invalid}', String(marketplaceFetchSummary.invalid))
                  .replace('{relays}', String(marketplaceFetchSummary.relaysQueried))}
              </p>
            ) : null}
            {marketplaceFetchError ? (
              <p className="warning marketplace-fetch-summary" role="alert">
                {marketplaceFetchError}
              </p>
            ) : null}
          </div>
          <DisclosurePanel title={t('marketplace.moreFilters')}>
            <div className="filter-drawer">
              <section className="filter-drawer-group filter-presets" aria-labelledby="marketplace-filter-presets">
                <h2 id="marketplace-filter-presets">{t('marketplace.filterPresets')}</h2>
                <div className="actions small">
                  {[
                    ['fresh', t('marketplace.presetFresh')],
                    ['trusted-synced', t('marketplace.presetTrustedSynced')],
                    ['local-only', t('marketplace.presetLocalOnly')],
                    ['moderation', t('marketplace.presetModeration')]
                  ].map(([preset, label]) => (
                    <button className="subtle" key={preset} onClick={() => applyMarketplacePreset(preset as MarketplaceFilterPreset)} type="button">
                      {label}
                    </button>
                  ))}
                </div>
              </section>
              <div className="filter-summary">
                <div>
                  <strong>
                    {advancedFilterLabels.length > 0
                      ? t('marketplace.activeFilters').replace('{count}', String(advancedFilterLabels.length))
                      : t('marketplace.activeFiltersNone')}
                  </strong>
                  {advancedFilterLabels.length > 0 ? <p className="muted">{advancedFilterLabels.join(' · ')}</p> : null}
                </div>
                {advancedFilterLabels.length > 0 ? (
                  <button className="subtle" onClick={resetAdvancedFilters} type="button">
                    {t('marketplace.resetAdvancedFilters')}
                  </button>
                ) : null}
              </div>
              <section className="filter-drawer-group" aria-labelledby="marketplace-listing-filters">
                <h2 id="marketplace-listing-filters">{t('marketplace.filtersListing')}</h2>
                <div className="filters compact-filters">
                  <select aria-label={t('common.category')} value={category} onChange={(event) => setCategory(event.target.value)}>
                    <option value="all">{t('common.all')}</option>
                    {categories.map((entry) => (
                      <option value={entry} key={entry}>
                        {categoryLabel(entry, t)}
                      </option>
                    ))}
                  </select>
                  <input aria-label={t('common.region')} placeholder={t('common.region')} value={region} onChange={(event) => setRegion(event.target.value)} />
                  <select aria-label={t('common.sort')} value={sort} onChange={(event) => setSort(event.target.value as 'newest' | 'expiring')}>
                    <option value="newest">{t('common.newest')}</option>
                    <option value="expiring">{t('common.expiring')}</option>
                  </select>
                </div>
              </section>
              <section className="filter-drawer-group" aria-labelledby="marketplace-source-filters">
                <h2 id="marketplace-source-filters">{t('marketplace.filtersSource')}</h2>
                <div className="filters compact-filters">
                  <select aria-label={t('sync.source')} value={source} onChange={(event) => setSource(event.target.value as DataSourceFilter)}>
                    <option value="combined">{t('sync.combined')}</option>
                    <option value="local">{t('sync.localOnly')}</option>
                    <option value="synced">{t('sync.syncedOnly')}</option>
                  </select>
                  <select aria-label={t('sync.trust')} value={trust} onChange={(event) => setTrust(event.target.value as TrustFilter)}>
                    <option value="all">{t('common.all')}</option>
                    <option value="trusted">{t('sync.trusted')}</option>
                    <option value="untrusted">{t('sync.untrusted')}</option>
                  </select>
                  <select aria-label={t('support.filter')} value={support} onChange={(event) => setSupport(event.target.value as SupportFilter)}>
                    <option value="all">{t('support.all')}</option>
                    <option value="supporters">{t('support.supporters')}</option>
                    <option value="non-supporters">{t('support.nonSupporters')}</option>
                  </select>
                  <select aria-label={t('sync.hiddenFilter')} value={hidden} onChange={(event) => setHidden(event.target.value as HiddenFilter)}>
                    <option value="visible">{t('sync.visibleOnly')}</option>
                    <option value="hidden">{t('sync.hiddenOnly')}</option>
                    <option value="all">{t('sync.visibleAndHidden')}</option>
                  </select>
                  <label className="checkbox">
                    <input type="checkbox" checked={showExpired} onChange={(event) => setShowExpired(event.target.checked)} />
                    {t('marketplace.showExpired')}
                  </label>
                </div>
              </section>
              <section className="filter-drawer-group" aria-labelledby="marketplace-curation-filters">
                <h2 id="marketplace-curation-filters">{t('marketplace.filtersCuration')}</h2>
                <div className="filters compact-filters">
                  <select aria-label={t('curation.filter')} value={curationFilter} onChange={(event) => setCurationFilter(event.target.value)}>
                    <option value="all">{t('curation.allLists')}</option>
                    {visibleCommunityLists.map((record) => (
                      <option value={record.id} key={record.id}>
                        {record.payload.title}
                      </option>
                    ))}
                  </select>
                </div>
                <DisclosurePanel title={t('curation.title')}>
                  <InlineHelp>{t('curation.body')}</InlineHelp>
                  <form className="stack-form" onSubmit={(event) => void saveCommunityList(event)}>
                    <label>
                      {t('curation.listTitle')}
                      <input
                        disabled={!identity}
                        required
                        value={curationForm.title}
                        onChange={(event) => setCurationForm({ ...curationForm, title: event.target.value })}
                        placeholder={t('placeholder.curationTitle')}
                      />
                    </label>
                    <label>
                      {t('curation.description')}
                      <textarea
                        disabled={!identity}
                        value={curationForm.description}
                        onChange={(event) => setCurationForm({ ...curationForm, description: event.target.value })}
                        placeholder={t('placeholder.curationDescription')}
                      />
                    </label>
                    <fieldset className="fieldset-list">
                      <legend>{t('curation.references')}</legend>
                      {curationCandidates.map((candidate) => (
                        <label className="checkbox" key={candidate.coordinate}>
                          <input
                            checked={curationForm.selectedCoordinates.includes(candidate.coordinate)}
                            disabled={!identity}
                            type="checkbox"
                            onChange={(event) => toggleCurationCoordinate(candidate.coordinate, event.target.checked)}
                          />
                          {candidate.label}
                        </label>
                      ))}
                      {curationCandidates.length === 0 ? <p className="muted">{t('curation.noCandidates')}</p> : null}
                    </fieldset>
                    <button
                      disabled={!identity || curationForm.selectedCoordinates.length === 0}
                      title={!identity ? t('a11y.identityRequired') : curationForm.selectedCoordinates.length === 0 ? t('curation.selectAtLeastOne') : undefined}
                      type="submit"
                    >
                      {t('curation.save')}
                    </button>
                  </form>
                  <div className="card-grid single">
                    {communityLists.map((list) => (
                      <article className="card compact" key={list.id}>
                        <div className="row between">
                          <h3>{list.title}</h3>
                          <span className="pill">{t('marketplace.sourceLocal')}</span>
                        </div>
                        <p>{list.description}</p>
                        <p className="muted">
                          {t('curation.references')}: {list.referencedCoordinates.length}
                        </p>
                        <button disabled={enabledRelays.length === 0} onClick={() => onPublishCommunityList(list)} type="button">
                          <Radio size={16} /> {t('curation.publish')}
                        </button>
                      </article>
                    ))}
                    {visibleCommunityLists.map((record) => (
                      <article className="card compact" key={record.id}>
                        <div className="row between">
                          <h3>{record.payload.title}</h3>
                          <span className="pill">{record.trusted ? t('sync.trusted') : t('sync.untrusted')}</span>
                        </div>
                        <p>{record.payload.description}</p>
                        <p className="muted">
                          {t('curation.references')}: {record.payload.referencedCoordinates.length}
                        </p>
                      </article>
                    ))}
                    {communityLists.length === 0 && visibleCommunityLists.length === 0 ? (
                      <EmptyState title={t('empty.curationTitle')} body={t('empty.curationBody')} />
                    ) : null}
                  </div>
                </DisclosurePanel>
              </section>
              <section className="filter-drawer-group" aria-labelledby="marketplace-maintenance-filters">
                <h2 id="marketplace-maintenance-filters">{t('marketplace.filtersMaintenance')}</h2>
                <StatusChipRow items={marketplaceStatusItems} />
                <InlineHelp>{t('help.browse')}</InlineHelp>
                <DisclosurePanel title={t('marketplace.whySorted')}>
                  <p className="muted">{t('marketplace.whySortedBody')}</p>
                </DisclosurePanel>
                <div className="actions small">
                  <button onClick={() => void setVisibleSyncedListingsHidden(true)} type="button">
                    {t('sync.hideVisibleSynced')}
                  </button>
                  <button onClick={() => void setVisibleSyncedListingsHidden(false)} type="button">
                    {t('sync.unhideVisibleSynced')}
                  </button>
                </div>
              </section>
            </div>
          </DisclosurePanel>
          <div className="card-grid">
            {visibleFiltered.map((row) => renderListingCard(row))}
            {filtered.length === 0 ? <EmptyState title={t('empty.browseTitle')} body={marketplaceEmptyBody} /> : null}
          </div>
          <div className="result-footer">
            <p className="muted">
              {t('marketplace.showing')} {Math.min(visibleFiltered.length, filtered.length)} {t('marketplace.of')} {filtered.length}
              {duplicateHiddenCount > 0 ? ` · ${t('marketplace.duplicatesHidden')}: ${duplicateHiddenCount}` : ''}
            </p>
            <div className="actions small">
              {visibleLimit < filtered.length ? (
                <button className="subtle" onClick={() => setVisibleLimit((current) => current + marketplacePageSize)} type="button">
                  {t('marketplace.showMore')}
                </button>
              ) : null}
              <button className="subtle" onClick={resetFilters} type="button">
                {t('marketplace.clearFilters')}
              </button>
            </div>
          </div>
        </>
      ) : null}
      {activeBrowseTab === 'create' ? (
        <ListingCreatePanel
          identity={identity}
          profile={profile}
          blossomServers={blossomServers}
          privateKeyHex={privateKeyHex}
          nostrSigner={nostrSigner}
          onCreateIdentity={() => go('profile')}
          onConnectSigner={onConnectSigner}
          onUseConnectedSignerAsIdentity={onUseConnectedSignerAsIdentity}
          onSaved={(listing) => {
            setActiveBrowseTab('mine');
            onListingSaved(listing);
            onNavigateListing({ source: 'local', id: listing.id, listing });
          }}
        />
      ) : null}
      {activeBrowseTab === 'mine' ? (
        <section className="panel">
          <SectionHeader icon={<Megaphone />} title={t('marketplace.myListings')} body={t('marketplace.myListingsBody')} />
          <div className="card-grid">
            {localListingRows.map((row) => renderListingCard(row))}
            {localListingRows.length === 0 ? <EmptyState title={t('empty.listingsTitle')} body={t('empty.listingsBody')} /> : null}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function ListingCreatePanel({
  identity,
  profile,
  blossomServers,
  privateKeyHex,
  nostrSigner,
  initialListing,
  onCreateIdentity,
  onConnectSigner,
  onUseConnectedSignerAsIdentity,
  onSaved
}: {
  identity?: IdentityRecord;
  profile?: PublicProfile;
  blossomServers: BlossomServerConfig[];
  privateKeyHex: string;
  nostrSigner: NostrSignerState;
  initialListing?: Listing;
  onCreateIdentity: () => void;
  onConnectSigner: () => void;
  onUseConnectedSignerAsIdentity: () => void;
  onSaved: (listing: Listing) => void;
}): ReactNode {
  const { t } = useI18n();
  const [form, setForm] = useState(() => ({
    title: initialListing?.title ?? '',
    type: initialListing?.type ?? ('offer' as ListingType),
    category: initialListing?.category ?? String(categories[0]),
    description: initialListing?.description ?? '',
    region: initialListing?.region ?? profile?.region ?? '',
    status: initialListing?.status ?? ('active' as ListingStatus),
    priceAmount: initialListing?.price.amount ?? '0',
    priceCurrency: initialListing?.price.currency ?? 'FREE',
    priceFrequency: initialListing?.price.frequency ?? '',
    priceNote: initialListing?.price.note ?? '',
    paymentPreferences: initialListing?.paymentPreferences ?? (['other'] as PaymentPreference[]),
    lightningPayment: initialListing?.paymentIntents?.find((intent) => intent.method === 'lightning')?.value ?? '',
    lightningPaymentNote: initialListing?.paymentIntents?.find((intent) => intent.method === 'lightning')?.note ?? '',
    barterAccepted: initialListing?.barterAccepted ?? false,
    tags: initialListing?.tags.join(', ') ?? '',
    contactKind: (initialListing?.contactMethod.kind ?? profile?.contactMethods?.[0]?.kind ?? 'matrix') as ContactKind,
    expiresAt: initialListing?.expiresAt ?? defaultListingExpirationDate(),
    contactValue: initialListing?.contactMethod.value ?? profile?.contactMethods?.[0]?.value ?? '',
    visibility: initialListing?.visibility ?? ('public' as ListingVisibility),
    mediatorPreference: initialListing?.mediatorPreference ?? ''
  }));
  const [imageDrafts, setImageDrafts] = useState<ListingImageDraft[]>(() =>
    (initialListing?.images ?? []).map((image, index) => ({
      id: `existing-${image.id}-${index}`,
      kind: 'existing' as const,
      image,
      previewUrl: image.url,
      name: image.altText || image.url,
      altText: image.altText ?? ''
    }))
  );
  const [imageNotice, setImageNotice] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const imageDraftsRef = useRef(imageDrafts);
  const enabledBlossomServer = blossomServers.find((server) => server.enabled);
  const mode = initialListing ? 'edit' : 'create';
  const authorPublicKey = initialListing?.authorPublicKey ?? identity?.publicKey;
  const authorCanSave = Boolean(
    authorPublicKey &&
      (mode === 'create' || publicKeysMatch(identity?.publicKey, authorPublicKey) || publicKeysMatch(nostrSigner.publicKey, authorPublicKey))
  );
  const connectedSignerMatchesIdentity = Boolean(
    authorPublicKey && nostrSigner.connected && nostrSigner.publicKey?.toLowerCase() === authorPublicKey.toLowerCase()
  );
  const connectedSignerCanBecomeIdentity = Boolean(
    nostrSigner.connected && nostrSigner.publicKey && (!identity || nostrSigner.publicKey.toLowerCase() !== identity.publicKey.toLowerCase())
  );
  const hasImageSigner =
    Boolean(authorPublicKey) &&
    (connectedSignerMatchesIdentity || (identityCanUseLocalUnlock(identity) && Boolean(privateKeyHex) && publicKeysMatch(identity?.publicKey, authorPublicKey)));
  const newImageDrafts = imageDrafts.filter((draft): draft is Extract<ListingImageDraft, { kind: 'new' }> => draft.kind === 'new');
  const needsImageSignerAction = newImageDrafts.length > 0 && Boolean(enabledBlossomServer) && !hasImageSigner;
  const essentialsReady = Boolean(form.title.trim() && form.description.trim() && form.region.trim() && form.contactValue.trim());
  const mediaStatus =
    newImageDrafts.length === 0
      ? t('listing.readiness.mediaOptional')
      : !enabledBlossomServer
        ? t('listing.readiness.mediaNoServer')
        : hasImageSigner
          ? t('listing.readiness.mediaReady')
          : t('listing.readiness.mediaSigner');
  const visibilityStatus =
    form.visibility === 'public' ? t('listing.readiness.visibilityPublic') : t('listing.readiness.visibilityLocal');

  useEffect(() => {
    imageDraftsRef.current = imageDrafts;
  }, [imageDrafts]);

  useEffect(
    () => () => {
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        imageDraftsRef.current.forEach((draft) => {
          if (draft.kind === 'new' && draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
        });
      }
    },
    []
  );

  const selectImages = (event: ChangeEvent<HTMLInputElement>): void => {
    const selected = Array.from(event.target.files ?? []);
    const remainingSlots = Math.max(0, maxListingImages - imageDrafts.length);
    const files = selected.slice(0, remainingSlots);
    const newDrafts: ListingImageDraft[] = files.map((file, index) => ({
      id: newId(`image_draft_${index}`),
      kind: 'new',
      file,
      previewUrl: typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '',
      name: file.name,
      altText: ''
    }));
    setImageDrafts((current) => [...current, ...newDrafts]);
    setImageNotice(selected.length > remainingSlots ? t('listing.imageLimit') : '');
    event.target.value = '';
  };

  const removeImageDraft = (id: string): void => {
    setImageDrafts((current) => {
      const draft = current.find((entry) => entry.id === id);
      if (draft?.kind === 'new' && draft.previewUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(draft.previewUrl);
      }
      return current.filter((entry) => entry.id !== id);
    });
  };

  const moveImageDraft = (id: string, direction: -1 | 1): void => {
    setImageDrafts((current) => {
      const index = current.findIndex((entry) => entry.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const updateImageDraftAltText = (id: string, altText: string): void => {
    setImageDrafts((current) => current.map((draft) => (draft.id === id ? { ...draft, altText } : draft)));
  };

  const togglePaymentPreference = (preference: PaymentPreference, checked: boolean): void => {
    const next = checked
      ? Array.from(new Set([...form.paymentPreferences, preference]))
      : form.paymentPreferences.filter((entry) => entry !== preference);
    setForm({ ...form, paymentPreferences: next.length > 0 ? next : ['other'] });
  };

  const uploadListingImages = async (): Promise<Map<string, ListingImage>> => {
    if (!authorPublicKey || newImageDrafts.length === 0) return new Map();
    if (!enabledBlossomServer) {
      setImageNotice(t('listing.noBlossomServer'));
      return new Map();
    }
    const uploaded = new Map<string, ListingImage>();
    for (const draft of newImageDrafts.slice(0, maxListingImages)) {
      try {
        const file = draft.file;
        validateListingImageFile(file);
        const hash = await sha256File(file);
        const signedAuth =
          nostrSigner.connected && nostrSigner.publicKey?.toLowerCase() === authorPublicKey.toLowerCase()
            ? await signBlossomUploadAuthWithExtension(hash, file.type, file.size, authorPublicKey)
            : identityCanUseLocalUnlock(identity) && privateKeyHex && publicKeysMatch(identity?.publicKey, authorPublicKey)
              ? await signBlossomUploadAuthLocally(hash, file.type, file.size, privateKeyHex, authorPublicKey)
              : undefined;
        if (!signedAuth) {
          throw new Error(t('listing.imageSignerRequired'));
        }
        const response = await uploadToBlossom(enabledBlossomServer.url, file, signedAuth);
        uploaded.set(draft.id, listingImageFromBlossomResponse(response, file, hash, enabledBlossomServer.url, draft.altText));
        await db.blossomServers.put({ ...enabledBlossomServer, lastUploadAt: nowIso(), lastError: undefined });
      } catch (error) {
        const message = error instanceof Error ? error.message : t('listing.imageUploadFailed');
        setImageNotice(message);
        await db.blossomServers.put({ ...enabledBlossomServer, lastError: message });
        throw new Error(message);
      }
    }
    return uploaded;
  };

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!authorPublicKey || !authorCanSave) return;
    setFormError('');
    setSaving(true);
    try {
      assertPeacefulListingText(form.title, form.description);
      if (form.contactKind === 'nostr' && !normalizeNostrContact(form.contactValue)) {
        throw new Error(t('nostrContact.invalidRecipient'));
      }
      const at = nowIso();
      const uploadedImages = await uploadListingImages();
      const existingNonLightningPaymentIntents = initialListing?.paymentIntents?.filter((intent) => intent.method !== 'lightning') ?? [];
      const lightningPaymentValue = sanitizePlainText(form.lightningPayment);
      const lightningPaymentNote = sanitizePlainText(form.lightningPaymentNote);
      const paymentPreferences = Array.from(
        new Set<PaymentPreference>([
          ...form.paymentPreferences,
          ...(lightningPaymentValue ? (['lightning'] as PaymentPreference[]) : []),
          ...(form.barterAccepted ? (['barter'] as PaymentPreference[]) : [])
        ])
      );
      const paymentIntents = lightningPaymentValue
        ? [
            ...existingNonLightningPaymentIntents,
            {
              id: initialListing?.paymentIntents?.find((intent) => intent.method === 'lightning')?.id ?? newId('payment'),
              method: 'lightning' as const,
              value: lightningPaymentValue,
              note: lightningPaymentNote
            }
          ]
        : existingNonLightningPaymentIntents;
      const images = imageDrafts
        .map((draft): ListingImage | undefined => {
          if (draft.kind === 'existing') {
            return { ...draft.image, altText: sanitizePlainText(draft.altText) || undefined };
          }
          return uploadedImages.get(draft.id);
        })
        .filter((image): image is ListingImage => Boolean(image));
      const listing: Listing = listingSchema.parse({
        id: initialListing?.id ?? newId('listing'),
        authorPublicKey,
        title: sanitizePlainText(form.title),
        type: form.type,
        category: form.category,
        description: sanitizePlainText(form.description),
        region: sanitizePlainText(form.region),
        status: form.status,
        price: {
          amount: sanitizePlainText(form.priceAmount),
          currency: sanitizePlainText(form.priceCurrency).toUpperCase(),
          frequency: sanitizePlainText(form.priceFrequency) || undefined,
          note: sanitizePlainText(form.priceNote) || undefined
        },
        paymentPreferences: paymentPreferences.length > 0 ? paymentPreferences : (['other'] as PaymentPreference[]),
        paymentIntents,
        images,
        ...(initialListing?.fulfillmentType !== undefined ? { fulfillmentType: initialListing.fulfillmentType } : {}),
        ...(initialListing?.fulfillmentNotes !== undefined ? { fulfillmentNotes: initialListing.fulfillmentNotes } : {}),
        barterAccepted: form.barterAccepted,
        tags: sanitizeTags(form.tags),
        expiresAt: form.expiresAt || defaultListingExpirationDate(),
        contactMethod: { id: initialListing?.contactMethod.id ?? newId('contact'), kind: form.contactKind, value: sanitizePlainText(form.contactValue) },
        mediatorPreference: sanitizePlainText(form.mediatorPreference),
        visibility: form.visibility,
        publishedAt: initialListing?.publishedAt,
        createdAt: initialListing?.createdAt ?? at,
        updatedAt: at
      });
      await db.listings.put(listing);
      setSaving(false);
      onSaved(listing);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t('listing.saveError'));
      setSaving(false);
    }
  };

  return (
    <section className="create-listing-page">
      <form className="panel" onSubmit={(event) => void save(event)}>
        <SectionHeader icon={<Megaphone />} title={mode === 'edit' ? t('listing.edit') : t('listing.create')} />
        {formError ? (
          <p className="warning" role="alert">
            {formError}
          </p>
        ) : null}
        <fieldset className="fieldset-list">
          <legend>{t('listing.sectionEssentials')}</legend>
          <label>
            {t('listing.titleField')}
            <input
              required
              placeholder={t('placeholder.listingTitle')}
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </label>
          <div className="listing-form-row two-up">
            <label>
              {t('common.type')}
              <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as ListingType })}>
                <option value="offer">{t('listing.offer')}</option>
                <option value="request">{t('listing.request')}</option>
              </select>
            </label>
            <label>
              {t('common.category')}
              <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                {categories.map((entry) => (
                  <option value={entry} key={entry}>
                    {categoryLabel(entry, t)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            {t('listing.description')}
            <textarea
              required
              placeholder={t('placeholder.listingDescription')}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
            <FieldHint>{t('hint.listingDescription')}</FieldHint>
          </label>
          <label>
            {t('listing.tags')}
            <input placeholder={t('placeholder.tags')} value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} />
          </label>
        </fieldset>
        <fieldset className="fieldset-list">
          <legend>{t('listing.sectionPrice')}</legend>
          <div className="listing-form-row publish-row">
            <label>
              {t('listing.priceAmount')}
              <input required placeholder={t('placeholder.priceAmount')} value={form.priceAmount} onChange={(event) => setForm({ ...form, priceAmount: event.target.value })} />
            </label>
            <label>
              {t('listing.priceCurrency')}
              <input required maxLength={16} placeholder={t('placeholder.priceCurrency')} value={form.priceCurrency} onChange={(event) => setForm({ ...form, priceCurrency: event.target.value })} />
            </label>
            <label>
              {t('listing.location')}
              <input placeholder={t('placeholder.region')} value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} />
            </label>
          </div>
          <div className="listing-form-row two-up">
            <label>
              {t('listing.priceFrequency')}
              <input placeholder={t('placeholder.priceFrequency')} value={form.priceFrequency} onChange={(event) => setForm({ ...form, priceFrequency: event.target.value })} />
            </label>
            <label>
              {t('listing.priceNote')}
              <input placeholder={t('placeholder.priceNote')} value={form.priceNote} onChange={(event) => setForm({ ...form, priceNote: event.target.value })} />
            </label>
          </div>
          <FieldHint>{t('hint.pricePublic')}</FieldHint>
        </fieldset>
        <fieldset className="fieldset-list">
          <legend>{t('listing.sectionContact')}</legend>
          <div className="listing-form-row two-up">
            <label>
              {t('profile.contacts')}
              <select
                value={form.contactKind}
                onChange={(event) => {
                  const kind = event.target.value as ContactKind;
                  setForm({
                    ...form,
                    contactKind: kind,
                    contactValue: kind === 'nostr' && !form.contactValue.trim() && identity?.publicKey ? identity.publicKey : form.contactValue
                  });
                }}
              >
                <option value="matrix">Matrix</option>
                <option value="simplex">SimpleX</option>
                <option value="session">Session</option>
                <option value="email">Email</option>
                <option value="nostr">Nostr</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label>
              {t('listing.contact')}
              <input
                required
                placeholder={t('placeholder.contact')}
                value={form.contactValue}
                onChange={(event) => setForm({ ...form, contactValue: event.target.value })}
              />
            </label>
          </div>
          <FieldHint>{t('hint.contactPublic')}</FieldHint>
        </fieldset>
        <fieldset className="fieldset-list">
          <legend>{t('listing.sectionImages')}</legend>
          <SafetyNotice>{t('safety.blossomImages')}</SafetyNotice>
          {enabledBlossomServer ? (
            <p className="muted">
              {t('listing.blossomServer')}: {enabledBlossomServer.url}
            </p>
          ) : (
            <ActionHint>{t('listing.noBlossomServer')}</ActionHint>
          )}
          <label>
            {t('listing.images')}
            <input accept="image/jpeg,image/png,image/webp" multiple type="file" onChange={selectImages} />
            <FieldHint>{t('hint.listingImages')}</FieldHint>
          </label>
          {needsImageSignerAction ? (
            <div className="action-hint media-signer-actions">
              <p>{t(connectedSignerCanBecomeIdentity ? 'listing.imageSignerLink' : 'listing.imageSignerRequired')}</p>
              <div className="actions small">
                {connectedSignerCanBecomeIdentity ? (
                  <button onClick={onUseConnectedSignerAsIdentity} type="button">
                    {t('signer.useAsIdentity')}
                  </button>
                ) : null}
                <button onClick={onConnectSigner} type="button">
                  {nostrSigner.connected ? t('signer.reconnect') : t('signer.connect')}
                </button>
                {identityCanUseLocalUnlock(identity) && !privateKeyHex ? (
                  <button className="subtle" onClick={onCreateIdentity} type="button">
                    {t('nav.profile')}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          {imageNotice ? <p className="warning">{imageNotice}</p> : null}
          {imageDrafts.length > 0 ? (
            <div className="image-manager-grid" aria-label={t('listing.imageGallery')}>
              {imageDrafts.map((draft, index) => (
                <article className="image-manager-item" key={draft.id}>
                  <figure className="listing-image">
                    {draft.previewUrl ? <img src={draft.previewUrl} alt="" /> : <span>{draft.name}</span>}
                  </figure>
                  <div className="image-manager-copy">
                    <strong>{draft.name}</strong>
                    <span className="muted">{draft.kind === 'existing' ? t('listing.imageExisting') : t('listing.imageSelected')}</span>
                  </div>
                  <label>
                    {t('listing.imageAltFor').replace('{index}', String(index + 1))}
                    <input
                      maxLength={160}
                      placeholder={t('placeholder.imageAltText')}
                      value={draft.altText}
                      onChange={(event) => updateImageDraftAltText(draft.id, event.target.value)}
                    />
                  </label>
                  <div className="actions small gallery-actions">
                    <button className="subtle" disabled={index === 0} onClick={() => moveImageDraft(draft.id, -1)} type="button">
                      {t('listing.imageMoveEarlier')}
                    </button>
                    <button className="subtle" disabled={index === imageDrafts.length - 1} onClick={() => moveImageDraft(draft.id, 1)} type="button">
                      {t('listing.imageMoveLater')}
                    </button>
                    <button className="danger" onClick={() => removeImageDraft(draft.id)} type="button">
                      {t('listing.imageRemove')}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </fieldset>
        <fieldset className="fieldset-list">
          <legend>{t('listing.sectionPublishReadiness')}</legend>
          <div className="listing-form-row publish-row">
            <label>
              {t('listing.status')}
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ListingStatus })}>
                <option value="active">{t('listing.status.active')}</option>
                <option value="sold">{t('listing.status.sold')}</option>
                <option value="deleted">{t('listing.status.deleted')}</option>
              </select>
              <FieldHint>{t('hint.listingStatus')}</FieldHint>
            </label>
            <label>
              {t('listing.visibility')}
              <select value={form.visibility} onChange={(event) => setForm({ ...form, visibility: event.target.value as ListingVisibility })}>
                <option value="local">{t('common.local')}</option>
                <option value="public">{t('common.public')}</option>
                <option value="draft">{t('common.draft')}</option>
              </select>
              <FieldHint>{t('safety.listingVisibility')}</FieldHint>
            </label>
            <label className="date-field">
              {t('listing.expires')}
              <input type="date" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} />
            </label>
          </div>
          <div className="listing-readiness-panel quiet" aria-label={t('listing.readiness.title')} role="region">
            <div className="row between">
              <h2>{t('listing.readiness.title')}</h2>
              {!authorPublicKey ? (
                <button className="subtle" onClick={onCreateIdentity} type="button">
                  {t('next.createIdentity')}
                </button>
              ) : null}
            </div>
            <div className="readiness-grid compact">
              <div className={authorPublicKey ? 'readiness-item done' : 'readiness-item'}>
                <span className="pill">{authorPublicKey ? t('listing.readiness.ready') : t('listing.readiness.missing')}</span>
                <strong>{t('listing.readiness.identity')}</strong>
                <p>{authorPublicKey ? t('listing.readiness.identityReady') : t('listing.readiness.identityMissing')}</p>
              </div>
              <div className={essentialsReady ? 'readiness-item done' : 'readiness-item'}>
                <span className="pill">{essentialsReady ? t('listing.readiness.ready') : t('listing.readiness.missing')}</span>
                <strong>{t('listing.readiness.essentials')}</strong>
                <p>{essentialsReady ? t('listing.readiness.essentialsReady') : t('listing.readiness.essentialsMissing')}</p>
              </div>
              <div className="readiness-item done">
                <span className="pill">{form.visibility === 'public' ? t('common.public') : t('common.local')}</span>
                <strong>{t('listing.visibility')}</strong>
                <p>{visibilityStatus}</p>
              </div>
              <div className={newImageDrafts.length === 0 || (enabledBlossomServer && hasImageSigner) ? 'readiness-item done' : 'readiness-item'}>
                <span className="pill">{t('listing.sectionImages')}</span>
                <strong>{t('listing.readiness.media')}</strong>
                <p>{mediaStatus}</p>
              </div>
            </div>
          </div>
        </fieldset>
        <DisclosurePanel title={t('marketplace.advancedListingFields')}>
          <fieldset className="fieldset-list">
            <legend>{t('listing.sectionTrustSettlement')}</legend>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.barterAccepted}
                onChange={(event) => setForm({ ...form, barterAccepted: event.target.checked })}
              />
              {t('listing.barter')}
            </label>
            <div className="chip-fieldset" role="group" aria-label={t('listing.paymentOptions')}>
              <span>{t('listing.paymentOptions')}</span>
              <div className="chip-row">
                {(['cash', 'barter', 'other'] as PaymentPreference[]).map((preference) => (
                  <label className="chip-checkbox" key={preference}>
                    <input
                      type="checkbox"
                      checked={form.paymentPreferences.includes(preference)}
                      onChange={(event) => togglePaymentPreference(preference, event.target.checked)}
                    />
                    {paymentBadgeLabel(preference, t)}
                  </label>
                ))}
              </div>
              <FieldHint>{t('listing.paymentOptionsHelp')}</FieldHint>
            </div>
            <label>
              {t('agreement.mediator')}
              <input
                placeholder={t('placeholder.mediator')}
                value={form.mediatorPreference}
                onChange={(event) => setForm({ ...form, mediatorPreference: event.target.value })}
              />
            </label>
            <div className="listing-form-row two-up">
              <label>
                {t('listing.lightningOverride')}
                <input
                  placeholder={t('placeholder.lightningAddress')}
                  value={form.lightningPayment}
                  onChange={(event) => setForm({ ...form, lightningPayment: event.target.value })}
                />
              </label>
              <label>
                {t('listing.paymentIntentNote')}
                <input
                  placeholder={t('placeholder.paymentIntentNote')}
                  value={form.lightningPaymentNote}
                  onChange={(event) => setForm({ ...form, lightningPaymentNote: event.target.value })}
                />
              </label>
            </div>
            <FieldHint>{t('listing.lightningOverrideHelp')}</FieldHint>
          </fieldset>
        </DisclosurePanel>
        <button disabled={!authorCanSave || saving} title={!authorCanSave ? t('a11y.identityRequired') : undefined} type="submit">
          {saving ? t('listing.saving') : t('common.save')}
        </button>
        {!authorCanSave ? <ActionHint>{t('hint.disabledIdentity')}</ActionHint> : null}
      </form>
    </section>
  );
}

function ProfilePage({
  identity,
  profile,
  relays,
  blossomServers,
  nostrSigner,
  privateKeyHex,
  identityBackedUp,
  mediators,
  operatorSupportConfig,
  operatorSupportReceipts,
  lightningPaymentAttempts,
  nwcConnections,
  unlockedNwcConnectionIds,
  onPrivateKey,
  onLock,
  onConnectSigner,
  onNostrConnectConnected,
  onUseConnectedSignerAsIdentity,
  onIdentityForgotten,
  onBackupConfirmed,
  onIdentitySaved,
  onSaved,
  onPublish,
  onCreateOperatorSupportPaymentAttempt,
  onCheckOperatorSupportReceipt,
  onSaveNwcConnection,
  onUnlockNwcConnection,
  onPayLightningAttemptWithNwc
}: {
  identity?: IdentityRecord;
  profile?: PublicProfile;
  relays: RelayConfig[];
  blossomServers: BlossomServerConfig[];
  nostrSigner: NostrSignerState;
  privateKeyHex: string;
  identityBackedUp: boolean;
  mediators: MediatorProfile[];
  operatorSupportConfig: OperatorSupportConfig;
  operatorSupportReceipts: OperatorSupportReceipt[];
  lightningPaymentAttempts: LightningPaymentAttempt[];
  nwcConnections: NwcConnection[];
  unlockedNwcConnectionIds: string[];
  onPrivateKey: (privateKey: string) => void;
  onLock: () => void;
  onConnectSigner: () => Promise<NostrSignerState>;
  onNostrConnectConnected: (state: NostrSignerState) => void;
  onUseConnectedSignerAsIdentity: (displayName?: string, signerOverride?: NostrSignerState) => Promise<void>;
  onIdentityForgotten: () => Promise<void>;
  onBackupConfirmed: () => void;
  onIdentitySaved: (message?: string) => void;
  onSaved: (result: ProfileSaveResult) => void;
  onPublish: (profile: PublicProfile) => void;
  onCreateOperatorSupportPaymentAttempt: (request: OperatorSupportPaymentRequest) => Promise<LightningPaymentAttempt>;
  onCheckOperatorSupportReceipt: (attempt?: LightningPaymentAttempt) => Promise<OperatorSupportReceipt | undefined>;
  onSaveNwcConnection: (request: SaveNwcConnectionRequest) => Promise<NwcConnection>;
  onUnlockNwcConnection: (connection: NwcConnection, passphrase: string) => Promise<void>;
  onPayLightningAttemptWithNwc: (attempt: LightningPaymentAttempt, connectionId: string) => Promise<LightningPaymentAttempt>;
}): ReactNode {
  const { t } = useI18n();
  const localMediator = identity
    ? mediators.find((entry) => entry.publicKey.toLowerCase() === identity.publicKey.toLowerCase())
    : undefined;
  const [name, setName] = useState(identity?.displayName ?? '');
  const [passphrase, setPassphrase] = useState('');
  const [metadataMessage, setMetadataMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | undefined>();
  const [avatarPreview, setAvatarPreview] = useState('');
  const [savedProfileId, setSavedProfileId] = useState<string | undefined>(profile?.id);
  const [savedMediatorId, setSavedMediatorId] = useState<string | undefined>(localMediator?.id);
  const [form, setForm] = useState({
    bio: profile?.bio ?? '',
    avatarUrl: profile?.avatarUrl ?? '',
    lightningAddress: profile?.lightningAddress ?? '',
    lnurl: profile?.lnurl ?? '',
    region: profile?.region ?? '',
    languages: profile?.languages?.join(', ') ?? 'en, cs',
    contactKind: (profile?.contactMethods?.[0]?.kind ?? 'matrix') as ContactKind,
    contactValue: profile?.contactMethods?.[0]?.value ?? '',
    skills: profile?.skills?.join(', ') ?? '',
    mediatorAvailable: profile?.mediatorAvailable ?? false,
    mediatorSpecialties: localMediator?.specialties.join(', ') ?? '',
    mediatorFeeModel: localMediator?.feeModel ?? '',
    mediatorStyle: localMediator?.mediationStyle ?? '',
    mediatorResponseTime: localMediator?.responseTime ?? '',
    mediatorProcedure: localMediator?.procedure ?? '',
    publicVisibility: profile?.publicVisibility ?? false
  });
  const [activeProfileTab, setActiveProfileTab] = useState<ProfileTab>(() => (window.location.hash === '#profile:public' ? 'publicProfile' : 'identity'));
  const localIdentity = identityCanUseLocalUnlock(identity);
  const extensionIdentity = identity?.keySource === 'nostr-extension';
  const signerStatus = signerIdentityStatus(identity, nostrSigner);
  const enabledBlossomServer = blossomServers.find((server) => server.enabled);
  const activeSupportReceipt = supportReceiptForPublicKey(identity?.publicKey ?? profile?.publicKey, operatorSupportReceipts);

  useEffect(() => {
    setName(identity?.displayName ?? '');
    setSavedProfileId(profile?.id);
    setSavedMediatorId(localMediator?.id);
    setForm({
      bio: profile?.bio ?? '',
      avatarUrl: profile?.avatarUrl ?? '',
      lightningAddress: profile?.lightningAddress ?? '',
      lnurl: profile?.lnurl ?? '',
      region: profile?.region ?? '',
      languages: profile?.languages?.join(', ') ?? 'en, cs',
      contactKind: (profile?.contactMethods?.[0]?.kind ?? 'matrix') as ContactKind,
      contactValue: profile?.contactMethods?.[0]?.value ?? '',
      skills: profile?.skills?.join(', ') ?? '',
      mediatorAvailable: profile?.mediatorAvailable ?? false,
      mediatorSpecialties: localMediator?.specialties.join(', ') ?? '',
      mediatorFeeModel: localMediator?.feeModel ?? '',
      mediatorStyle: localMediator?.mediationStyle ?? '',
      mediatorResponseTime: localMediator?.responseTime ?? '',
      mediatorProcedure: localMediator?.procedure ?? '',
      publicVisibility: profile?.publicVisibility ?? false
    });
  }, [identity?.displayName, identity?.id, localMediator?.id, localMediator?.updatedAt, profile?.id, profile?.updatedAt]);

  useEffect(() => {
    const onHash = (): void => {
      if (window.location.hash === '#profile:public') setActiveProfileTab('publicProfile');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  const create = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const record = await createIdentity(name, passphrase);
    await db.identity.clear();
    await db.identity.put(record);
    onLock();
    onIdentitySaved();
  };

  const useExistingNostrAccount = async (): Promise<void> => {
    await onUseConnectedSignerAsIdentity(name || profile?.displayName || undefined);
    onLock();
  };

  const forgetIdentity = async (): Promise<void> => {
    if (!identity || !window.confirm(t('identity.forgetConfirm'))) return;
    await onIdentityForgotten();
  };

  const unlock = async (): Promise<void> => {
    if (!identity || !identityCanUseLocalUnlock(identity)) return;
    const decrypted = await decryptPrivateKey(identity.encryptedPrivateKey, passphrase);
    onPrivateKey(decrypted);
    onBackupConfirmed();
  };

  const exportIdentity = (): void => {
    if (!identity || !identityCanUseLocalUnlock(identity)) return;
    downloadJson('agoramesh-identity.json', identity);
    onBackupConfirmed();
  };

  const fetchMetadata = async (): Promise<void> => {
    if (!identity) return;
    setMetadataMessage(t('identity.metadataFetching'));
    const metadata = await fetchNostrProfileMetadata(relays, identity.publicKey);
    if (!metadata) {
      setMetadataMessage(t('identity.metadataMissing'));
      return;
    }
    const prefill = publicProfileFromNostrMetadata(metadata, {
      id: profile?.id ?? newId('profile'),
      displayName: sanitizePlainText(name || identity.displayName),
      publicKey: identity.publicKey
    });
    setName(prefill.displayName ?? identity.displayName);
    setForm((current) => ({
      ...current,
      bio: prefill.bio ?? current.bio,
      avatarUrl: prefill.avatarUrl ?? current.avatarUrl,
      lightningAddress: prefill.lightningAddress ?? current.lightningAddress,
      lnurl: prefill.lnurl ?? current.lnurl
    }));
    setMetadataMessage(t('identity.metadataImported'));
  };

  const selectAvatarFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      validateListingImageFile(file);
      setProfileError('');
      setAvatarFile(file);
      setAvatarPreview((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(file);
      });
    } catch (error) {
      event.target.value = '';
      setAvatarFile(undefined);
      setProfileError(error instanceof Error ? error.message : t('profile.avatarUploadFailed'));
    }
  };

  const uploadAvatar = async (file: File): Promise<string> => {
    if (!identity) throw new Error(t('a11y.identityRequired'));
    if (!enabledBlossomServer) throw new Error(t('profile.avatarNoBlossomServer'));
    const fileHash = await sha256File(file);
    const canUseSigner = nostrSigner.connected && nostrSigner.publicKey?.toLowerCase() === identity.publicKey.toLowerCase();
    const signedAuth = canUseSigner
      ? await signBlossomUploadAuthWithExtension(fileHash, file.type, file.size, identity.publicKey)
      : privateKeyHex
        ? await signBlossomUploadAuthLocally(fileHash, file.type, file.size, privateKeyHex, identity.publicKey)
        : undefined;
    if (!signedAuth) throw new Error(t('profile.avatarSignerRequired'));
    const response = await uploadToBlossom(enabledBlossomServer.url, file, signedAuth);
    const image = listingImageFromBlossomResponse(response, file, fileHash, enabledBlossomServer.url, t('profile.avatar'));
    return image.url;
  };

  const saveProfile = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!identity) return;
    setProfileError('');
    setProfileSaving(true);
    try {
      const at = nowIso();
      const contact = { ...emptyContact(), kind: form.contactKind, value: sanitizePlainText(form.contactValue) };
      if (contact.kind === 'nostr' && !normalizeNostrContact(contact.value)) {
        throw new Error(t('nostrContact.invalidRecipient'));
      }
      const profileId = profile?.id ?? savedProfileId ?? newId('profile');
      const avatarUrl = avatarFile ? await uploadAvatar(avatarFile) : sanitizePlainText(form.avatarUrl);
      const next: PublicProfile = publicProfileSchema.parse({
        id: profileId,
        displayName: sanitizePlainText(name || identity.displayName),
        publicKey: identity.publicKey,
        avatarUrl,
        lightningAddress: sanitizePlainText(form.lightningAddress),
        lnurl: sanitizePlainText(form.lnurl),
        bio: sanitizePlainText(form.bio),
        region: sanitizePlainText(form.region),
        languages: splitList(form.languages),
        contactMethods: contact.value ? [contact] : [],
        skills: splitList(form.skills),
        mediatorAvailable: form.mediatorAvailable,
        publicVisibility: form.publicVisibility,
        createdAt: profile?.createdAt ?? at,
        updatedAt: at
      });
      let mediatorProfileId: string | undefined;
      await db.profile.clear();
      await db.profile.put(next);
      if (form.mediatorAvailable) {
        const mediator = mediatorProfileSchema.parse({
          id: localMediator?.id ?? savedMediatorId ?? `mediator_${next.id}`,
          displayName: next.displayName,
          publicKey: identity.publicKey,
          region: next.region,
          languages: next.languages,
          specialties: splitList(form.mediatorSpecialties),
          feeModel: sanitizePlainText(form.mediatorFeeModel),
          mediationStyle: sanitizePlainText(form.mediatorStyle),
          responseTime: sanitizePlainText(form.mediatorResponseTime),
          caseCount: localMediator?.caseCount ?? 0,
          contactMethods: next.contactMethods,
          procedure: sanitizePlainText(form.mediatorProcedure),
          createdAt: localMediator?.createdAt ?? at,
          updatedAt: at
        });
        await db.mediators.put(mediator);
        mediatorProfileId = mediator.id;
        setSavedMediatorId(mediator.id);
      }
      setSavedProfileId(next.id);
      setForm((current) => ({ ...current, avatarUrl: next.avatarUrl ?? '' }));
      setAvatarFile(undefined);
      setAvatarPreview((current) => {
        if (current) URL.revokeObjectURL(current);
        return '';
      });
      onSaved({ mediatorAvailable: form.mediatorAvailable, mediatorProfileId });
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : t('profile.saveError'));
    } finally {
      setProfileSaving(false);
    }
  };

  const identityReadiness: ReadinessItem[] = [
    {
      done: Boolean(identity),
      label: t('readiness.identity'),
      detail: identity ? t('readiness.identityReady') : t('readiness.identityMissing')
    },
    {
      done: extensionIdentity || identityBackedUp,
      label: t('readiness.backup'),
      detail: extensionIdentity ? t('identity.extensionBackup') : identityBackedUp ? t('readiness.backupReady') : t('readiness.backupMissing')
    },
    {
      done: extensionIdentity
        ? Boolean(nostrSigner.connected && nostrSigner.publicKey?.toLowerCase() === identity?.publicKey.toLowerCase())
        : Boolean(privateKeyHex),
      label: t('readiness.unlock'),
      detail: extensionIdentity
        ? nostrSigner.connected
          ? t('identity.extensionConnected')
          : t('identity.extensionReconnect')
        : privateKeyHex
          ? t('readiness.unlockReady')
          : t('readiness.unlockMissing')
    },
    {
      done: Boolean(profile),
      label: t('readiness.profile'),
      detail: profile ? t('readiness.profileReady') : t('readiness.profileMissing')
    }
  ];
  const profileReadiness: ReadinessItem[] = [
    {
      done: Boolean(name || identity?.displayName),
      label: t('common.displayName'),
      detail: name || identity?.displayName || t('readiness.needsAttention')
    },
    {
      done: Boolean(form.region.trim()),
      label: t('profile.region'),
      detail: form.region.trim() || t('readiness.needsAttention')
    },
    {
      done: Boolean(form.contactValue.trim()),
      label: t('profile.contacts'),
      detail: form.contactValue.trim() ? form.contactKind : t('readiness.needsAttention')
    },
    {
      done: Boolean(form.skills.trim()),
      label: t('profile.skills'),
      detail: form.skills.trim() || t('readiness.needsAttention')
    },
    {
      done: Boolean(avatarPreview || form.avatarUrl.trim()),
      label: t('profile.avatarShort'),
      detail: avatarPreview || form.avatarUrl.trim() ? t('profile.avatarReady') : t('profile.avatarOptional')
    },
    {
      done: form.mediatorAvailable ? Boolean(localMediator || (form.mediatorFeeModel && form.mediatorStyle && form.mediatorResponseTime && form.mediatorProcedure)) : true,
      label: t('profile.mediatorMarketplace'),
      detail: form.mediatorAvailable ? (localMediator ? t('readiness.ready') : t('readiness.needsAttention')) : t('common.none')
    }
  ];
  const identityStatusText = !identity
    ? t('identity.noIdentity')
    : extensionIdentity
      ? nostrSigner.connected && nostrSigner.publicKey?.toLowerCase() === identity.publicKey.toLowerCase()
        ? t('identity.extensionConnectedCompact')
        : t('identity.extensionReconnectCompact')
      : privateKeyHex
        ? t('identity.unlocked')
        : t('identity.lockedCompact');

  return (
    <section className="page">
      <div className="panel">
        <SectionHeader icon={<KeyRound />} title={t('profile.title')} body={t('profile.compactBody')} />
        <CompactTabs
          active={activeProfileTab}
          label={t('profile.title')}
          tabs={[
            ['identity', t('profile.tab.identity')],
            ['publicProfile', t('profile.tab.public')],
            ['backup', t('profile.tab.backup')]
          ]}
          onChange={setActiveProfileTab}
        />

        {activeProfileTab === 'identity' ? (
          <section className="settings-section" aria-labelledby="profile-identity">
            <h2 id="profile-identity">{t('identity.title')}</h2>
            {identity ? (
              <>
                <article className="identity-summary">
                  <div>
                    <div className="row">
                      <strong>{identity.displayName}</strong>
                      <SupporterBadge receipt={activeSupportReceipt} />
                    </div>
                    <p className="muted">
                      {extensionIdentity ? t('identity.sourceExtension') : t('identity.sourceLocal')} · {identityStatusText}
                    </p>
                    <p className="key" title={t('common.publicKey')}>
                      {identity.publicKey}
                    </p>
                  </div>
                  <div className="actions small">
                    {extensionIdentity ? (
                      <button onClick={() => void useExistingNostrAccount()} type="button">
                        <KeyRound size={16} /> {t('signer.reconnect')}
                      </button>
                    ) : privateKeyHex ? (
                      <button onClick={onLock} type="button">
                        <LockKeyhole size={16} /> {t('identity.lock')}
                      </button>
                    ) : null}
                  </div>
                </article>
                {!extensionIdentity && !privateKeyHex ? (
                  <div className="inline-card">
                    <label>
                      {t('common.passphrase')}
                      <input
                        placeholder={t('placeholder.passphrase')}
                        type="password"
                        value={passphrase}
                        onChange={(event) => setPassphrase(event.target.value)}
                      />
                      <FieldHint>{t('hint.unlockPassphraseShort')}</FieldHint>
                    </label>
                    <button onClick={() => void unlock()} type="button">
                      <FileLock2 size={16} /> {t('identity.decrypt')}
                    </button>
                  </div>
                ) : null}
                <DisclosurePanel title={t('guided.statusDetails')}>
                  <PageStatusDisclosure title={t('readiness.identityProfile')} items={identityReadiness} />
                  {localIdentity && !identityBackedUp ? <p className="muted">{t('hint.backupNext')}</p> : null}
                  <DisclosurePanel title={t('identity.metadataTitle')}>
                    <p className="muted">{t('identity.metadataBody')}</p>
                    <button onClick={() => void fetchMetadata()} type="button">
                      <Download size={16} /> {t('identity.metadataFetch')}
                    </button>
                    {metadataMessage ? <StatusMessage>{metadataMessage}</StatusMessage> : null}
                  </DisclosurePanel>
                  <DisclosurePanel title={t('ui.advanced')}>
                    <SafetyNotice>{t('identity.forgetBody')}</SafetyNotice>
                    <button className="danger" onClick={() => void forgetIdentity()} type="button">
                      <LockKeyhole size={16} /> {t('identity.forget')}
                    </button>
                  </DisclosurePanel>
                </DisclosurePanel>
              </>
            ) : (
              <>
                <section className="identity-summary">
                  <div>
                    <strong>{t('identity.existingTitle')}</strong>
                    <p className="muted">{t('identity.existingBodyCompact')}</p>
                    <label>
                      {t('common.displayName')}
                      <input placeholder={t('placeholder.displayName')} value={name} onChange={(event) => setName(event.target.value)} />
                    </label>
                  </div>
                  <div className="actions small">
                    <button onClick={() => void useExistingNostrAccount()} type="button">
                      <KeyRound size={16} /> {t('identity.connectExisting')}
                    </button>
                  </div>
                  <NostrConnectPairingPanel
                    relays={relays}
                    onConnected={(state) => {
                      onNostrConnectConnected(state);
                      void onUseConnectedSignerAsIdentity(name || profile?.displayName || undefined, state);
                    }}
                  />
                </section>
                <DisclosurePanel title={t('identity.generateTitle')}>
                  <form className="stack-form" onSubmit={(event) => void create(event)}>
                    <p className="muted">{t('identity.generateBody')}</p>
                    <label>
                      {t('common.displayName')}
                      <input
                        required
                        placeholder={t('placeholder.displayName')}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                      />
                    </label>
                    <label>
                      {t('common.passphrase')}
                      <input
                        required
                        minLength={10}
                        placeholder={t('placeholder.passphrase')}
                        type="password"
                        value={passphrase}
                        onChange={(event) => setPassphrase(event.target.value)}
                      />
                      <FieldHint>{t('hint.identityPassphraseShort')}</FieldHint>
                    </label>
                    <button type="submit">{t('identity.create')}</button>
                  </form>
                </DisclosurePanel>
                <DisclosurePanel title={t('guided.statusDetails')}>
                  <SignerStatusStrip
                    status={signerStatus}
                    relays={relays}
                    onConnect={() => void onConnectSigner()}
                    onNostrConnectConnected={onNostrConnectConnected}
                    onUseAsIdentity={() => void onUseConnectedSignerAsIdentity()}
                  />
                  <PageStatusDisclosure title={t('readiness.identityProfile')} items={identityReadiness} />
                </DisclosurePanel>
              </>
            )}
          </section>
        ) : null}

        {activeProfileTab === 'publicProfile' ? (
          <form className="settings-section" aria-labelledby="profile-public" onSubmit={(event) => void saveProfile(event)}>
            <h2 id="profile-public">{t('profile.title')}</h2>
            <DisclosurePanel title={t('ui.whyMatters')}>
              <InlineHelp>{t('help.profile')}</InlineHelp>
            </DisclosurePanel>
            <PageStatusDisclosure title={t('profile.marketplaceReadiness')} items={profileReadiness} />
            {profileError ? (
              <p className="warning" role="alert">
                {profileError}
              </p>
            ) : null}
            {profile?.mediatorAvailable && !localMediator ? <ActionHint>{t('profile.mediatorIncomplete')}</ActionHint> : null}
            <div className="profile-avatar-editor">
              <AvatarCircle avatarUrl={avatarPreview || form.avatarUrl} label={name || identity?.displayName || t('profile.title')} />
              <div>
                <div className="row">
                  <strong>{t('profile.avatarPreview')}</strong>
                  <SupporterBadge receipt={activeSupportReceipt} />
                </div>
                <p className="muted">{t('profile.avatarHelp')}</p>
              </div>
            </div>
            <OperatorSupportPanel
              config={operatorSupportConfig}
              identity={identity}
              privateKeyHex={privateKeyHex}
              nostrSigner={nostrSigner}
              relays={relays}
              attempts={lightningPaymentAttempts}
              receipts={operatorSupportReceipts}
              nwcConnections={nwcConnections}
              unlockedNwcConnectionIds={unlockedNwcConnectionIds}
              onConnectSigner={() => void onConnectSigner()}
              onCreatePaymentAttempt={onCreateOperatorSupportPaymentAttempt}
              onCheckReceipt={onCheckOperatorSupportReceipt}
              onSaveNwcConnection={onSaveNwcConnection}
              onUnlockNwcConnection={onUnlockNwcConnection}
              onPayWithNwc={onPayLightningAttemptWithNwc}
            />
            <label>
              {t('profile.bio')}
              <textarea placeholder={t('placeholder.profileBio')} value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} />
            </label>
            <label>
              {t('profile.avatar')}
              <input placeholder={t('placeholder.avatar')} value={form.avatarUrl} onChange={(event) => setForm({ ...form, avatarUrl: event.target.value })} />
              <FieldHint>{t('profile.avatarUrlHelp')}</FieldHint>
            </label>
            <label>
              {t('profile.avatarUpload')}
              <input accept="image/jpeg,image/png,image/webp" type="file" onChange={selectAvatarFile} />
              <FieldHint>{enabledBlossomServer ? t('profile.avatarUploadHelp') : t('profile.avatarNoBlossomServer')}</FieldHint>
            </label>
            <div className="two">
              <label>
                {t('profile.lightningAddress')}
                <input
                  placeholder={t('placeholder.lightningAddress')}
                  value={form.lightningAddress}
                  onChange={(event) => setForm({ ...form, lightningAddress: event.target.value })}
                />
              </label>
              <label>
                {t('profile.lnurl')}
                <input placeholder={t('placeholder.lnurl')} value={form.lnurl} onChange={(event) => setForm({ ...form, lnurl: event.target.value })} />
              </label>
            </div>
            <FieldHint>{t('profile.lightningHelp')}</FieldHint>
            {avatarFile && !privateKeyHex && !(nostrSigner.connected && nostrSigner.publicKey?.toLowerCase() === identity?.publicKey.toLowerCase()) ? (
              <ActionHint>
                {t('profile.avatarSignerRequired')}{' '}
                <button className="inline-action" onClick={() => void onConnectSigner()} type="button">
                  {t('signer.connect')}
                </button>
              </ActionHint>
            ) : null}
            <label>
              {t('profile.region')}
              <input placeholder={t('placeholder.region')} value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} />
            </label>
            <label>
              {t('profile.languages')}
              <input placeholder={t('placeholder.languages')} value={form.languages} onChange={(event) => setForm({ ...form, languages: event.target.value })} />
            </label>
            <div className="two">
              <label>
                {t('profile.contacts')}
                <select
                  value={form.contactKind}
                  onChange={(event) => {
                    const kind = event.target.value as ContactKind;
                    setForm({
                      ...form,
                      contactKind: kind,
                      contactValue: kind === 'nostr' && !form.contactValue.trim() && identity?.publicKey ? identity.publicKey : form.contactValue
                    });
                  }}
                >
                  <option value="matrix">Matrix</option>
                  <option value="simplex">SimpleX</option>
                  <option value="session">Session</option>
                  <option value="email">Email</option>
                  <option value="nostr">Nostr</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label>
                {t('profile.contacts')}
                <input
                  placeholder={t('placeholder.contact')}
                  value={form.contactValue}
                  onChange={(event) => setForm({ ...form, contactValue: event.target.value })}
                />
              </label>
            </div>
            <label>
              {t('profile.skills')}
              <input placeholder={t('placeholder.skills')} value={form.skills} onChange={(event) => setForm({ ...form, skills: event.target.value })} />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.mediatorAvailable}
                onChange={(event) => setForm({ ...form, mediatorAvailable: event.target.checked })}
              />
              {t('profile.mediatorAvailable')}
            </label>
            {form.mediatorAvailable ? (
              <fieldset className="fieldset-list">
                <legend>{t('profile.mediatorMarketplace')}</legend>
                <InlineHelp>{t('profile.mediatorMarketplaceHelp')}</InlineHelp>
                <label>
                  {t('mediator.specialties')}
                  <input
                    required={form.mediatorAvailable}
                    placeholder={t('placeholder.mediatorSpecialties')}
                    value={form.mediatorSpecialties}
                    onChange={(event) => setForm({ ...form, mediatorSpecialties: event.target.value })}
                  />
                </label>
                <label>
                  {t('mediator.fee')}
                  <input
                    required={form.mediatorAvailable}
                    placeholder={t('placeholder.mediatorFee')}
                    value={form.mediatorFeeModel}
                    onChange={(event) => setForm({ ...form, mediatorFeeModel: event.target.value })}
                  />
                </label>
                <label>
                  {t('mediator.style')}
                  <textarea
                    required={form.mediatorAvailable}
                    placeholder={t('placeholder.mediatorStyle')}
                    value={form.mediatorStyle}
                    onChange={(event) => setForm({ ...form, mediatorStyle: event.target.value })}
                  />
                </label>
                <label>
                  {t('mediator.response')}
                  <input
                    required={form.mediatorAvailable}
                    placeholder={t('placeholder.mediatorResponse')}
                    value={form.mediatorResponseTime}
                    onChange={(event) => setForm({ ...form, mediatorResponseTime: event.target.value })}
                  />
                </label>
                <label>
                  {t('mediator.procedure')}
                  <textarea
                    required={form.mediatorAvailable}
                    placeholder={t('placeholder.mediatorProcedure')}
                    value={form.mediatorProcedure}
                    onChange={(event) => setForm({ ...form, mediatorProcedure: event.target.value })}
                  />
                  <FieldHint>{t('hint.mediatorProcedure')}</FieldHint>
                </label>
              </fieldset>
            ) : null}
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.publicVisibility}
                onChange={(event) => setForm({ ...form, publicVisibility: event.target.checked })}
              />
              {t('profile.publicVisibility')}
            </label>
            <button disabled={!identity || profileSaving} title={!identity ? t('a11y.identityRequired') : undefined} type="submit">
              {profileSaving ? t('profile.saving') : t('common.save')}
            </button>
            {!identity ? <ActionHint>{t('hint.disabledIdentity')}</ActionHint> : null}
            {profile?.publicVisibility ? (
              <button onClick={() => onPublish(profile)} type="button">
                <Radio size={16} /> {t('common.publish')}
              </button>
            ) : null}
          </form>
        ) : null}

        {activeProfileTab === 'backup' ? (
          <section className="settings-section" aria-labelledby="profile-backup">
            <h2 id="profile-backup">{t('profile.tab.backup')}</h2>
            <SafetyNotice>{t('identity.lost')}</SafetyNotice>
            {identity && localIdentity ? (
              <>
                <button onClick={exportIdentity} type="button">
                  <Download size={16} /> {t('identity.export')}
                </button>
                <StatusMessage className={identityBackedUp ? 'ok' : 'warning'}>
                  {identityBackedUp ? t('identity.backupConfirmed') : t('identity.backupMissing')}
                </StatusMessage>
              </>
            ) : identity && extensionIdentity ? (
              <>
                <ActionHint>{t('identity.extensionBackup')}</ActionHint>
                <button disabled title={t('identity.extensionNoPrivateKey')} type="button">
                  <Download size={16} /> {t('identity.export')}
                </button>
              </>
            ) : (
              <EmptyState title={t('empty.identityTitle')} body={t('empty.identityBody')} />
            )}
          </section>
        ) : null}
      </div>
    </section>
  );
}

function MediatorPage({
  identity,
  profile,
  mediators,
  syncedProfiles,
  syncedMediators,
  operatorSupportReceipts,
  syncSettings,
  relays,
  nostrSigner,
  privateKeyHex,
  nostrContactReceipts,
  onConnectSigner,
  onToggleHidden,
  onSaved,
  onPublish,
  onSendNostrIntro
}: {
  identity?: IdentityRecord;
  profile?: PublicProfile;
  mediators: MediatorProfile[];
  syncedProfiles: SyncedPublicRecord<PublicProfile>[];
  syncedMediators: SyncedPublicRecord<MediatorProfile>[];
  operatorSupportReceipts: OperatorSupportReceipt[];
  syncSettings: SyncSettings;
  relays: RelayConfig[];
  nostrSigner: NostrSignerState;
  privateKeyHex: string;
  nostrContactReceipts: NostrContactReceipt[];
  onConnectSigner: () => void;
  onToggleHidden: (record: SyncedPublicRecord<MediatorProfile>, hidden: boolean) => void;
  onSaved: () => void;
  onPublish: (profile: MediatorProfile) => void;
  onSendNostrIntro: (args: SendNostrContactIntroArgs) => Promise<NostrContactReceipt>;
}): ReactNode {
  const { t } = useI18n();
  const [source, setSource] = useState<DataSourceFilter>(syncSettings.defaultBrowseSource);
  const [trust, setTrust] = useState<TrustFilter>('all');
  const [hidden, setHidden] = useState<HiddenFilter>('visible');
  const conflictGroups = useMemo(() => findSyncedConflictGroups(syncedMediators), [syncedMediators]);
  const [form, setForm] = useState({
    specialties: '',
    feeModel: '',
    mediationStyle: '',
    responseTime: '',
    procedure: ''
  });

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!identity || !profile) return;
    const at = nowIso();
    const mediator: MediatorProfile = mediatorProfileSchema.parse({
      id: newId('mediator'),
      displayName: profile.displayName,
      publicKey: identity.publicKey,
      region: profile.region,
      languages: profile.languages,
      specialties: splitList(form.specialties),
      feeModel: sanitizePlainText(form.feeModel),
      mediationStyle: sanitizePlainText(form.mediationStyle),
      responseTime: sanitizePlainText(form.responseTime),
      caseCount: 0,
      contactMethods: profile.contactMethods,
      procedure: sanitizePlainText(form.procedure),
      createdAt: at,
      updatedAt: at
    });
    await db.mediators.put(mediator);
    onSaved();
  };

  const visibleMediators = useMemo(() => {
    const localRows =
      source === 'synced' || hidden === 'hidden'
        ? []
        : mediators.map((mediator) => ({ mediator, source: 'local' as const, trusted: true, record: undefined }));
    const syncedRows =
      source === 'local'
        ? []
        : applyHiddenFilter(syncedMediators, hidden)
            .filter((record) => (trust === 'all' ? true : trust === 'trusted' ? record.trusted : !record.trusted))
            .map((record) => ({ mediator: record.payload, source: 'synced' as const, trusted: record.trusted, record }));
    return [...localRows, ...syncedRows];
  }, [hidden, mediators, source, syncedMediators, trust]);
  const incompleteMediatorSignals = useMemo(() => {
    if (source === 'local') return [];
    const fullMediatorKeys = new Set(
      [
        ...mediators.map((mediator) => mediator.publicKey.toLowerCase()),
        ...syncedMediators.map((record) => record.payload.publicKey.toLowerCase())
      ]
    );
    return applyHiddenFilter(syncedProfiles, hidden)
      .filter((record) => record.payload.mediatorAvailable)
      .filter((record) => !fullMediatorKeys.has(record.payload.publicKey.toLowerCase()))
      .filter((record) => (trust === 'all' ? true : trust === 'trusted' ? record.trusted : !record.trusted));
  }, [hidden, mediators, source, syncedMediators, syncedProfiles, trust]);
  const profileForPublicKey = (publicKey: string): PublicProfile | undefined => {
    const normalized = publicKey.toLowerCase();
    if (profile?.publicKey.toLowerCase() === normalized) return profile;
    return syncedProfiles.find((record) => record.payload.publicKey.toLowerCase() === normalized)?.payload;
  };

  return (
    <section className="page split">
      <form className="panel" onSubmit={(event) => void save(event)}>
        <SectionHeader icon={<Scale />} title={t('mediator.create')} body={t('mediator.philosophy')} />
        <InlineHelp>{t('help.mediatorCreate')}</InlineHelp>
        <label>
          {t('mediator.specialties')}
          <input
            placeholder={t('placeholder.mediatorSpecialties')}
            value={form.specialties}
            onChange={(event) => setForm({ ...form, specialties: event.target.value })}
          />
        </label>
        <label>
          {t('mediator.fee')}
          <input
            required
            placeholder={t('placeholder.mediatorFee')}
            value={form.feeModel}
            onChange={(event) => setForm({ ...form, feeModel: event.target.value })}
          />
        </label>
        <label>
          {t('mediator.style')}
          <textarea
            required
            placeholder={t('placeholder.mediatorStyle')}
            value={form.mediationStyle}
            onChange={(event) => setForm({ ...form, mediationStyle: event.target.value })}
          />
        </label>
        <label>
          {t('mediator.response')}
          <input
            required
            placeholder={t('placeholder.mediatorResponse')}
            value={form.responseTime}
            onChange={(event) => setForm({ ...form, responseTime: event.target.value })}
          />
        </label>
        <label>
          {t('mediator.procedure')}
          <textarea
            required
            placeholder={t('placeholder.mediatorProcedure')}
            value={form.procedure}
            onChange={(event) => setForm({ ...form, procedure: event.target.value })}
          />
          <FieldHint>{t('hint.mediatorProcedure')}</FieldHint>
        </label>
        <button disabled={!identity || !profile} title={!identity || !profile ? t('a11y.identityRequired') : undefined} type="submit">
          {t('common.save')}
        </button>
        {!identity || !profile ? <ActionHint>{t('hint.disabledProfile')}</ActionHint> : null}
      </form>
      <div className="panel">
        <SectionHeader icon={<Scale />} title={t('mediator.title')} body={t('mediator.philosophy')} />
        <InlineHelp>{t('help.syncedTrust')}</InlineHelp>
        <div className="filters compact-filters">
          <select aria-label={t('sync.source')} value={source} onChange={(event) => setSource(event.target.value as DataSourceFilter)}>
            <option value="combined">{t('sync.combined')}</option>
            <option value="local">{t('sync.localOnly')}</option>
            <option value="synced">{t('sync.syncedOnly')}</option>
          </select>
          <select aria-label={t('sync.trust')} value={trust} onChange={(event) => setTrust(event.target.value as TrustFilter)}>
            <option value="all">{t('common.all')}</option>
            <option value="trusted">{t('sync.trusted')}</option>
            <option value="untrusted">{t('sync.untrusted')}</option>
          </select>
          <select aria-label={t('sync.hiddenFilter')} value={hidden} onChange={(event) => setHidden(event.target.value as HiddenFilter)}>
            <option value="visible">{t('sync.visibleOnly')}</option>
            <option value="hidden">{t('sync.hiddenOnly')}</option>
            <option value="all">{t('sync.visibleAndHidden')}</option>
          </select>
        </div>
        <div className="card-grid single">
          {visibleMediators.map(({ mediator, source: rowSource, trusted, record }) => (
            <article className="card" key={record?.id ?? `${rowSource}-${mediator.id}`}>
              {(() => {
                const contact = nostrContactForMethods(mediator.contactMethods, mediator.publicKey);
                return contact ? (
                  <NostrContactPanel
                    target={{
                      recipientPublicKey: contact.publicKey,
                      label: mediator.displayName,
                      contextType: 'mediator',
                      contextId: mediator.id,
                      contextTitle: mediator.displayName
                    }}
                    identity={identity}
                    relays={relays}
                    nostrSigner={nostrSigner}
                    privateKeyHex={privateKeyHex}
                    receipts={nostrContactReceipts}
                    onConnectSigner={() => void onConnectSigner()}
                    onSend={onSendNostrIntro}
                  />
                ) : null;
              })()}
              {syncSettings.showDataSource ? (
                <span className="pill">
                  {rowSource === 'synced'
                    ? `${t('sync.syncedData')} · ${trusted ? t('sync.trusted') : t('sync.untrusted')}`
                  : t('sync.localData')}
                </span>
              ) : null}
              {record ? (
                <SyncedQualityBadges
                  conflict={isRecordConflicted(record, conflictGroups)}
                  hidden={record.hidden}
                  preferred={isPreferredConflictRecord(record, conflictGroups)}
                />
              ) : null}
              <div className="profile-card-heading">
                <AvatarCircle avatarUrl={profileForPublicKey(mediator.publicKey)?.avatarUrl} label={mediator.displayName} />
                <div>
                  <h2>{mediator.displayName}</h2>
                  <SupporterBadge receipt={supportReceiptForPublicKey(mediator.publicKey, operatorSupportReceipts)} />
                </div>
              </div>
              <p>{mediator.mediationStyle}</p>
              <p className="muted">{mediator.region} · {mediator.languages.join(', ')}</p>
              <p>{mediator.procedure}</p>
              {rowSource === 'local' ? (
                <button onClick={() => onPublish(mediator)} type="button">
                  <Radio size={16} /> {t('common.publish')}
                </button>
              ) : null}
              {record ? (
                <SyncedRecordActions
                  conflict={isRecordConflicted(record, conflictGroups)}
                  preferred={isPreferredConflictRecord(record, conflictGroups)}
                  record={record}
                  onToggleHidden={onToggleHidden}
                />
              ) : null}
            </article>
          ))}
          {incompleteMediatorSignals.map((record) => (
            <article className="card compact" key={`profile-mediator-signal-${record.id}`}>
              <span className="pill">{record.trusted ? t('sync.trusted') : t('sync.untrusted')}</span>
              <div className="profile-card-heading">
                <AvatarCircle avatarUrl={record.payload.avatarUrl} label={record.payload.displayName} />
                <div>
                  <h2>{record.payload.displayName}</h2>
                  <SupporterBadge receipt={supportReceiptForPublicKey(record.payload.publicKey, operatorSupportReceipts)} />
                </div>
              </div>
              <p className="muted">{record.payload.region || t('common.region')} · {record.payload.languages.join(', ')}</p>
              <p>{t('profile.mediatorSignalIncomplete')}</p>
              <p className="key">{record.payload.publicKey}</p>
            </article>
          ))}
          {visibleMediators.length === 0 && incompleteMediatorSignals.length === 0 ? <EmptyState title={t('empty.mediatorsTitle')} body={t('empty.mediatorsBody')} /> : null}
        </div>
      </div>
    </section>
  );
}

function NostrInboxPanel({
  identity,
  relays,
  nostrSigner,
  privateKeyHex,
  messages,
  threads,
  cursors,
  receipts,
  defaultOpen,
  onConnectSigner,
  onFetch,
  onThreadChange,
  onSend
}: {
  identity?: IdentityRecord;
  relays: RelayConfig[];
  nostrSigner: NostrSignerState;
  privateKeyHex: string;
  messages: NostrMessageRecord[];
  threads: NostrMessageThread[];
  cursors: NostrInboxCursor[];
  receipts: NostrContactReceipt[];
  defaultOpen: boolean;
  onConnectSigner: () => void;
  onFetch: (inboxPassphrase: string) => Promise<InboxFetchSummary>;
  onThreadChange: (thread: NostrMessageThread, changes: { read?: boolean; archived?: boolean }) => void;
  onSend: (args: SendNostrContactIntroArgs) => Promise<NostrContactReceipt>;
}): ReactNode {
  const { t } = useI18n();
  const [passphrase, setPassphrase] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState('');
  const [fetching, setFetching] = useState(false);
  const [summary, setSummary] = useState<InboxFetchSummary | undefined>();
  const [decrypted, setDecrypted] = useState<DecryptedNostrMessage[]>([]);
  const [activeThreadKey, setActiveThreadKey] = useState('');
  const [boxFilter, setBoxFilter] = useState<'all' | 'inbox' | 'outbox'>('all');
  const enabledRelayCount = relays.filter((relay) => relay.enabled).length;
  const canUseLocal = Boolean(identityCanUseLocalUnlock(identity) && privateKeyHex);
  const canUseSigner = Boolean(
    identity &&
      nostrSigner.connected &&
      nostrSigner.publicKey?.toLowerCase() === identity.publicKey.toLowerCase() &&
      signerSupportsNip44Decryption()
  );
  const fetchBlocker = !identity
    ? t('nostrInbox.identityRequired')
    : enabledRelayCount === 0
      ? t('nostrContact.relaysRequired')
      : !canUseLocal && !canUseSigner
        ? t('nostrInbox.signerRequired')
        : '';
  const ownerPublicKey = identity?.publicKey.toLowerCase() ?? '';
  const ownerMessages = useMemo(() => messages.filter((message) => message.ownerPublicKey === ownerPublicKey), [messages, ownerPublicKey]);
  const threadDirections = useMemo(() => {
    const next = new Map<string, { incoming: number; outgoing: number }>();
    for (const message of ownerMessages) {
      const current = next.get(message.threadKey) ?? { incoming: 0, outgoing: 0 };
      current[message.direction] += 1;
      next.set(message.threadKey, current);
    }
    return next;
  }, [ownerMessages]);
  const visibleThreads = threads.filter((thread) => {
    if (thread.ownerPublicKey !== ownerPublicKey || thread.archived) return false;
    const directions = threadDirections.get(thread.threadKey);
    if (boxFilter === 'inbox') return Boolean(directions?.incoming);
    if (boxFilter === 'outbox') return Boolean(directions?.outgoing);
    return true;
  });
  const activeThread = visibleThreads.find((thread) => thread.threadKey === activeThreadKey) ?? visibleThreads[0];
  const activeMessages = activeThread ? decrypted.filter((message) => message.threadKey === activeThread.threadKey).sort((left, right) => left.messageCreatedAt.localeCompare(right.messageCreatedAt)) : [];

  const decryptMessages = useCallback(async (): Promise<void> => {
    const next = await Promise.all(
      ownerMessages.map(async (message) => ({
        ...message,
        plaintext: await decryptLocalSecret(message.encryptedPlaintext, passphrase)
      }))
    );
    setDecrypted(next);
  }, [ownerMessages, passphrase]);

  useEffect(() => {
    if (!unlocked || passphrase.length < 10) return;
    void decryptMessages().catch(() => {
      setUnlocked(false);
      setDecrypted([]);
      setError(t('nostrInbox.unlockFailed'));
    });
  }, [decryptMessages, passphrase.length, t, unlocked]);

  const unlock = async (): Promise<void> => {
    setError('');
    if (passphrase.length < 10) {
      setError(t('nostrInbox.passphraseTooShort'));
      return;
    }
    try {
      await decryptMessages();
      setUnlocked(true);
    } catch {
      setUnlocked(false);
      setDecrypted([]);
      setError(t('nostrInbox.unlockFailed'));
    }
  };

  const fetch = async (): Promise<void> => {
    setError('');
    setFetching(true);
    try {
      const result = await onFetch(passphrase);
      setSummary(result);
      setUnlocked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('nostrInbox.fetchFailed'));
    } finally {
      setFetching(false);
    }
  };

  return (
    <section className="nostr-inbox dm-inbox" key={defaultOpen ? 'inbox-open' : 'inbox-closed'}>
      <div className="dm-toolbar">
        <label className="dm-passphrase">
          {t('nostrInbox.passphrase')}
          <input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} placeholder={t('nostrInbox.passphrasePlaceholder')} />
        </label>
        <div className="segmented-control compact" aria-label={t('nostrInbox.boxFilter')}>
          {(['all', 'inbox', 'outbox'] as const).map((filter) => (
            <button className={boxFilter === filter ? 'active' : ''} key={filter} onClick={() => setBoxFilter(filter)} type="button">
              {t(`nostrInbox.${filter}`)}
            </button>
          ))}
        </div>
        <div className="actions small">
          {identity && !canUseLocal && !canUseSigner ? (
            <button className="subtle" onClick={onConnectSigner} type="button">
              <KeyRound size={16} /> {nostrSigner.connected ? t('signer.reconnect') : t('signer.connect')}
            </button>
          ) : null}
          <button className="subtle" disabled={!passphrase} onClick={() => void unlock()} type="button">
            {t('nostrInbox.unlock')}
          </button>
          <button disabled={!identity || enabledRelayCount === 0 || fetching || passphrase.length < 10 || (!canUseLocal && !canUseSigner)} onClick={() => void fetch()} type="button">
            {fetching ? t('nostrInbox.fetching') : t('nostrInbox.fetch')}
          </button>
        </div>
      </div>
      {fetchBlocker ? <p className="warning compact-warning">{fetchBlocker}</p> : null}
      {error ? <p className="warning" role="alert">{error}</p> : null}
      <div className="dm-layout">
        <aside className="dm-thread-list" aria-label={t('nostrInbox.title')}>
          {visibleThreads.map((thread) => {
            const directions = threadDirections.get(thread.threadKey) ?? { incoming: 0, outgoing: 0 };
            return (
              <button className={thread.threadKey === activeThread?.threadKey ? 'thread-row active' : 'thread-row'} key={thread.id} onClick={() => setActiveThreadKey(thread.threadKey)} type="button">
                <strong>{thread.subject || shortPublicKey(thread.counterpartPublicKey)}</strong>
                <span className="muted">{shortPublicKey(thread.counterpartPublicKey)}</span>
                <span className="muted compact-meta">
                  {thread.lastMessageAt}
                  {thread.unreadCount > 0 ? ` · ${t('nostrInbox.unreadCount').replace('{count}', String(thread.unreadCount))}` : ''}
                  {directions.incoming > 0 && directions.outgoing > 0 ? ` · ${t('nostrInbox.all')}` : directions.incoming > 0 ? ` · ${t('nostrInbox.inbox')}` : directions.outgoing > 0 ? ` · ${t('nostrInbox.outbox')}` : ''}
                </span>
              </button>
            );
          })}
          {visibleThreads.length === 0 ? <EmptyState title={t('nostrInbox.emptyTitle')} body={t('nostrInbox.emptyBody')} /> : null}
        </aside>
        <section className="dm-conversation">
          {activeThread ? (
            <>
              <header className="dm-conversation-header">
                <div>
                  <h3>{activeThread.subject || shortPublicKey(activeThread.counterpartPublicKey)}</h3>
                  <p className="key">{activeThread.counterpartPublicKey}</p>
                </div>
                <div className="actions small">
                  <button className="subtle" onClick={() => onThreadChange(activeThread, { read: true })} type="button">
                    {t('nostrInbox.markRead')}
                  </button>
                  <button className="subtle" onClick={() => onThreadChange(activeThread, { archived: true })} type="button">
                    {t('nostrInbox.archive')}
                  </button>
                </div>
              </header>
              {!unlocked ? <ActionHint>{t('nostrInbox.unlockToRead')}</ActionHint> : null}
              {unlocked ? (
                <div className="message-list dm-message-list">
                  {activeMessages.map((message) => (
                    <article className={`message-bubble ${message.direction}`} key={message.id}>
                      <PlainTextBlock className="message-text" text={message.plaintext} />
                      <span className="muted">
                        {message.direction === 'incoming' ? t('nostrInbox.incoming') : t('nostrInbox.outgoing')} · {message.messageCreatedAt}
                      </span>
                    </article>
                  ))}
                  {activeMessages.length === 0 ? <p className="muted">{t('nostrInbox.noDecryptedMessages')}</p> : null}
                </div>
              ) : null}
              <div className="dm-composer">
                <NostrContactPanel
                  key={activeThread.threadKey}
                  target={{
                    recipientPublicKey: activeThread.counterpartPublicKey,
                    label: shortPublicKey(activeThread.counterpartPublicKey),
                    contextType: activeThread.contextType ?? 'manual',
                    contextId: activeThread.contextId,
                    contextTitle: activeThread.subject
                  }}
                  identity={identity}
                  relays={relays}
                  nostrSigner={nostrSigner}
                  privateKeyHex={privateKeyHex}
                  receipts={receipts}
                  defaultOpen
                  onConnectSigner={() => void onConnectSigner()}
                  onSend={(args) => onSend({ ...args, cachePassphrase: unlocked ? passphrase : undefined })}
                />
              </div>
            </>
          ) : null}
        </section>
      </div>
      <DisclosurePanel title={t('nostrInbox.privacySyncDetails')} defaultOpen={defaultOpen}>
        <SafetyNotice>{t('nostrInbox.metadataWarning')}</SafetyNotice>
        <div className="compact-meta-list">
          <p>{t('nostrContact.relaysEnabled').replace('{count}', String(enabledRelayCount))}</p>
          <p>{canUseLocal ? t('nostrInbox.decryptLocal') : canUseSigner ? t('nostrInbox.decryptSigner') : t('nostrInbox.decryptUnavailable')}</p>
          <p>
            {t('nostrInbox.cursors')}: {cursors.filter((cursor) => cursor.ownerPublicKey === identity?.publicKey.toLowerCase()).length}
          </p>
        </div>
        {!canUseLocal && !canUseSigner ? <p className="muted">{t('nostrInbox.decryptFallback')}</p> : null}
        {summary ? (
          <p className="muted">
            {t('nostrInbox.fetchSummary')
              .replace('{fetched}', String(summary.fetched))
              .replace('{imported}', String(summary.imported))
              .replace('{duplicates}', String(summary.duplicates))
              .replace('{failed}', String(summary.failed))
              .replace('{relays}', String(summary.relays))}
          </p>
        ) : null}
      </DisclosurePanel>
    </section>
  );
}

function TradePage({
  listings,
  syncedListings,
  selectedListingRef,
  agreements,
  agreementReceipts,
  mediators,
  syncedMediators,
  disputes,
  identity,
  privateKeyHex,
  nostrSigner,
  syncSettings,
  onAgreementSaved,
  onReceiptSaved,
  onDisputeSaved,
  onSelectedListingConsumed
}: {
  listings: Listing[];
  syncedListings: SyncedPublicRecord<Listing>[];
  selectedListingRef?: ListingSourceRef;
  agreements: Agreement[];
  agreementReceipts: AgreementAcceptanceReceipt[];
  mediators: MediatorProfile[];
  syncedMediators: SyncedPublicRecord<MediatorProfile>[];
  disputes: DisputeCase[];
  identity?: IdentityRecord;
  privateKeyHex: string;
  nostrSigner: NostrSignerState;
  syncSettings: SyncSettings;
  onAgreementSaved: () => void;
  onReceiptSaved: () => void;
  onDisputeSaved: () => void;
  onSelectedListingConsumed: () => void;
}): ReactNode {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TradeTab>(() => (window.location.hash === '#disputes' ? 'dispute' : 'agreement'));
  const [selectedAgreementHash, setSelectedAgreementHash] = useState(agreements[0]?.hash ?? '');
  const [bundlePassphrase, setBundlePassphrase] = useState('');
  const [source, setSource] = useState<DataSourceFilter>(syncSettings.defaultBrowseSource);
  const [trust, setTrust] = useState<TrustFilter>('all');
  const [hidden, setHidden] = useState<HiddenFilter>('visible');
  const conflictGroups = useMemo(() => findSyncedConflictGroups(syncedMediators), [syncedMediators]);
  const [agreementForm, setAgreementForm] = useState({
    buyer: '',
    seller: '',
    buyerPublicKey: identity?.publicKey ?? nostrSigner.publicKey ?? '',
    sellerPublicKey: '',
    buyerLabel: identity?.displayName ?? '',
    sellerLabel: '',
    listingId: '',
    exchangeDescription: '',
    priceAndPayment: '',
    fulfillmentTerms: '',
    deadline: '',
    refundTerms: '',
    mediator: '',
    evidenceExpectations: '',
    buyerAccepted: false,
    sellerAccepted: false,
    hashVersion: 2 as const
  });
  const [disputeForm, setDisputeForm] = useState({
    agreementHash: agreements[0]?.hash ?? '',
    claimant: '',
    respondent: '',
    mediator: '',
    claimSummary: '',
    requestedResolution: '',
    response: '',
    evidenceTitle: '',
    evidenceDescription: '',
    evidenceHash: '',
    evidenceSource: '',
    outcomeSummary: '',
    publishOutcomeAttestation: false
  });

  useEffect(() => {
    setAgreementForm((current) => ({
      ...current,
      buyer: current.buyer || identity?.displayName || '',
      buyerPublicKey: current.buyerPublicKey || identity?.publicKey || nostrSigner.publicKey || '',
      buyerLabel: current.buyerLabel || identity?.displayName || ''
    }));
  }, [identity?.displayName, identity?.publicKey, nostrSigner.publicKey]);

  useEffect(() => {
    if (!selectedAgreementHash && agreements[0]) {
      setSelectedAgreementHash(agreements[0].hash);
      setDisputeForm((current) => ({ ...current, agreementHash: agreements[0].hash }));
    }
  }, [agreements, selectedAgreementHash]);

  const preview = useMemo(() => {
    const at = nowIso();
    const agreement = { ...agreementForm, id: 'preview', hash: '', createdAt: at, updatedAt: at };
    return generateAgreementHash(agreement);
  }, [agreementForm]);

  const publicMediators = useMemo(() => {
    const localRows =
      source === 'synced' || hidden === 'hidden'
        ? []
        : mediators.map((mediator) => ({ mediator, source: 'local' as const, trusted: true, record: undefined }));
    const syncedRows =
      source === 'local'
        ? []
        : applyHiddenFilter(syncedMediators, hidden)
            .filter((record) => (trust === 'all' ? true : trust === 'trusted' ? record.trusted : !record.trusted))
            .map((record) => ({ mediator: record.payload, source: 'synced' as const, trusted: record.trusted, record }));
    return [...localRows, ...syncedRows];
  }, [hidden, mediators, source, syncedMediators, trust]);

  const selectedAgreement = agreements.find((agreement) => agreement.hash === selectedAgreementHash);
  const guideAgreement = selectedAgreement ?? agreements[0];
  const guideSummary = guideAgreement ? receiptRoleSummary(guideAgreement, agreementReceipts) : undefined;
  const [agreementMessage, setAgreementMessage] = useState('');
  const listingSourceRefs: ListingSourceRef[] = useMemo(
    () => [
      ...listings.map((listing) => ({ source: 'local' as const, id: listing.id, listing })),
      ...syncedListings
        .filter((record) => !record.hidden)
        .map((record) => ({
          source: 'synced' as const,
          id: record.payload.id,
          recordId: record.id,
          listing: record.payload
        }))
    ],
    [listings, syncedListings]
  );

  const agreementText = (agreement: Agreement | typeof agreementForm, hash: string): string =>
    `${t('agreement.title')} ${hash}\n${t('agreement.hashVersion')}: 2\n${t('agreement.buyer')}: ${agreement.buyer}\n${t('agreement.buyerLabel')}: ${
      agreement.buyerLabel || agreement.buyer || t('common.none')
    }\n${t('agreement.buyerPublicKey')}: ${agreement.buyerPublicKey || t('common.none')}\n${t('agreement.seller')}: ${agreement.seller}\n${t(
      'agreement.sellerLabel'
    )}: ${agreement.sellerLabel || agreement.seller || t('common.none')}\n${t('agreement.sellerPublicKey')}: ${
      agreement.sellerPublicKey || t('common.none')
    }\n${t('listing.title')}: ${agreement.listingId || t('common.none')}\n${t('agreement.exchange')}: ${agreement.exchangeDescription}\n${t(
      'agreement.price'
    )}: ${agreement.priceAndPayment}\n${t('agreement.fulfillment')}: ${agreement.fulfillmentTerms}\n${t('agreement.deadline')}: ${
      agreement.deadline
    }\n${t('agreement.refund')}: ${agreement.refundTerms}\n${t('agreement.mediator')}: ${
      agreement.mediator || t('common.none')
    }\n${t('agreement.evidence')}: ${agreement.evidenceExpectations}`;

  const signerPublicKey = activeSigningPublicKey(identity, nostrSigner, privateKeyHex);
  const signerModeLabel = nostrSigner.connected
    ? t('agreement.signerModeExtension')
    : privateKeyHex
      ? t('agreement.signerModeLocal')
      : t('agreement.signerModeNone');
  const canSignAgreementRoleReason = (agreement: Agreement, role: 'buyer' | 'seller'): string => {
    const expected = role === 'buyer' ? agreement.buyerPublicKey : agreement.sellerPublicKey;
    if (!expected) return role === 'buyer' ? t('agreement.disabledMissingBuyerKey') : t('agreement.disabledMissingSellerKey');
    if (!signerPublicKey) return t('agreement.disabledNoSigner');
    if (expected.toLowerCase() !== signerPublicKey.toLowerCase()) return t('agreement.disabledSignerMismatch');
    if (!nostrSigner.connected && !privateKeyHex) return t('agreement.disabledLockedKey');
    return '';
  };

  const saveReceipt = async (receipt: AgreementAcceptanceReceipt, agreement: Agreement): Promise<void> => {
    if (isDuplicateAgreementReceipt(receipt, agreementReceipts)) {
      setAgreementMessage(t('agreement.receiptDuplicate'));
      return;
    }
    if (!verifyAgreementAcceptanceReceipt(receipt, agreement)) {
      setAgreementMessage(t('agreement.receiptInvalid'));
      return;
    }
    await db.agreementReceipts.put(receipt);
    setAgreementMessage(t('agreement.receiptImported'));
    onReceiptSaved();
  };

  const signAgreementRole = async (agreement: Agreement, role: 'buyer' | 'seller'): Promise<void> => {
    try {
      const draft = createAgreementAcceptanceDraft(agreement, role);
      const activeKey = activeSigningPublicKey(identity, nostrSigner, privateKeyHex, draft.signerPublicKey);
      const receipt =
        nostrSigner.connected && nostrSigner.publicKey === activeKey
          ? await (async () => {
              const event = await signWithNostrSigner(unsignedAgreementAcceptanceEvent(draft), draft.signerPublicKey);
              return receiptFromSignedAgreementAcceptanceEvent(draft, event as AgreementAcceptanceSignedEvent);
            })()
          : createAgreementAcceptanceReceipt(agreement, role, privateKeyHex);
      await saveReceipt(receipt, agreement);
    } catch (error) {
      setAgreementMessage(error instanceof Error ? error.message : t('agreement.receiptInvalid'));
    }
  };

  const exportAgreementPacket = (agreement: Agreement): void => {
    downloadJson(`agoramesh-agreement-${generateAgreementHash(agreement)}.json`, agreementTermsPacket(agreement));
  };

  const copyAgreementPacket = (agreement: Agreement): void => {
    void navigator.clipboard.writeText(JSON.stringify(agreementTermsPacket(agreement), null, 2));
  };

  const importAgreementPacket = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const packet = parseAgreementTermsPacket(JSON.parse(await file.text()));
      await db.agreements.put(packet.agreement);
      setSelectedAgreementHash(packet.agreementHash);
      setAgreementMessage(t('agreement.packetImported'));
      onAgreementSaved();
    } catch (error) {
      setAgreementMessage(error instanceof Error ? error.message : t('common.error'));
    } finally {
      event.target.value = '';
    }
  };

  const exportReceipt = (receipt: AgreementAcceptanceReceipt): void => {
    downloadJson(`agoramesh-agreement-receipt-${receipt.role}-${receipt.agreementHash}.json`, receipt);
  };

  const copyReceipt = (receipt: AgreementAcceptanceReceipt): void => {
    void navigator.clipboard.writeText(JSON.stringify(receipt, null, 2));
  };

  const receiptImportMessage = (error: unknown): string => {
    if (!(error instanceof Error)) return t('agreement.receiptInvalid');
    if (error instanceof SyntaxError) return t('agreement.receiptMalformed');
    if (error.message.includes('already imported')) return t('agreement.receiptDuplicate');
    if (error.message.includes('matching agreement')) return t('agreement.receiptNoAgreement');
    if (error.message.includes('could not be verified') || error.message.includes('signature') || error.message.includes('signer')) return t('agreement.receiptInvalid');
    return t('agreement.receiptMalformed');
  };

  const importReceipt = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const { agreement, receipt } = parseAgreementReceiptImport(JSON.parse(await file.text()), agreements, agreementReceipts);
      await saveReceipt(receipt, agreement);
    } catch (error) {
      setAgreementMessage(receiptImportMessage(error));
    } finally {
      event.target.value = '';
    }
  };

  const receiptStatusLabel = (status: ReturnType<typeof agreementReceiptStatus>): string =>
    status === 'mutually-signed'
      ? t('agreement.statusMutuallySigned')
      : status === 'partially-signed'
        ? t('agreement.statusPartiallySigned')
        : t('agreement.statusDraft');

  const selectListing = (listingId: string): void => {
    const listingRef = listingSourceRefs.find((entry) => listingSourceValue(entry) === listingId);
    const listing = listingRef?.listing;
    setAgreementForm({
      ...agreementForm,
      listingId,
      exchangeDescription: agreementForm.exchangeDescription || listing?.title || '',
      seller: agreementForm.seller || listing?.authorPublicKey || '',
      sellerPublicKey: agreementForm.sellerPublicKey || listing?.authorPublicKey || '',
      sellerLabel: agreementForm.sellerLabel || listing?.authorPublicKey?.slice(0, 16) || '',
      buyerPublicKey: agreementForm.buyerPublicKey || identity?.publicKey || nostrSigner.publicKey || '',
      buyerLabel: agreementForm.buyerLabel || identity?.displayName || '',
      priceAndPayment: agreementForm.priceAndPayment || (listing ? `${formatListingPrice(listing)} · ${listing.paymentPreferences.join(', ')}` : ''),
      mediator: agreementForm.mediator || listing?.mediatorPreference || ''
    });
  };

  useEffect(() => {
    if (!selectedListingRef) return;
    const listing = selectedListingRef.listing;
    setAgreementForm((current) => ({
      ...current,
      listingId: listingSourceValue(selectedListingRef),
      exchangeDescription: listing.title,
      seller: listing.authorPublicKey,
      sellerPublicKey: listing.authorPublicKey,
      sellerLabel: listing.authorPublicKey.slice(0, 16),
      buyerPublicKey: current.buyerPublicKey || identity?.publicKey || nostrSigner.publicKey || '',
      buyerLabel: current.buyerLabel || identity?.displayName || '',
      priceAndPayment: `${formatListingPrice(listing)} · ${listing.paymentPreferences.join(', ')}`,
      mediator: listing.mediatorPreference || current.mediator
    }));
    setActiveTab('agreement');
    onSelectedListingConsumed();
  }, [selectedListingRef, onSelectedListingConsumed]);

  const saveAgreement = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const at = nowIso();
    const draft = {
      ...agreementForm,
      buyerLabel: agreementForm.buyerLabel || agreementForm.buyer,
      sellerLabel: agreementForm.sellerLabel || agreementForm.seller,
      hashVersion: 2 as const,
      buyerAccepted: false,
      sellerAccepted: false,
      id: newId('agreement'),
      createdAt: at,
      updatedAt: at
    };
    const agreement: Agreement = agreementSchema.parse({ ...draft, hash: generateAgreementHash({ ...draft, hash: '' }) });
    await db.agreements.put(agreement);
    setSelectedAgreementHash(agreement.hash);
    setDisputeForm((current) => ({
      ...current,
      agreementHash: agreement.hash,
      mediator: agreement.mediator ?? ''
    }));
    onAgreementSaved();
  };

  const saveDispute = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!disputeForm.agreementHash) return;
    const at = nowIso();
    const dispute: DisputeCase = disputeCaseSchema.parse({
      id: newId('dispute'),
      state: 'opened',
      agreementHash: disputeForm.agreementHash,
      claimant: sanitizePlainText(disputeForm.claimant),
      respondent: sanitizePlainText(disputeForm.respondent),
      mediator: sanitizePlainText(disputeForm.mediator),
      claimSummary: sanitizePlainText(disputeForm.claimSummary),
      requestedResolution: sanitizePlainText(disputeForm.requestedResolution),
      response: sanitizePlainText(disputeForm.response),
      timeline: [{ id: newId('timeline'), at, note: t('dispute.caseOpened') }],
      evidence: disputeForm.evidenceTitle
        ? [
            {
              id: newId('evidence'),
              title: sanitizePlainText(disputeForm.evidenceTitle),
              description: sanitizePlainText(disputeForm.evidenceDescription),
              fileHash: sanitizePlainText(disputeForm.evidenceHash),
              date: at,
              source: sanitizePlainText(disputeForm.evidenceSource)
            }
          ]
        : [],
      outcomeSummary: sanitizePlainText(disputeForm.outcomeSummary),
      publishOutcomeAttestation: disputeForm.publishOutcomeAttestation,
      createdAt: at,
      updatedAt: at
    });
    await db.disputes.put(dispute);
    setActiveTab('outcome');
    onDisputeSaved();
  };

  const exportEncrypted = async (dispute: DisputeCase): Promise<void> => {
    const envelope = await encryptDisputeBundle(dispute, bundlePassphrase);
    downloadJson(`agoramesh-dispute-${dispute.id}.encrypted.json`, envelope);
  };

  const importEncrypted = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;
    const parsed: unknown = JSON.parse(await file.text());
    const dispute = await decryptDisputeBundle(parsed, bundlePassphrase);
    await db.disputes.put(dispute);
    onDisputeSaved();
  };

  return (
    <section className="page">
      <div className="trade-intro">
        <SectionHeader icon={<Handshake />} title={t('trade.title')} body={t('trade.body')} />
        <ActionHint>{t('trade.localNotice')}</ActionHint>
        <DisclosurePanel title={t('trade.localDetailsTitle')}>
          <InlineHelp>{t('trade.privateBoundary')}</InlineHelp>
        </DisclosurePanel>
      </div>
      <CompactTabs
        active={activeTab}
        label={t('trade.title')}
        onChange={setActiveTab}
        tabs={[
          ['agreement', t('trade.tab.agreement')],
          ['mediator', t('trade.tab.mediator')],
          ['dispute', t('trade.tab.dispute')],
          ['outcome', t('trade.tab.outcome')]
        ]}
      />
      {activeTab === 'agreement' ? (
        <section className="split">
          <form className="panel" onSubmit={(event) => void saveAgreement(event)}>
            <SectionHeader icon={<Handshake />} title={t('agreement.title')} body={t('help.agreement')} />
            <label>
              {t('listing.title')}
              <select required value={agreementForm.listingId} onChange={(event) => selectListing(event.target.value)}>
                <option value="">{t('trade.noListing')}</option>
                {listingSourceRefs.map((listingRef) => (
                  <option key={listingRefKey(listingRef)} value={listingSourceValue(listingRef)}>
                    {listingRef.listing.title} · {listingRef.source === 'synced' ? t('marketplace.sourceSynced') : t('marketplace.sourceLocal')}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('agreement.buyerLabel')}
              <input
                required
                placeholder={t('placeholder.party')}
                value={agreementForm.buyer}
                onChange={(event) => setAgreementForm({ ...agreementForm, buyer: event.target.value, buyerLabel: event.target.value })}
              />
            </label>
            <label>
              {t('agreement.buyerPublicKey')}
              <input
                required
                pattern="[0-9a-fA-F]{64}"
                placeholder={t('placeholder.publicKey')}
                title={t('placeholder.publicKey')}
                value={agreementForm.buyerPublicKey}
                onChange={(event) => setAgreementForm({ ...agreementForm, buyerPublicKey: event.target.value.trim().toLowerCase() })}
              />
              <FieldHint>{t('agreement.publicKeyHint')}</FieldHint>
            </label>
            <label>
              {t('agreement.sellerLabel')}
              <input
                required
                placeholder={t('placeholder.party')}
                value={agreementForm.seller}
                onChange={(event) => setAgreementForm({ ...agreementForm, seller: event.target.value, sellerLabel: event.target.value })}
              />
            </label>
            <label>
              {t('agreement.sellerPublicKey')}
              <input
                required
                pattern="[0-9a-fA-F]{64}"
                placeholder={t('placeholder.publicKey')}
                title={t('placeholder.publicKey')}
                value={agreementForm.sellerPublicKey}
                onChange={(event) => setAgreementForm({ ...agreementForm, sellerPublicKey: event.target.value.trim().toLowerCase() })}
              />
            </label>
            <label>
              {t('agreement.exchange')}
              <textarea
                required
                placeholder={t('placeholder.agreementExchange')}
                value={agreementForm.exchangeDescription}
                onChange={(event) => setAgreementForm({ ...agreementForm, exchangeDescription: event.target.value })}
              />
            </label>
            <label>
              {t('agreement.price')}
              <input
                required
                placeholder={t('placeholder.agreementPrice')}
                value={agreementForm.priceAndPayment}
                onChange={(event) => setAgreementForm({ ...agreementForm, priceAndPayment: event.target.value })}
              />
            </label>
            <label>
              {t('agreement.fulfillment')}
              <textarea
                required
                placeholder={t('placeholder.agreementFulfillment')}
                value={agreementForm.fulfillmentTerms}
                onChange={(event) => setAgreementForm({ ...agreementForm, fulfillmentTerms: event.target.value })}
              />
              <FieldHint>{t('hint.agreementLocal')}</FieldHint>
            </label>
            <label>
              {t('agreement.deadline')}
              <input
                required
                type="date"
                value={agreementForm.deadline}
                onChange={(event) => setAgreementForm({ ...agreementForm, deadline: event.target.value })}
              />
            </label>
            <label>
              {t('agreement.refund')}
              <textarea
                required
                placeholder={t('placeholder.agreementRefund')}
                value={agreementForm.refundTerms}
                onChange={(event) => setAgreementForm({ ...agreementForm, refundTerms: event.target.value })}
              />
            </label>
            <label>
              {t('agreement.mediator')}
              <input value={agreementForm.mediator} onChange={(event) => setAgreementForm({ ...agreementForm, mediator: event.target.value })} />
            </label>
            <label>
              {t('agreement.evidence')}
              <textarea
                required
                placeholder={t('placeholder.agreementEvidence')}
                value={agreementForm.evidenceExpectations}
                onChange={(event) => setAgreementForm({ ...agreementForm, evidenceExpectations: event.target.value })}
              />
            </label>
            <button disabled={listingSourceRefs.length === 0} type="submit">
              {t('common.save')}
            </button>
            {listingSourceRefs.length === 0 ? <ActionHint>{t('empty.listingsBody')}</ActionHint> : null}
          </form>
          <div className="panel">
            <section className="inline-card">
              <h2>{t('agreement.exchangeTitle')}</h2>
              <InlineHelp>{t('agreement.receiptsBody')}</InlineHelp>
              <StatusChipRow
                items={[
                  [t('agreement.signerMode'), signerModeLabel],
                  [t('agreement.status'), guideAgreement && guideSummary ? receiptStatusLabel(guideSummary.status) : t('agreement.statusDraft')]
                ]}
              />
              <ol className="sync-step-list">
                <li className={guideAgreement ? 'sync-step done' : 'sync-step'}>
                  <strong>{t('agreement.stepPrepare')}</strong>
                  <span>{guideAgreement ? t('agreement.stepReady') : t('agreement.stepPrepareBody')}</span>
                </li>
                <li className={guideAgreement ? 'sync-step done' : 'sync-step'}>
                  <strong>{t('agreement.stepSharePacket')}</strong>
                  <span>{t('agreement.stepSharePacketBody')}</span>
                </li>
                <li className={guideSummary?.status === 'partially-signed' || guideSummary?.status === 'mutually-signed' ? 'sync-step done' : 'sync-step'}>
                  <strong>{t('agreement.stepSign')}</strong>
                  <span>
                    {guideSummary && guideSummary.missingRoles.length > 0
                      ? `${t('agreement.missingReceipts')}: ${guideSummary.missingRoles
                          .map((role) => (role === 'buyer' ? t('role.buyer') : t('role.seller')))
                          .join(', ')}`
                      : t('agreement.stepSignBody')}
                  </span>
                </li>
                <li className={guideSummary?.status === 'mutually-signed' ? 'sync-step done' : 'sync-step'}>
                  <strong>{t('agreement.stepMutual')}</strong>
                  <span>{guideSummary?.status === 'mutually-signed' ? t('agreement.stepMutualDone') : t('agreement.stepMutualBody')}</span>
                </li>
              </ol>
              {agreementMessage ? <StatusMessage className="notice inline">{agreementMessage}</StatusMessage> : null}
              <div className="actions small">
                <label className="file-button">
                  {t('agreement.importPacket')}
                  <input accept="application/json" onChange={(event) => void importAgreementPacket(event)} type="file" />
                </label>
                <label className="file-button">
                  {t('agreement.importReceipt')}
                  <input accept="application/json" onChange={(event) => void importReceipt(event)} type="file" />
                </label>
              </div>
            </section>
            <DisclosurePanel title={t('agreement.preview')}>
              <p className="key">{preview}</p>
              <pre>{agreementText(agreementForm, preview)}</pre>
              <button onClick={() => void navigator.clipboard.writeText(agreementText(agreementForm, preview))} type="button">
                {t('common.copy')}
              </button>
            </DisclosurePanel>
            <div className="card-grid single">
              {agreements.map((agreement) => (
                <article className="card compact" key={agreement.id}>
                  {(() => {
                    const summary = receiptRoleSummary(agreement, agreementReceipts);
                    const validReceipts = summary.validReceipts;
                    const buyerSignReason = canSignAgreementRoleReason(agreement, 'buyer');
                    const sellerSignReason = canSignAgreementRoleReason(agreement, 'seller');
                    const termsHash = generateAgreementHash(agreement);
                    return (
                      <>
                        <h2>{agreement.exchangeDescription}</h2>
                        <span className={summary.status === 'mutually-signed' ? 'ok mini' : 'pill'}>{receiptStatusLabel(summary.status)}</span>
                        <p className="key">{termsHash}</p>
                        <p className="muted">{agreement.mediator || t('common.none')}</p>
                        <SecondaryMeta
                          items={[
                            [t('agreement.buyerPublicKey'), agreement.buyerPublicKey || t('common.none')],
                            [t('agreement.sellerPublicKey'), agreement.sellerPublicKey || t('common.none')]
                          ]}
                        />
                        <p className="muted">{t('agreement.keysUnverified')}</p>
                        {summary.missingRoles.length > 0 ? (
                          <p className="muted">
                            {t('agreement.missingReceipts')}: {summary.missingRoles.map((role) => (role === 'buyer' ? t('role.buyer') : t('role.seller'))).join(', ')}
                          </p>
                        ) : null}
                        <div className="actions small">
                          <button onClick={() => void navigator.clipboard.writeText(agreementText(agreement, termsHash))} type="button">
                            {t('agreement.copyText')}
                          </button>
                          <button onClick={() => copyAgreementPacket(agreement)} type="button">
                            {t('agreement.copyPacket')}
                          </button>
                          <button onClick={() => exportAgreementPacket(agreement)} type="button">
                            {t('agreement.downloadPacket')}
                          </button>
                          <button disabled={Boolean(buyerSignReason)} title={buyerSignReason || undefined} onClick={() => void signAgreementRole(agreement, 'buyer')} type="button">
                            {t('agreement.signBuyer')}
                          </button>
                          <button disabled={Boolean(sellerSignReason)} title={sellerSignReason || undefined} onClick={() => void signAgreementRole(agreement, 'seller')} type="button">
                            {t('agreement.signSeller')}
                          </button>
                          <button
                            onClick={() => {
                              setSelectedAgreementHash(agreement.hash);
                              setDisputeForm({
                                ...disputeForm,
                                agreementHash: agreement.hash,
                                mediator: agreement.mediator ?? ''
                              });
                              setActiveTab('dispute');
                            }}
                            type="button"
                          >
                            {t('trade.openDispute')}
                          </button>
                        </div>
                        {validReceipts.length > 0 ? (
                          <div className="inline-card">
                            {validReceipts.map((receipt) => (
                              <article className="inline-card" key={receipt.id}>
                                <strong>
                                  {receipt.role === 'buyer' ? t('role.buyer') : t('role.seller')} · {receipt.acceptedAt}
                                </strong>
                                <p className="key">{receipt.signerPublicKey}</p>
                                <div className="actions small">
                                  <button onClick={() => copyReceipt(receipt)} type="button">
                                    {t('agreement.copyReceipt')}
                                  </button>
                                  <button onClick={() => exportReceipt(receipt)} type="button">
                                    {t('agreement.downloadReceipt')}
                                  </button>
                                </div>
                              </article>
                            ))}
                          </div>
                        ) : null}
                      </>
                    );
                  })()}
                </article>
              ))}
              {agreements.length === 0 ? <EmptyState title={t('empty.tradeAgreementTitle')} body={t('empty.tradeAgreementBody')} /> : null}
            </div>
          </div>
        </section>
      ) : null}
      {activeTab === 'mediator' ? (
        <section className="panel">
          <SectionHeader icon={<Scale />} title={t('trade.tab.mediator')} body={t('trade.mediatorBody')} />
          <div className="filters compact-filters">
            <select aria-label={t('sync.source')} value={source} onChange={(event) => setSource(event.target.value as DataSourceFilter)}>
              <option value="combined">{t('sync.combined')}</option>
              <option value="local">{t('sync.localOnly')}</option>
              <option value="synced">{t('sync.syncedOnly')}</option>
            </select>
            <select aria-label={t('sync.trust')} value={trust} onChange={(event) => setTrust(event.target.value as TrustFilter)}>
              <option value="all">{t('common.all')}</option>
              <option value="trusted">{t('sync.trusted')}</option>
              <option value="untrusted">{t('sync.untrusted')}</option>
            </select>
            <select aria-label={t('sync.hiddenFilter')} value={hidden} onChange={(event) => setHidden(event.target.value as HiddenFilter)}>
              <option value="visible">{t('sync.visibleOnly')}</option>
              <option value="hidden">{t('sync.hiddenOnly')}</option>
              <option value="all">{t('sync.visibleAndHidden')}</option>
            </select>
          </div>
          <div className="card-grid">
            {publicMediators.map(({ mediator, source: rowSource, trusted, record }) => (
              <article className="card" key={record?.id ?? `${rowSource}-${mediator.id}`}>
                {syncSettings.showDataSource ? (
                  <span className="pill">
                    {rowSource === 'synced'
                      ? `${t('sync.syncedData')} · ${trusted ? t('sync.trusted') : t('sync.untrusted')}`
                      : t('sync.localData')}
                  </span>
                ) : null}
                {record ? (
                  <SyncedQualityBadges
                    conflict={isRecordConflicted(record, conflictGroups)}
                    hidden={record.hidden}
                    preferred={isPreferredConflictRecord(record, conflictGroups)}
                  />
                ) : null}
                <h2>{mediator.displayName}</h2>
                <p>{mediator.mediationStyle}</p>
                <SecondaryMeta
                  items={[
                    [t('common.region'), mediator.region || '-'],
                    [t('profile.languages'), mediator.languages.join(', ')]
                  ]}
                />
                <button
                  onClick={() => {
                    setAgreementForm({ ...agreementForm, mediator: mediator.publicKey || mediator.displayName });
                    setActiveTab('agreement');
                  }}
                  type="button"
                >
                  {t('trade.useMediator')}
                </button>
              </article>
            ))}
            {publicMediators.length === 0 ? <EmptyState title={t('empty.mediatorsTitle')} body={t('empty.mediatorsBody')} /> : null}
          </div>
        </section>
      ) : null}
      {activeTab === 'dispute' ? (
        <section className="split">
          {agreements.length === 0 ? (
            <div className="panel">
              <EmptyState title={t('empty.tradeAgreementTitle')} body={t('empty.tradeAgreementBody')} />
              <button onClick={() => setActiveTab('agreement')} type="button">
                {t('trade.createAgreement')}
              </button>
            </div>
          ) : (
            <form className="panel" onSubmit={(event) => void saveDispute(event)}>
              <SectionHeader icon={<Scale />} title={t('dispute.create')} body={t('dispute.privacy')} />
              <SafetyNotice>{t('safety.disputePrivate')}</SafetyNotice>
              <label>
                {t('trade.selectAgreement')}
                <select
                  required
                  value={disputeForm.agreementHash || selectedAgreementHash}
                  onChange={(event) => {
                    setSelectedAgreementHash(event.target.value);
                    const agreement = agreements.find((entry) => entry.hash === event.target.value);
                    setDisputeForm({ ...disputeForm, agreementHash: event.target.value, mediator: agreement?.mediator ?? disputeForm.mediator });
                  }}
                >
                  {agreements.map((agreement) => (
                    <option key={agreement.id} value={agreement.hash}>
                      {agreementReceiptStatus(agreement, agreementReceipts) === 'mutually-signed' ? `${t('agreement.statusMutuallySigned')} · ` : ''}
                      {agreement.exchangeDescription.slice(0, 50)} · {agreement.hash.slice(0, 12)}
                    </option>
                  ))}
                </select>
              </label>
              {selectedAgreement && agreementReceiptStatus(selectedAgreement, agreementReceipts) !== 'mutually-signed' ? (
                <ActionHint>{t('agreement.disputeUnsignedWarning')}</ActionHint>
              ) : null}
              <label>
                {t('dispute.claimant')}
                <input
                  required
                  placeholder={t('placeholder.party')}
                  value={disputeForm.claimant}
                  onChange={(event) => setDisputeForm({ ...disputeForm, claimant: event.target.value })}
                />
              </label>
              <label>
                {t('dispute.respondent')}
                <input
                  required
                  placeholder={t('placeholder.party')}
                  value={disputeForm.respondent}
                  onChange={(event) => setDisputeForm({ ...disputeForm, respondent: event.target.value })}
                />
              </label>
              <label>
                {t('agreement.mediator')}
                <input value={disputeForm.mediator} onChange={(event) => setDisputeForm({ ...disputeForm, mediator: event.target.value })} />
              </label>
              <label>
                {t('dispute.claim')}
                <textarea
                  required
                  placeholder={t('placeholder.disputeClaim')}
                  value={disputeForm.claimSummary}
                  onChange={(event) => setDisputeForm({ ...disputeForm, claimSummary: event.target.value })}
                />
                <FieldHint>{t('hint.disputeLocal')}</FieldHint>
              </label>
              <label>
                {t('dispute.resolution')}
                <textarea
                  required
                  placeholder={t('placeholder.disputeResolution')}
                  value={disputeForm.requestedResolution}
                  onChange={(event) => setDisputeForm({ ...disputeForm, requestedResolution: event.target.value })}
                />
              </label>
              <label>
                {t('dispute.response')}
                <textarea
                  placeholder={t('placeholder.disputeResponse')}
                  value={disputeForm.response}
                  onChange={(event) => setDisputeForm({ ...disputeForm, response: event.target.value })}
                />
              </label>
              <fieldset>
                <legend>{t('dispute.evidence')}</legend>
                <input
                  aria-label={t('dispute.evidenceTitle')}
                  placeholder={t('dispute.evidenceTitle')}
                  value={disputeForm.evidenceTitle}
                  onChange={(event) => setDisputeForm({ ...disputeForm, evidenceTitle: event.target.value })}
                />
                <input
                  aria-label={t('dispute.evidenceDescription')}
                  placeholder={t('dispute.evidenceDescription')}
                  value={disputeForm.evidenceDescription}
                  onChange={(event) => setDisputeForm({ ...disputeForm, evidenceDescription: event.target.value })}
                />
                <input
                  aria-label={t('dispute.evidenceHash')}
                  placeholder={t('dispute.evidenceHash')}
                  value={disputeForm.evidenceHash}
                  onChange={(event) => setDisputeForm({ ...disputeForm, evidenceHash: event.target.value })}
                />
                <input
                  aria-label={t('dispute.evidenceSource')}
                  placeholder={t('dispute.evidenceSource')}
                  value={disputeForm.evidenceSource}
                  onChange={(event) => setDisputeForm({ ...disputeForm, evidenceSource: event.target.value })}
                />
              </fieldset>
              <label>
                {t('dispute.outcome')}
                <textarea
                  placeholder={t('placeholder.disputeOutcome')}
                  value={disputeForm.outcomeSummary}
                  onChange={(event) => setDisputeForm({ ...disputeForm, outcomeSummary: event.target.value })}
                />
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={disputeForm.publishOutcomeAttestation}
                  onChange={(event) => setDisputeForm({ ...disputeForm, publishOutcomeAttestation: event.target.checked })}
                />
                {t('dispute.publishOutcome')}
              </label>
              <button type="submit">{t('common.save')}</button>
            </form>
          )}
          <div className="panel">
            <SectionHeader icon={<Handshake />} title={t('agreement.title')} body={t('help.agreement')} />
            {selectedAgreement ? (
              <>
                <h2>{selectedAgreement.exchangeDescription}</h2>
                <p className="key">{selectedAgreement.hash}</p>
                <DisclosurePanel title={t('agreement.preview')}>
                  <pre>{agreementText(selectedAgreement, selectedAgreement.hash)}</pre>
                </DisclosurePanel>
              </>
            ) : (
              <EmptyState title={t('empty.tradeAgreementTitle')} body={t('empty.tradeAgreementBody')} />
            )}
          </div>
        </section>
      ) : null}
      {activeTab === 'outcome' ? (
        <section className="panel">
          <SectionHeader icon={<Scale />} title={t('trade.tab.outcome')} body={t('trade.outcomeBody')} />
          <SafetyNotice>{t('safety.plainDisputeExport')}</SafetyNotice>
          <label>
            {t('dispute.bundlePassphrase')}
            <input
              minLength={10}
              placeholder={t('placeholder.passphrase')}
              type="password"
              value={bundlePassphrase}
              onChange={(event) => setBundlePassphrase(event.target.value)}
            />
            <FieldHint>{t('hint.bundlePassphrase')}</FieldHint>
          </label>
          <label className="file-button" title={t('a11y.fileInputHelp')}>
            <Upload size={16} /> {t('dispute.importEncrypted')}
            <input accept="application/json" aria-describedby="dispute-bundle-import-help" type="file" onChange={(event) => void importEncrypted(event)} />
          </label>
          <p className="sr-only" id="dispute-bundle-import-help">
            {t('a11y.fileInputHelp')}
          </p>
          <div className="card-grid single">
            {disputes.map((dispute) => (
              <article className="card compact" key={dispute.id}>
                <span className="pill">{dispute.state}</span>
                <h2>{dispute.claimSummary}</h2>
                <p>{dispute.requestedResolution}</p>
                <button
                  onClick={() => {
                    if (window.confirm(t('dispute.exportPlainConfirm'))) downloadJson(`agoramesh-dispute-${dispute.id}.json`, dispute);
                  }}
                  type="button"
                >
                  <Download size={16} /> {t('dispute.exportPlain')}
                </button>
                <button
                  disabled={bundlePassphrase.length < 10}
                  onClick={() => void exportEncrypted(dispute)}
                  title={bundlePassphrase.length < 10 ? t('a11y.passphraseMin') : undefined}
                  type="button"
                >
                  <FileLock2 size={16} /> {t('dispute.exportEncrypted')}
                </button>
              </article>
            ))}
            {disputes.length === 0 ? <EmptyState title={t('empty.disputesTitle')} body={t('empty.disputesBody')} /> : null}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function ReputationPage({
  identity,
  privateKeyHex,
  nostrSigner,
  agreements,
  agreementReceipts,
  attestations,
  syncedAttestations,
  operatorSupportReceipts,
  allowlist,
  syncSettings,
  draftRequest,
  onDraftRequestConsumed,
  onToggleHidden,
  onSaved,
  onPublish
}: {
  identity?: IdentityRecord;
  privateKeyHex: string;
  nostrSigner: NostrSignerState;
  agreements: Agreement[];
  agreementReceipts: AgreementAcceptanceReceipt[];
  attestations: ReputationAttestation[];
  syncedAttestations: SyncedPublicRecord<ReputationAttestation>[];
  operatorSupportReceipts: OperatorSupportReceipt[];
  allowlist: CommunityAllowlistEntry[];
  syncSettings: SyncSettings;
  draftRequest?: ReputationDraftRequest;
  onDraftRequestConsumed: () => void;
  onToggleHidden: (record: SyncedPublicRecord<ReputationAttestation>, hidden: boolean) => void;
  onSaved: () => void;
  onPublish: (attestation: ReputationAttestation) => void;
}): ReactNode {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<ReputationTab>('create');
  const [filter, setFilter] = useState<ReputationFilterState & { support: SupportFilter }>({
    query: '',
    role: 'all',
    tag: 'all',
    minScore: 'all',
    source: syncSettings.defaultBrowseSource,
    trust: 'all',
    support: 'all' as SupportFilter,
    hidden: 'visible',
    verification: 'all'
  });
  const [form, setForm] = useState({
    subjectPublicKey: '',
    agreementHash: '',
    role: 'seller' as 'buyer' | 'seller' | 'mediator',
    score: 5,
    listingId: '',
    listingTitle: '',
    listingCoordinate: '',
    tags: ['fulfilled-agreement'] as AttestationTag[],
    text: ''
  });
  const [verifyMessage, setVerifyMessage] = useState('');
  const [selectedAgreementId, setSelectedAgreementId] = useState('');
  const conflictGroups = useMemo(() => findSyncedConflictGroups(syncedAttestations), [syncedAttestations]);
  const agreementCandidates = useMemo(() => agreementReputationCandidates(agreements, agreementReceipts), [agreementReceipts, agreements]);
  const rows = useMemo(() => reputationRows(attestations, syncedAttestations, filter.hidden), [attestations, filter.hidden, syncedAttestations]);
  const visibleAttestations = useMemo(
    () => filterReputationRows(rows, filter).filter((row) => supportFilterMatches(row.attestation.subjectPublicKey, operatorSupportReceipts, filter.support)),
    [filter, operatorSupportReceipts, rows]
  );
  const subjectSummaries = useMemo(() => reputationSubjectSummaries(visibleAttestations, allowlist), [allowlist, visibleAttestations]);
  const selectedAgreement = agreementCandidates.find((candidate) => candidate.agreement.id === selectedAgreementId);
  const reviewPrompts = useMemo(
    () =>
      agreementCandidates.flatMap((candidate) => {
        if (!identity || candidate.receiptStatus !== 'mutually-signed') return [];
        const activeKey = identity.publicKey.toLowerCase();
        const prompts: { candidate: AgreementReputationCandidate; role: 'buyer' | 'seller' | 'mediator'; label: string }[] = [];
        if (candidate.buyerPublicKey?.toLowerCase() === activeKey && candidate.sellerPublicKey) {
          prompts.push({ candidate, role: 'seller', label: t('reputation.useSeller') });
        }
        if (candidate.sellerPublicKey?.toLowerCase() === activeKey && candidate.buyerPublicKey) {
          prompts.push({ candidate, role: 'buyer', label: t('reputation.useBuyer') });
        }
        if (
          (candidate.buyerPublicKey?.toLowerCase() === activeKey || candidate.sellerPublicKey?.toLowerCase() === activeKey) &&
          candidate.mediatorPublicKey
        ) {
          prompts.push({ candidate, role: 'mediator', label: t('reputation.useMediator') });
        }
        if (candidate.mediatorPublicKey?.toLowerCase() === activeKey) {
          if (candidate.buyerPublicKey) prompts.push({ candidate, role: 'buyer', label: t('reputation.useBuyer') });
          if (candidate.sellerPublicKey) prompts.push({ candidate, role: 'seller', label: t('reputation.useSeller') });
        }
        return prompts;
      }),
    [agreementCandidates, identity, t]
  );

  useEffect(() => {
    if (!draftRequest) return;
    setForm((current) => ({
      ...current,
      subjectPublicKey: draftRequest.subjectPublicKey,
      agreementHash: '',
      role: draftRequest.role,
      score: current.score || 5,
      listingId: draftRequest.listingId ?? '',
      listingTitle: draftRequest.listingTitle ?? '',
      listingCoordinate: draftRequest.listingCoordinate ?? '',
      tags: draftRequest.role === 'mediator' ? ['fair-mediator'] : ['fulfilled-agreement', 'clear-communication']
    }));
    setSelectedAgreementId('');
    setActiveTab('create');
    onDraftRequestConsumed();
  }, [draftRequest, onDraftRequestConsumed]);

  const applyAgreementCandidate = (candidate: AgreementReputationCandidate, role: 'buyer' | 'seller' | 'mediator'): void => {
    const subjectPublicKey = role === 'buyer' ? candidate.buyerPublicKey : role === 'seller' ? candidate.sellerPublicKey : candidate.mediatorPublicKey;
    if (!subjectPublicKey) return;
    setSelectedAgreementId(candidate.agreement.id);
    setForm({
      ...form,
      subjectPublicKey,
      agreementHash: candidate.agreementHash,
      role,
      score: 5,
      listingId: candidate.listingId ?? '',
      listingTitle: candidate.listingTitle ?? '',
      listingCoordinate: candidate.listingCoordinate ?? '',
      tags: role === 'mediator' ? ['fair-mediator'] : ['fulfilled-agreement', 'clear-communication']
    });
    setActiveTab('create');
  };

  const signingDisabledReason = (): string | undefined => {
    if (!identity) return t('a11y.identityRequired');
    if (nostrSigner.connected && nostrSigner.publicKey && nostrSigner.publicKey.toLowerCase() !== identity.publicKey.toLowerCase()) {
      if (identityCanUseLocalUnlock(identity) && privateKeyHex) return undefined;
      return t('reputation.signerMismatch');
    }
    if (nostrSigner.connected && nostrSigner.publicKey?.toLowerCase() === identity.publicKey.toLowerCase()) return undefined;
    if (identityCanUseLocalUnlock(identity) && privateKeyHex) return undefined;
    if ((identity.keySource ?? 'local') === 'nostr-extension') return t('reputation.signerRequired');
    return t('reputation.unlockRequired');
  };

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!identity || signingDisabledReason()) return;
    const draft = {
      reviewerPublicKey: identity.publicKey,
      subjectPublicKey: form.subjectPublicKey.toLowerCase(),
      agreementHash: form.agreementHash.trim() || undefined,
      role: form.role,
      score: form.score,
      listingId: form.listingId.trim() || undefined,
      listingTitle: form.listingTitle.trim() || undefined,
      listingCoordinate: form.listingCoordinate.trim() || undefined,
      tags: form.tags,
      text: sanitizePlainText(form.text)
    };
    try {
      const duplicate = attestations.find((attestation) => reputationReviewKey(attestation) === reputationReviewKey({ ...draft, id: 'draft', timestamp: 1, signature: '', eventId: '' }));
      if (duplicate) {
        setVerifyMessage(t('reputation.duplicateReview'));
        setActiveTab('browse');
        return;
      }
      const attestation =
        nostrSigner.connected && nostrSigner.publicKey?.toLowerCase() === identity.publicKey.toLowerCase()
          ? await (async () => {
              const prepared = prepareAttestationEvent(draft);
              const signed = await signWithNostrSigner(prepared.event, identity.publicKey);
              return attestationFromSignedEvent(draft, prepared, signed as AttestationSignedEvent);
            })()
          : createSignedAttestation(draft, privateKeyHex);
      await db.attestations.put(attestation);
      setVerifyMessage('');
      onSaved();
    } catch (error) {
      setVerifyMessage(error instanceof Error ? error.message : t('signer.rejected'));
    }
  };

  return (
    <section className="page reputation-page">
      <div className="panel">
        <SectionHeader icon={<BadgeCheck />} title={t('reputation.title')} body={t('reputation.body')} />
        <CompactTabs
          active={activeTab}
          label={t('reputation.title')}
          tabs={[
            ['create', t('reputation.tab.create')],
            ['browse', t('reputation.tab.browse')],
            ['context', t('reputation.tab.context')]
          ]}
          onChange={setActiveTab}
        />
        {activeTab === 'create' ? (
          <form className="settings-section" onSubmit={(event) => void save(event)}>
            <SafetyNotice>{t('safety.reputation')}</SafetyNotice>
            {reviewPrompts.length > 0 ? (
              <section className="inline-card">
                <strong>{t('reputation.reviewPrompt')}</strong>
                <p className="muted">{t('reputation.reviewPromptBody')}</p>
                <div className="actions small">
                  {reviewPrompts.slice(0, 4).map((prompt) => (
                    <button
                      key={`${prompt.candidate.agreement.id}-${prompt.role}`}
                      onClick={() => applyAgreementCandidate(prompt.candidate, prompt.role)}
                      type="button"
                    >
                      {prompt.label}: {prompt.candidate.agreement.exchangeDescription}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
            <div className="two">
              <label>
                {t('reputation.subject')}
                <input
                  pattern="[0-9a-fA-F]{64}"
                  required
                  placeholder={t('placeholder.publicKey')}
                  value={form.subjectPublicKey}
                  onChange={(event) => setForm({ ...form, subjectPublicKey: event.target.value })}
                />
                <FieldHint>{t('hint.reputationSubject')}</FieldHint>
              </label>
            </div>
            <div className="two">
              <label>
                {t('reputation.role')}
                <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as 'buyer' | 'seller' | 'mediator' })}>
                  <option value="buyer">{t('role.buyer')}</option>
                  <option value="seller">{t('role.seller')}</option>
                  <option value="mediator">{t('role.mediator')}</option>
                </select>
              </label>
              <label>
                {t('reputation.score')}
                <select value={form.score} onChange={(event) => setForm({ ...form, score: Number(event.target.value) })}>
                  {[5, 4, 3, 2, 1].map((score) => (
                    <option value={score} key={score}>
                      {t(`reputation.score.${score}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="two">
              <label>
                {t('listing.title')}
                <input
                  placeholder={t('reputation.listingTitlePlaceholder')}
                  value={form.listingTitle}
                  onChange={(event) => setForm({ ...form, listingTitle: event.target.value })}
                />
              </label>
              <label>
                {t('reputation.listingCoordinate')}
                <input
                  placeholder="30402:pubkey:listing-id"
                  value={form.listingCoordinate}
                  onChange={(event) => setForm({ ...form, listingCoordinate: event.target.value })}
                />
              </label>
            </div>
            <DisclosurePanel title={t('reputation.optionalAgreementContext')}>
              {agreementCandidates.length > 0 ? (
                <fieldset className="fieldset-list">
                  <legend>{t('reputation.fromAgreement')}</legend>
                  <label>
                    {t('trade.selectAgreement')}
                    <select value={selectedAgreementId} onChange={(event) => setSelectedAgreementId(event.target.value)}>
                      <option value="">{t('common.none')}</option>
                      {agreementCandidates.map((candidate) => (
                        <option value={candidate.agreement.id} key={candidate.agreement.id}>
                          {candidate.agreement.exchangeDescription} · {t(`agreement.status.${candidate.receiptStatus}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedAgreement ? (
                    <div className="actions small">
                      <span className="pill">{t(`agreement.status.${selectedAgreement.receiptStatus}`)}</span>
                      <button disabled={!selectedAgreement.buyerPublicKey} onClick={() => applyAgreementCandidate(selectedAgreement, 'buyer')} type="button">
                        {t('reputation.useBuyer')}
                      </button>
                      <button disabled={!selectedAgreement.sellerPublicKey} onClick={() => applyAgreementCandidate(selectedAgreement, 'seller')} type="button">
                        {t('reputation.useSeller')}
                      </button>
                      <button disabled={!selectedAgreement.mediatorPublicKey} onClick={() => applyAgreementCandidate(selectedAgreement, 'mediator')} type="button">
                        {t('reputation.useMediator')}
                      </button>
                    </div>
                  ) : null}
                </fieldset>
              ) : null}
              <label>
                {t('agreement.hash')}
                <input
                  placeholder={t('placeholder.agreementHash')}
                  value={form.agreementHash}
                  onChange={(event) => setForm({ ...form, agreementHash: event.target.value })}
                />
              </label>
            </DisclosurePanel>
            <div className="two">
              <label>
                {t('reputation.tags')}
                <select
                  multiple
                  value={form.tags}
                  onChange={(event) =>
                    setForm({ ...form, tags: Array.from(event.target.selectedOptions, (option) => option.value as AttestationTag) })
                  }
                >
                  {attestationTags.map((tag) => (
                    <option value={tag} key={tag}>
                      {t(`reputation.tag.${tag}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              {t('reputation.text')}
              <textarea
                placeholder={t('placeholder.reputationText')}
                value={form.text}
                onChange={(event) => setForm({ ...form, text: event.target.value })}
              />
              <FieldHint>{t('hint.reputationPublic')}</FieldHint>
            </label>
            <button disabled={Boolean(signingDisabledReason())} title={signingDisabledReason()} type="submit">
              {t('reputation.create')}
            </button>
            {signingDisabledReason() ? <ActionHint>{signingDisabledReason()}</ActionHint> : null}
            {verifyMessage ? <StatusMessage className="notice inline">{verifyMessage}</StatusMessage> : null}
          </form>
        ) : null}

        {activeTab === 'browse' ? (
          <section className="settings-section">
            <div className="filters compact-filters">
              <input
                aria-label={t('common.search')}
                placeholder={t('reputation.searchPlaceholder')}
                value={filter.query}
                onChange={(event) => setFilter({ ...filter, query: event.target.value })}
              />
              <select aria-label={t('reputation.role')} value={filter.role} onChange={(event) => setFilter({ ...filter, role: event.target.value as ReputationFilterState['role'] })}>
                <option value="all">{t('common.all')}</option>
                <option value="buyer">{t('role.buyer')}</option>
                <option value="seller">{t('role.seller')}</option>
                <option value="mediator">{t('role.mediator')}</option>
              </select>
              <select aria-label={t('reputation.tags')} value={filter.tag} onChange={(event) => setFilter({ ...filter, tag: event.target.value as ReputationFilterState['tag'] })}>
                <option value="all">{t('common.all')}</option>
                {attestationTags.map((tag) => (
                  <option value={tag} key={tag}>
                    {t(`reputation.tag.${tag}`)}
                  </option>
                ))}
              </select>
              <select aria-label={t('reputation.minScore')} value={filter.minScore} onChange={(event) => setFilter({ ...filter, minScore: event.target.value as ReputationFilterState['minScore'] })}>
                <option value="all">{t('common.all')}</option>
                <option value="5">{t('reputation.scoreFilter.5')}</option>
                <option value="4">{t('reputation.scoreFilter.4')}</option>
                <option value="unscored">{t('reputation.unscored')}</option>
              </select>
              <select aria-label={t('sync.source')} value={filter.source} onChange={(event) => setFilter({ ...filter, source: event.target.value as DataSourceFilter })}>
                <option value="combined">{t('sync.combined')}</option>
                <option value="local">{t('sync.localOnly')}</option>
                <option value="synced">{t('sync.syncedOnly')}</option>
              </select>
              <select aria-label={t('sync.trust')} value={filter.trust} onChange={(event) => setFilter({ ...filter, trust: event.target.value as TrustFilter })}>
                <option value="all">{t('common.all')}</option>
                <option value="trusted">{t('sync.trusted')}</option>
                <option value="untrusted">{t('sync.untrusted')}</option>
              </select>
              <select aria-label={t('support.filter')} value={filter.support} onChange={(event) => setFilter({ ...filter, support: event.target.value as SupportFilter })}>
                <option value="all">{t('support.all')}</option>
                <option value="supporters">{t('support.supporters')}</option>
                <option value="non-supporters">{t('support.nonSupporters')}</option>
              </select>
              <select aria-label={t('sync.hiddenFilter')} value={filter.hidden} onChange={(event) => setFilter({ ...filter, hidden: event.target.value as HiddenFilter })}>
                <option value="visible">{t('sync.visibleOnly')}</option>
                <option value="hidden">{t('sync.hiddenOnly')}</option>
                <option value="all">{t('sync.visibleAndHidden')}</option>
              </select>
              <select aria-label={t('reputation.verification')} value={filter.verification} onChange={(event) => setFilter({ ...filter, verification: event.target.value as ReputationFilterState['verification'] })}>
                <option value="all">{t('common.all')}</option>
                <option value="verified">{t('reputation.verifiedOnly')}</option>
                <option value="invalid">{t('reputation.invalidOnly')}</option>
              </select>
            </div>
            {verifyMessage ? <StatusMessage className="notice inline">{verifyMessage}</StatusMessage> : null}
            <div className="card-grid">
              {visibleAttestations.map(({ attestation, source: rowSource, trusted, verified, record }) => (
                <article className="card compact reputation-card" key={record?.id ?? `${rowSource}-${attestation.id}`}>
                  <div className="row between">
                    <span className="pill">{t(`role.${attestation.role}`)}</span>
                    <span className={verified ? 'ok mini' : 'warning mini'}>{verified ? t('reputation.verified') : t('reputation.invalid')}</span>
                  </div>
                  {syncSettings.showDataSource ? (
                    <span className="pill">
                      {rowSource === 'synced'
                        ? `${t('sync.syncedData')} · ${trusted ? t('sync.trusted') : t('sync.untrusted')}`
                        : t('sync.localData')}
                    </span>
                  ) : null}
                  {record ? (
                    <SyncedQualityBadges
                      conflict={isRecordConflicted(record, conflictGroups)}
                      hidden={record.hidden}
                      preferred={isPreferredConflictRecord(record, conflictGroups)}
                    />
                  ) : null}
                  <h2>{attestation.score ? `${formatReviewScore(attestation.score)} · ` : ''}{attestation.tags.map((tag) => t(`reputation.tag.${tag}`)).join(', ')}</h2>
                  <p>{attestation.text || t('reputation.noText')}</p>
                  <p className="muted">
                    {t('reputation.subjectShort')}: {shortPublicKey(attestation.subjectPublicKey)}
                    {attestation.agreementHash ? ` · ${t('agreement.hash')}: ${attestation.agreementHash.slice(0, 12)}...` : ''}
                  </p>
                  <SupporterBadge receipt={supportReceiptForPublicKey(attestation.subjectPublicKey, operatorSupportReceipts)} />
                  {attestation.listingTitle || attestation.listingCoordinate ? (
                    <p className="muted">
                      {t('reputation.listingContext')}: {attestation.listingTitle || attestation.listingCoordinate}
                    </p>
                  ) : null}
                  <DisclosurePanel title={t('listing.details')}>
                    <p>{attestation.text || t('reputation.noText')}</p>
                    <p className="key">{attestation.subjectPublicKey}</p>
                    <p className="key">{attestation.reviewerPublicKey}</p>
                    {attestation.agreementHash ? <p className="key">{attestation.agreementHash}</p> : null}
                    {attestation.listingCoordinate ? <p className="key">{attestation.listingCoordinate}</p> : null}
                    <div className="actions small">
                      <button
                        onClick={() => setVerifyMessage(verifyAttestation(attestation) ? t('reputation.verified') : t('reputation.invalid'))}
                        type="button"
                      >
                        <ShieldCheck size={16} /> {t('common.verify')}
                      </button>
                      {rowSource === 'local' ? (
                        <button onClick={() => onPublish(attestation)} type="button">
                          <Radio size={16} /> {t('common.publish')}
                        </button>
                      ) : null}
                      <button onClick={() => downloadJson(`agoramesh-attestation-${attestation.id}.json`, attestation)} type="button">
                        <Download size={16} /> {t('common.export')}
                      </button>
                      {record ? (
                        <SyncedRecordActions
                          conflict={isRecordConflicted(record, conflictGroups)}
                          preferred={isPreferredConflictRecord(record, conflictGroups)}
                          record={record}
                          onToggleHidden={onToggleHidden}
                        />
                      ) : null}
                    </div>
                  </DisclosurePanel>
                </article>
              ))}
              {visibleAttestations.length === 0 ? <EmptyState title={t('empty.reputationTitle')} body={t('empty.reputationBody')} /> : null}
            </div>
          </section>
        ) : null}

        {activeTab === 'context' ? (
          <section className="settings-section">
            <InlineHelp>{t('reputation.contextBody')}</InlineHelp>
            <div className="card-grid">
              {subjectSummaries.map((summary) => (
                <article className="card compact" key={summary.subjectPublicKey}>
                  <div className="row between">
                    <div className="row">
                      <h2>{summary.shortKey}</h2>
                      <SupporterBadge receipt={supportReceiptForPublicKey(summary.subjectPublicKey, operatorSupportReceipts)} />
                    </div>
                    <span className="pill">
                      {summary.averageScore ? `${formatReviewScore(summary.averageScore)} · ` : ''}{summary.verified}/{summary.total} {t('reputation.verifiedCount')}
                    </span>
                  </div>
                  <p className="muted">{t('seller.notVerified')}</p>
                  <p>
                    {t('reputation.roles')}: {summary.roles.map((role) => t(`role.${role}`)).join(', ')}
                  </p>
                  <p>
                    {summary.tags.map((entry) => `${t(`reputation.tag.${entry.tag}`)} (${entry.count})`).join(', ')}
                  </p>
                  <p className="muted">
                    {t('sync.trusted')}: {summary.trustedAuthors} · {t('sync.untrusted')}: {summary.untrustedAuthors}
                  </p>
                  {summary.recentReviews.length > 0 ? (
                    <div className="compact-list">
                      {summary.recentReviews.map((row) => (
                        <p className="muted" key={row.attestation.id}>
                          {row.attestation.score ? `${formatReviewScore(row.attestation.score)} · ` : ''}
                          {row.attestation.text || t('reputation.noText')}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
              {subjectSummaries.length === 0 ? <EmptyState title={t('empty.reputationTitle')} body={t('empty.reputationBody')} /> : null}
            </div>
            <DisclosurePanel title={t('reputation.agreementCandidates')} defaultOpen>
              <div className="card-grid single">
                {agreementCandidates.map((candidate) => (
                  <article className="card compact" key={candidate.agreement.id}>
                    <div className="row between">
                      <h2>{candidate.agreement.exchangeDescription}</h2>
                      <span className="pill">{t(`agreement.status.${candidate.receiptStatus}`)}</span>
                    </div>
                    <p className="key">{candidate.agreementHash}</p>
                    <div className="actions small">
                      <button disabled={!candidate.buyerPublicKey} onClick={() => applyAgreementCandidate(candidate, 'buyer')} type="button">
                        {t('reputation.useBuyer')}
                      </button>
                      <button disabled={!candidate.sellerPublicKey} onClick={() => applyAgreementCandidate(candidate, 'seller')} type="button">
                        {t('reputation.useSeller')}
                      </button>
                      <button disabled={!candidate.mediatorPublicKey} onClick={() => applyAgreementCandidate(candidate, 'mediator')} type="button">
                        {t('reputation.useMediator')}
                      </button>
                    </div>
                  </article>
                ))}
                {agreementCandidates.length === 0 ? <EmptyState title={t('empty.agreementsTitle')} body={t('empty.agreementsBody')} /> : null}
              </div>
            </DisclosurePanel>
          </section>
        ) : null}
      </div>
    </section>
  );
}

function SettingsPage({
  listings,
  relays,
  reviewItems,
  relayHealth,
  publishReceipts,
  nostrContactReceipts,
  lightningPaymentAttempts,
  operatorSupportReceipts,
  nwcConnections,
  unlockedNwcConnectionIds,
  nostrMessages,
  nostrMessageThreads,
  nostrInboxCursors,
  allowlist,
  syncedProfiles,
  syncedListings,
  syncedMediators,
  syncedAttestations,
  syncedDisputeOutcomes,
  syncedCommunityLists,
  syncSettings,
  syncStatuses,
  relayFetchSummaries,
  blossomServers,
  identity,
  nostrSigner,
  privateKeyHex,
  go,
  onConnectSigner,
  onNostrConnectConnected,
  onUseConnectedSignerAsIdentity,
  onRelayFetchSummaries,
  onToggleHidden,
  onFetchNostrInbox,
  onNostrThreadChange,
  onSendNostrIntro,
  onSaveNwcConnection,
  onUnlockNwcConnection,
  onLockNwcConnection,
  onDisconnectNwcConnection,
  onTestNwcConnection,
  onChanged
}: {
  listings: Listing[];
  relays: RelayConfig[];
  reviewItems: NostrReviewItem[];
  relayHealth: RelayHealth[];
  publishReceipts: PublishReceipt[];
  nostrContactReceipts: NostrContactReceipt[];
  lightningPaymentAttempts: LightningPaymentAttempt[];
  operatorSupportReceipts: OperatorSupportReceipt[];
  nwcConnections: NwcConnection[];
  unlockedNwcConnectionIds: string[];
  nostrMessages: NostrMessageRecord[];
  nostrMessageThreads: NostrMessageThread[];
  nostrInboxCursors: NostrInboxCursor[];
  allowlist: CommunityAllowlistEntry[];
  syncedProfiles: SyncedPublicRecord<PublicProfile>[];
  syncedListings: SyncedPublicRecord<Listing>[];
  syncedMediators: SyncedPublicRecord<MediatorProfile>[];
  syncedAttestations: SyncedPublicRecord<ReputationAttestation>[];
  syncedDisputeOutcomes: SyncedPublicRecord<PublicDisputeOutcome>[];
  syncedCommunityLists: SyncedPublicRecord<CommunityCurationList>[];
  syncSettings: SyncSettings;
  syncStatuses: SyncStatus[];
  relayFetchSummaries: RelayFetchSummary[];
  blossomServers: BlossomServerConfig[];
  identity?: IdentityRecord;
  nostrSigner: NostrSignerState;
  privateKeyHex: string;
  go: (page: RouteTarget) => void;
  onConnectSigner: () => void;
  onNostrConnectConnected: (state: NostrSignerState) => void;
  onUseConnectedSignerAsIdentity: () => void;
  onRelayFetchSummaries: (summaries: RelayFetchSummary[]) => void;
  onToggleHidden: (
    record: SyncedPublicRecord<PublicProfile> | SyncedPublicRecord<Listing> | SyncedPublicRecord<PublicDisputeOutcome> | SyncedPublicRecord<CommunityCurationList>,
    hidden: boolean
  ) => void;
  onFetchNostrInbox: (inboxPassphrase: string) => Promise<InboxFetchSummary>;
  onNostrThreadChange: (thread: NostrMessageThread, changes: { read?: boolean; archived?: boolean }) => void;
  onSendNostrIntro: (args: SendNostrContactIntroArgs) => Promise<NostrContactReceipt>;
  onSaveNwcConnection: (request: SaveNwcConnectionRequest) => Promise<NwcConnection>;
  onUnlockNwcConnection: (connection: NwcConnection, passphrase: string) => Promise<void>;
  onLockNwcConnection: (connectionId: string) => void;
  onDisconnectNwcConnection: (connectionId: string) => void;
  onTestNwcConnection: (connection: NwcConnection) => Promise<void>;
  onChanged: (message?: string, next?: NextStep) => void;
}): ReactNode {
  const { t } = useI18n();
  const [relayUrl, setRelayUrl] = useState('');
  const [blossomUrl, setBlossomUrl] = useState('');
  const [allowlistForm, setAllowlistForm] = useState({ publicKey: '', label: '', note: '' });
  const [hidden, setHidden] = useState<HiddenFilter>('visible');
  const [reviewPassphrase, setReviewPassphrase] = useState('');
  const [reviewFilter, setReviewFilter] = useState<ReviewQueueFilter>({ status: 'all', encryption: 'all', trust: 'all' });
  const [showExpiredReviewListings, setShowExpiredReviewListings] = useState(false);
  const [selectedReviewItemIds, setSelectedReviewItemIds] = useState<string[]>([]);
  const [bulkReviewMessage, setBulkReviewMessage] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>(settingsTabFromHash);
  const shouldOpenAdvancedReview = window.location.hash === '#settings:review';
  const signerStatus = signerIdentityStatus(identity, nostrSigner);
  const relayScores = useMemo(() => relayScoresFromHealth(relayHealth), [relayHealth]);
  const profileConflicts = useMemo(() => findSyncedConflictGroups(syncedProfiles), [syncedProfiles]);
  const listingConflicts = useMemo(() => findSyncedConflictGroups(syncedListings), [syncedListings]);
  const outcomeConflicts = useMemo(() => findSyncedConflictGroups(syncedDisputeOutcomes), [syncedDisputeOutcomes]);
  const curationConflicts = useMemo(() => findSyncedConflictGroups(syncedCommunityLists), [syncedCommunityLists]);
  const filteredProfiles = useMemo(() => applyHiddenFilter(syncedProfiles, hidden), [hidden, syncedProfiles]);
  const filteredListings = useMemo(
    () => applyHiddenFilter(syncedListings, hidden).filter((record) => (showExpiredReviewListings ? true : !isListingExpired(record.payload))),
    [hidden, showExpiredReviewListings, syncedListings]
  );
  const filteredDisputeOutcomes = useMemo(() => applyHiddenFilter(syncedDisputeOutcomes, hidden), [hidden, syncedDisputeOutcomes]);
  const filteredCommunityLists = useMemo(() => applyHiddenFilter(syncedCommunityLists, hidden), [hidden, syncedCommunityLists]);
  const enabledRelayCount = relays.filter((relay) => relay.enabled).length;
  const filteredReviewItems = useMemo(
    () =>
      filterReviewItems(reviewItems, reviewFilter, allowlist.map((entry) => entry.publicKey)).filter((item) =>
        showExpiredReviewListings ? true : !reviewItemContainsExpiredListing(item)
      ),
    [allowlist, reviewFilter, reviewItems, showExpiredReviewListings]
  );
  const invalidReviewItems = filteredReviewItems.filter((item) => item.importStatus === 'invalid');
  const regularReviewItems = filteredReviewItems.filter((item) => item.importStatus !== 'invalid');
  const selectedReviewItems = filteredReviewItems.filter((item) => selectedReviewItemIds.includes(item.id));
  const safeVisibleReviewItems = regularReviewItems.filter(
    (item) => item.importStatus === 'pending' && item.signatureValid && !reviewItemHasEncryptedContent(item)
  );
  const syncedRecordCount =
    syncedProfiles.length +
    syncedListings.length +
    syncedMediators.length +
    syncedAttestations.length +
    syncedDisputeOutcomes.length +
    syncedCommunityLists.length;
  const publishableListingCount = listings.filter((listing) => listing.visibility === 'public').length;
  const publicSyncSteps: PublicSyncStep[] = [
    {
      title: t('sync.wizard.stepRelays'),
      body: enabledRelayCount > 0 ? t('sync.wizard.relaysReady') : t('sync.wizard.relaysMissing'),
      done: enabledRelayCount > 0,
      actionLabel: t('next.configureRelays'),
      onAction: () => setActiveTab('relays')
    },
    {
      title: t('sync.wizard.stepFetch'),
      body: syncedRecordCount > 0 ? t('sync.wizard.fetchReady') : t('sync.wizard.fetchNeeded'),
      done: syncedRecordCount > 0,
      actionLabel: t('next.openBrowse'),
      onAction: () => go('browse')
    },
    {
      title: t('sync.wizard.stepImport'),
      body: syncedRecordCount > 0 ? t('sync.wizard.importReady') : t('sync.wizard.importNeeded'),
      done: syncedRecordCount > 0,
      actionLabel: t('next.publicCache'),
      onAction: () => setActiveTab('cache')
    },
    {
      title: t('sync.wizard.stepMarketplace'),
      body: publishableListingCount > 0 ? t('sync.wizard.marketplacePublish') : t('sync.wizard.marketplaceBrowse'),
      done: syncedRecordCount > 0 || publishableListingCount > 0,
      actionLabel: publishableListingCount > 0 ? t('next.publishFromBrowse') : t('next.openBrowse'),
      onAction: () => go(publishableListingCount > 0 ? 'browse:mine' : 'browse')
    }
  ];

  useEffect(() => {
    const onHash = (): void => {
      if (navFromHash() === 'settings') setActiveTab(settingsTabFromHash());
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const addRelay = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const relay = relayConfigSchema.parse({ url: relayUrl, enabled: true });
    await db.relays.put(relay);
    await db.relayHealth.put({
      url: relay.url,
      enabled: relay.enabled,
      eventsReceived: 0,
      eventsPublished: 0,
      consecutiveFailures: 0
    });
    setRelayUrl('');
    setActiveTab('relays');
    onChanged(t('notice.relayAdded'), {
      body: t('next.relayAdded'),
      actions: [{ label: t('next.openBrowse'), page: 'browse' }]
    });
  };

  const toggleRelay = async (relay: RelayConfig): Promise<void> => {
    await db.relays.put({ ...relay, enabled: !relay.enabled });
    const health = await db.relayHealth.get(relay.url);
    await db.relayHealth.put({
      ...(health ?? {
        url: relay.url,
        eventsReceived: 0,
        eventsPublished: 0,
        consecutiveFailures: 0
      }),
      enabled: !relay.enabled
    });
    onChanged(t('notice.settingsSaved'));
  };

  const addBlossomServer = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const server = blossomServerConfigSchema.parse({ id: newId('blossom'), url: blossomUrl, enabled: true });
    await db.blossomServers.put(server);
    setBlossomUrl('');
    onChanged(t('notice.mediaServerSaved'));
  };

  const toggleBlossomServer = async (server: BlossomServerConfig): Promise<void> => {
    await db.blossomServers.put({ ...server, enabled: !server.enabled });
    onChanged(t('notice.mediaServerSaved'));
  };

  const importBackup = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;
    const parsed: unknown = JSON.parse(await file.text());
    await importAllData(parsed);
    onChanged(t('notice.backupImported'));
  };

  const importAllowlist = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!window.confirm(t('sync.importAllowlistConfirm'))) {
      event.target.value = '';
      return;
    }
    const envelope = parseCommunityAllowlistEnvelope(JSON.parse(await file.text()));
    const merged = mergeCommunityAllowlist(allowlist, envelope);
    await db.allowlist.clear();
    await db.allowlist.bulkPut(merged);
    await recomputeSyncedRecordTrust(merged);
    event.target.value = '';
    onChanged(t('notice.allowlistImported'));
  };

  const exportAllowlist = (): void => {
    downloadJson('agoramesh-community-allowlist.json', exportCommunityAllowlist(allowlist));
    onChanged(t('notice.allowlistExported'));
  };

  const syncReviewQueue = async (): Promise<void> => {
    setSyncing(true);
    try {
      const existingEventIds = reviewItems.map((item) => item.eventId);
      const sinceByRelay = Object.fromEntries(relayHealth.map((entry) => [entry.url, isoToNostrTimestamp(entry.lastConnectedAt)]));
      const startedAt = Date.now();
      const rawFetched = await fetchAgoraEventsFromRelays(relays, sinceByRelay, syncSettings.listingDiscoveryScope);
      onRelayFetchSummaries(summarizeRelayFetch(relays, rawFetched, reviewItems, startedAt));
      const fetched = dedupeReviewItems(rawFetched, existingEventIds);
      if (fetched.length > 0) {
        await db.nostrReview.bulkPut(fetched);
      }
      await Promise.all(
        relays
          .filter((relay) => relay.enabled)
          .map(async (relay) => {
            const health = (await db.relayHealth.get(relay.url)) ?? {
              url: relay.url,
              enabled: relay.enabled,
              eventsReceived: 0,
              eventsPublished: 0,
              consecutiveFailures: 0
            };
            const received = fetched.filter((item) => item.relay === relay.url).length;
            const relayErrors = fetched.filter((item) => item.relay === relay.url && item.kind === 0 && item.importStatus === 'invalid');
            await db.relayHealth.put({
              ...health,
              enabled: relay.enabled,
              lastConnectedAt: relayErrors.length === 0 ? nowIso() : health.lastConnectedAt,
              lastError: relayErrors[0]?.payloadPreview,
              latencyMs: Date.now() - startedAt,
              eventsReceived: health.eventsReceived + received,
              consecutiveFailures: relayErrors.length > 0 && received === relayErrors.length ? health.consecutiveFailures + 1 : 0
            });
          })
      );
      const nextReviewPage: RouteTarget = fetched.length > 0 ? 'settings:review' : 'browse';
      onChanged(t('notice.reviewFetched'), {
        body: fetched.length > 0 ? t('marketplace.reviewFetchedBody') : t('marketplace.reviewEmptyBody'),
        actions: [{ label: fetched.length > 0 ? t('next.reviewQueue') : t('next.openBrowse'), page: nextReviewPage }]
      });
    } finally {
      setSyncing(false);
    }
  };

  const cacheReviewItem = async (item: NostrReviewItem): Promise<void> => {
    await cachePublicReviewItem(item, allowlist, reviewItemHasEncryptedContent(item) ? reviewPassphrase : '');
    await db.nostrReview.put({ ...item, importStatus: 'imported' });
  };

  const importReviewItem = async (item: NostrReviewItem): Promise<void> => {
    await cacheReviewItem(item);
    setActiveTab('cache');
    onChanged(t('notice.reviewImported'), {
      body: t('next.reviewImported'),
      actions: [
        { label: t('next.openBrowse'), page: 'browse' },
        { label: t('next.publicCache'), page: 'settings' }
      ]
    });
  };

  const rejectReviewItem = async (item: NostrReviewItem): Promise<void> => {
    await db.nostrReview.put({ ...item, importStatus: 'rejected' });
    onChanged(t('notice.reviewRejected'));
  };

  const clearInvalidReviewItems = async (): Promise<void> => {
    await db.nostrReview.where('importStatus').equals('invalid').delete();
    setSelectedReviewItemIds((current) => current.filter((id) => !invalidReviewItems.some((item) => item.id === id)));
    onChanged(t('notice.invalidCleared'));
  };

  const selectVisibleSafeReviewItems = (): void => {
    setSelectedReviewItemIds(safeVisibleReviewItems.map((item) => item.id));
    setBulkReviewMessage(t('review.selectedSummary').replace('{count}', String(safeVisibleReviewItems.length)));
  };

  const toggleReviewItemSelection = (item: NostrReviewItem, checked: boolean): void => {
    setSelectedReviewItemIds((current) => (checked ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id)));
  };

  const bulkImportSelectedReviewItems = async (): Promise<void> => {
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    for (const item of selectedReviewItems) {
      if (item.importStatus !== 'pending' || !item.signatureValid || reviewItemHasEncryptedContent(item)) {
        skipped += 1;
        continue;
      }
      try {
        await cacheReviewItem(item);
        imported += 1;
      } catch {
        failed += 1;
      }
    }
    setSelectedReviewItemIds([]);
    setBulkReviewMessage(
      t('review.bulkResult')
        .replace('{imported}', String(imported))
        .replace('{skipped}', String(skipped))
        .replace('{failed}', String(failed))
        .replace('{rejected}', '0')
    );
    onChanged(t('notice.reviewImported'));
  };

  const bulkRejectVisibleInvalidItems = async (): Promise<void> => {
    const invalid = filteredReviewItems.filter((item) => item.importStatus === 'invalid');
    await db.nostrReview.bulkPut(invalid.map((item) => ({ ...item, importStatus: 'rejected' as const })));
    setSelectedReviewItemIds((current) => current.filter((id) => !invalid.some((item) => item.id === id)));
    onChanged(t('notice.reviewRejected'));
  };

  const bulkRejectSelectedReviewItems = async (): Promise<void> => {
    const rejectable = selectedReviewItems.filter((item) => item.importStatus === 'invalid');
    await db.nostrReview.bulkPut(rejectable.map((item) => ({ ...item, importStatus: 'rejected' as const })));
    setSelectedReviewItemIds([]);
    setBulkReviewMessage(t('review.rejectSelectedResult').replace('{count}', String(rejectable.length)));
    onChanged(t('notice.reviewRejected'));
  };

  const clearRejectedReviewItems = async (): Promise<void> => {
    await db.nostrReview.where('importStatus').equals('rejected').delete();
    setSelectedReviewItemIds((current) => current.filter((id) => !filteredReviewItems.some((item) => item.importStatus === 'rejected' && item.id === id)));
    onChanged(t('notice.rejectedCleared'));
  };

  const saveSyncSettings = async (next: SyncSettings): Promise<void> => {
    await db.syncSettings.put(next);
    onChanged(t('notice.settingsSaved'));
  };

  const reviewScopeLabel = (scope?: ListingDiscoveryScope): string | undefined => {
    if (!scope) return undefined;
    return scope === 'all-nip99' ? t('sync.scopeAllNip99') : t('sync.scopeAgoraMeshNative');
  };

  const addAllowlistEntry = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const publicKey = sanitizePlainText(allowlistForm.publicKey).toLowerCase();
    await db.allowlist.put({
      id: newId('allowlist'),
      publicKey,
      label: sanitizePlainText(allowlistForm.label),
      note: sanitizePlainText(allowlistForm.note),
      createdAt: nowIso()
    });
    await Promise.all([
      markSyncedRecordsTrusted(db.syncedProfiles, publicKey, true),
      markSyncedRecordsTrusted(db.syncedListings, publicKey, true),
      markSyncedRecordsTrusted(db.syncedMediators, publicKey, true),
      markSyncedRecordsTrusted(db.syncedAttestations, publicKey, true),
      markSyncedRecordsTrusted(db.syncedDisputeOutcomes, publicKey, true),
      markSyncedRecordsTrusted(db.syncedCommunityLists, publicKey, true)
    ]);
    setAllowlistForm({ publicKey: '', label: '', note: '' });
    onChanged(t('notice.allowlistSaved'));
  };

  const removeAllowlistEntry = async (id: string): Promise<void> => {
    const removed = await db.allowlist.get(id);
    await db.allowlist.delete(id);
    if (removed && !(await db.allowlist.where('publicKey').equals(removed.publicKey).first())) {
      await Promise.all([
        markSyncedRecordsTrusted(db.syncedProfiles, removed.publicKey, false),
        markSyncedRecordsTrusted(db.syncedListings, removed.publicKey, false),
        markSyncedRecordsTrusted(db.syncedMediators, removed.publicKey, false),
        markSyncedRecordsTrusted(db.syncedAttestations, removed.publicKey, false),
        markSyncedRecordsTrusted(db.syncedDisputeOutcomes, removed.publicKey, false),
        markSyncedRecordsTrusted(db.syncedCommunityLists, removed.publicKey, false)
      ]);
    }
    onChanged(t('notice.allowlistSaved'));
  };

  const setVisiblePublicCacheHidden = async (nextHidden: boolean): Promise<void> => {
    await Promise.all([
      ...filteredProfiles.map((record) => onToggleHidden(record, nextHidden)),
      ...filteredListings.map((record) => onToggleHidden(record, nextHidden)),
      ...filteredDisputeOutcomes.map((record) => onToggleHidden(record, nextHidden)),
      ...filteredCommunityLists.map((record) => onToggleHidden(record, nextHidden))
    ]);
  };

  const reviewQueuePanel = (
    <div className="advanced-review-panel">
      <div className="row between">
        <div>
          <h3>{t('nostr.reviewQueue')}</h3>
          <p className="muted">{t('settings.reviewDiagnosticsBody')}</p>
        </div>
        <button disabled={syncing} onClick={() => void syncReviewQueue()} type="button">
          <Radio size={16} /> {syncing ? t('nostr.syncing') : t('nostr.fetchReview')}
        </button>
      </div>
      <div className="filters compact-filters">
        <select
          aria-label={t('review.filter.status')}
          value={reviewFilter.status}
          onChange={(event) => setReviewFilter({ ...reviewFilter, status: event.target.value as ReviewQueueFilter['status'] })}
        >
          <option value="all">{t('common.all')}</option>
          <option value="pending">{t('review.filter.pending')}</option>
          <option value="invalid">{t('review.filter.invalid')}</option>
          <option value="imported">{t('review.filter.imported')}</option>
          <option value="rejected">{t('review.filter.rejected')}</option>
        </select>
        <select
          aria-label={t('review.filter.encryption')}
          value={reviewFilter.encryption}
          onChange={(event) => setReviewFilter({ ...reviewFilter, encryption: event.target.value as ReviewQueueFilter['encryption'] })}
        >
          <option value="all">{t('common.all')}</option>
          <option value="plain">{t('review.filter.plain')}</option>
          <option value="encrypted">{t('review.filter.encrypted')}</option>
        </select>
        <select
          aria-label={t('review.filter.trust')}
          value={reviewFilter.trust}
          onChange={(event) => setReviewFilter({ ...reviewFilter, trust: event.target.value as TrustFilter })}
        >
          <option value="all">{t('common.all')}</option>
          <option value="trusted">{t('sync.trusted')}</option>
          <option value="untrusted">{t('sync.untrusted')}</option>
        </select>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={showExpiredReviewListings}
            onChange={(event) => setShowExpiredReviewListings(event.target.checked)}
          />
          {t('review.showExpiredListings')}
        </label>
      </div>
      <div className="actions small">
        <button onClick={selectVisibleSafeReviewItems} type="button">
          {t('review.selectVisibleSafe')}
        </button>
        <button disabled={selectedReviewItems.length === 0} onClick={() => void bulkImportSelectedReviewItems()} type="button">
          {t('review.importSelected')}
        </button>
        <button disabled={selectedReviewItems.length === 0} onClick={() => void bulkRejectSelectedReviewItems()} type="button">
          {t('review.rejectSelected')}
        </button>
        <button onClick={() => void bulkRejectVisibleInvalidItems()} type="button">
          {t('review.bulkRejectInvalid')}
        </button>
        <button onClick={() => void clearRejectedReviewItems()} type="button">
          {t('review.clearRejected')}
        </button>
        <button disabled={selectedReviewItemIds.length === 0} onClick={() => setSelectedReviewItemIds([])} type="button">
          {t('review.clearSelection')}
        </button>
      </div>
      <p className="muted">{t('review.selectedCount').replace('{count}', String(selectedReviewItems.length))}</p>
      {bulkReviewMessage ? <StatusMessage className="notice inline">{bulkReviewMessage}</StatusMessage> : null}
      <DisclosurePanel title={t('ui.advanced')}>
        <DisclosurePanel title={t('ui.whyMatters')}>
          <InlineHelp>{t('help.reviewQueue')}</InlineHelp>
        </DisclosurePanel>
        <p className="muted">{t('sync.outgoingNote')}</p>
        <label>
          {t('nostr.encryptedReviewPassphrase')}
          <input minLength={10} type="password" value={reviewPassphrase} onChange={(event) => setReviewPassphrase(event.target.value)} />
          <FieldHint>{t('hint.reviewPassphrase')}</FieldHint>
        </label>
        <button onClick={() => void clearInvalidReviewItems()} type="button">
          {t('nostr.clearInvalid')}
        </button>
      </DisclosurePanel>
      <div aria-live="polite" aria-relevant="additions text" className="card-grid single">
        {regularReviewItems.map((item) => (
          <article className="card compact" key={item.id}>
            <div className="row between">
              <label className="checkbox compact-checkbox">
                <input
                  checked={selectedReviewItemIds.includes(item.id)}
                  type="checkbox"
                  onChange={(event) => toggleReviewItemSelection(item, event.target.checked)}
                />
                <span className="pill">{item.importStatus}</span>
              </label>
              <span className={item.signatureValid ? 'ok mini' : 'warning mini'}>
                {item.signatureValid ? t('nostr.signatureValid') : t('nostr.signatureInvalid')}
              </span>
            </div>
            <p className="key">{item.eventId}</p>
            <p className="muted">
              {item.relay} · kind {item.kind} · {item.authorPublicKey}
            </p>
            {reviewScopeLabel(item.discoveryScope) ? <span className="pill subtle-pill">{reviewScopeLabel(item.discoveryScope)}</span> : null}
            <pre>{item.payloadPreview}</pre>
            <div className="actions small">
              <button
                disabled={item.importStatus !== 'pending' || !item.signatureValid || (reviewItemHasEncryptedContent(item) && reviewPassphrase.length < 10)}
                onClick={() => void importReviewItem(item)}
                title={
                  item.importStatus !== 'pending' || !item.signatureValid
                    ? t('a11y.reviewImportDisabled')
                    : reviewItemHasEncryptedContent(item) && reviewPassphrase.length < 10
                      ? t('a11y.passphraseMin')
                      : undefined
                }
                type="button"
              >
                {t('nostr.importReviewed')}
              </button>
              <button
                disabled={item.importStatus !== 'pending'}
                onClick={() => void rejectReviewItem(item)}
                title={item.importStatus !== 'pending' ? t('a11y.reviewActionDone') : undefined}
                type="button"
              >
                {t('nostr.reject')}
              </button>
            </div>
          </article>
        ))}
        {regularReviewItems.length === 0 && invalidReviewItems.length === 0 ? <EmptyState title={t('empty.reviewTitle')} body={t('empty.reviewBody')} /> : null}
      </div>
      {invalidReviewItems.length > 0 ? (
        <DisclosurePanel title={`${t('review.invalidUnsupported')} (${invalidReviewItems.length})`}>
          <div className="card-grid single">
            {invalidReviewItems.map((item) => (
              <article className="card compact" key={item.id}>
                <div className="row between">
                  <label className="checkbox compact-checkbox">
                    <input
                      checked={selectedReviewItemIds.includes(item.id)}
                      type="checkbox"
                      onChange={(event) => toggleReviewItemSelection(item, event.target.checked)}
                    />
                    <span className="pill">{item.importStatus}</span>
                  </label>
                  <span className="warning mini">{t('nostr.signatureInvalid')}</span>
                </div>
                <p className="key">{item.eventId}</p>
                <p className="muted">
                  {item.relay} · kind {item.kind} · {item.authorPublicKey}
                </p>
                {reviewScopeLabel(item.discoveryScope) ? <span className="pill subtle-pill">{reviewScopeLabel(item.discoveryScope)}</span> : null}
                <pre>{item.payloadPreview}</pre>
              </article>
            ))}
          </div>
        </DisclosurePanel>
      ) : null}
    </div>
  );

  return (
    <section className="page">
      <div className="panel">
        <SectionHeader icon={<ShieldCheck />} title={t('settings.title')} body={t('settings.privacyBody')} />
        <PublicSyncWizard steps={publicSyncSteps} />
        <CompactTabs
          active={activeTab}
          label={t('settings.title')}
          tabs={[
            ['account', t('settings.tab.account')],
            ['relays', t('settings.tab.relaysSync')],
            ['cache', t('settings.tab.cache')],
            ['trust', t('settings.tab.trustLists')],
            ['media', t('settings.tab.media')],
            ['backup', t('settings.tab.backupDanger')],
            ['diagnostics', t('settings.tab.diagnostics')]
          ]}
          onChange={setActiveTab}
        />

        {activeTab === 'account' ? (
          <section className="settings-section" aria-labelledby="settings-account">
            <h2 id="settings-account">{t('settings.accountSigner')}</h2>
            <p className="muted">{t('signer.body')}</p>
            <SignerStatusStrip
              status={signerStatus}
              relays={relays}
              onConnect={onConnectSigner}
              onNostrConnectConnected={onNostrConnectConnected}
              onUseAsIdentity={onUseConnectedSignerAsIdentity}
            />
            {nostrSigner.lastError ? <p className="warning">{nostrSigner.lastError}</p> : null}
            <div className="inline-card">
              <h3>{t('settings.workspaceTools')}</h3>
              <p className="muted">{t('settings.workspaceToolsBody')}</p>
              <div className="actions small">
                <button className="subtle" onClick={() => go('trade')} type="button">
                  <Handshake size={16} aria-hidden="true" /> {t('nav.trade')}
                </button>
                <button className="subtle" onClick={() => go('mediators')} type="button">
                  <Scale size={16} aria-hidden="true" /> {t('nav.mediators')}
                </button>
                <button className="subtle" onClick={() => go('reputation')} type="button">
                  <BadgeCheck size={16} aria-hidden="true" /> {t('nav.reputation')}
                </button>
              </div>
            </div>
            <DisclosurePanel title={t('ui.whyMatters')}>
              <InlineHelp>{t('settings.accountSignerBody')}</InlineHelp>
            </DisclosurePanel>
          </section>
        ) : null}

        {activeTab === 'relays' ? (
          <section className="settings-section" aria-labelledby="settings-relays">
            <h2 id="settings-relays">{t('nostr.title')}</h2>
            <form className="inline-form" onSubmit={(event) => void addRelay(event)}>
              <label className="sr-only" htmlFor="relay-url">
                {t('sync.relayUrl')}
              </label>
              <input
                id="relay-url"
                placeholder={t('placeholder.relayUrl')}
                value={relayUrl}
                onChange={(event) => setRelayUrl(event.target.value)}
              />
              <button type="submit">{t('nostr.add')}</button>
            </form>
            <ActionHint>{t('hint.relayAdd')}</ActionHint>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={syncSettings.liveSyncEnabled}
                onChange={(event) => void saveSyncSettings({ ...syncSettings, liveSyncEnabled: event.target.checked })}
              />
              {t('sync.live')}
            </label>
            <div className="compact-list">
              {relays.map((relay) => (
                <label className="checkbox relay" key={relay.url}>
                  <input type="checkbox" checked={relay.enabled} onChange={() => void toggleRelay(relay)} />
                  {relay.url}
                </label>
              ))}
            </div>
            <DisclosurePanel title={t('ui.advanced')}>
              <DisclosurePanel title={t('ui.whyMatters')}>
                <SafetyNotice>{t('safety.syncMetadata')}</SafetyNotice>
                <p className="muted">
                  {t('nostr.note')} Kinds: {Object.values(AGORAMESH_EVENT_KINDS).join(', ')}
                </p>
              </DisclosurePanel>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={syncSettings.showDataSource}
                  onChange={(event) => void saveSyncSettings({ ...syncSettings, showDataSource: event.target.checked })}
                />
                {t('sync.showSource')}
              </label>
              <label>
                {t('sync.defaultSource')}
                <select
                  value={syncSettings.defaultBrowseSource}
                  onChange={(event) => void saveSyncSettings({ ...syncSettings, defaultBrowseSource: event.target.value as DataSourceFilter })}
                >
                  <option value="combined">{t('sync.combined')}</option>
                  <option value="local">{t('sync.localOnly')}</option>
                  <option value="synced">{t('sync.syncedOnly')}</option>
                </select>
              </label>
              <label>
                {t('sync.listingDiscoveryScope')}
                <select
                  value={syncSettings.listingDiscoveryScope}
                  onChange={(event) => void saveSyncSettings({ ...syncSettings, listingDiscoveryScope: event.target.value as ListingDiscoveryScope })}
                >
                  <option value="agoramesh-native">{t('sync.scopeAgoraMeshNative')}</option>
                  <option value="all-nip99">{t('sync.scopeAllNip99')}</option>
                </select>
                <FieldHint>{t('sync.listingDiscoveryScopeHelp')}</FieldHint>
              </label>
            </DisclosurePanel>
          </section>
        ) : null}

        {activeTab === 'cache' ? (
          <section className="settings-section" aria-labelledby="settings-cache">
            <h2 id="settings-cache">{t('sync.syncedPublicData')}</h2>
            <label>
              {t('sync.hiddenFilter')}
              <select aria-label={t('sync.hiddenFilter')} value={hidden} onChange={(event) => setHidden(event.target.value as HiddenFilter)}>
                <option value="visible">{t('sync.visibleOnly')}</option>
                <option value="hidden">{t('sync.hiddenOnly')}</option>
                <option value="all">{t('sync.visibleAndHidden')}</option>
              </select>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={showExpiredReviewListings}
                onChange={(event) => setShowExpiredReviewListings(event.target.checked)}
              />
              {t('review.showExpiredListings')}
            </label>
            <div className="actions small">
              <button onClick={() => void setVisiblePublicCacheHidden(true)} type="button">
                {t('sync.hideVisibleSynced')}
              </button>
              <button onClick={() => void setVisiblePublicCacheHidden(false)} type="button">
                {t('sync.unhideVisibleSynced')}
              </button>
            </div>
            <DisclosurePanel title={t('sync.publicProfiles')} defaultOpen>
              <div className="card-grid single">
                {filteredProfiles.map((record) => (
                  <article className="card compact" key={record.id}>
                    <SyncedQualityBadges
                      conflict={isRecordConflicted(record, profileConflicts)}
                      hidden={record.hidden}
                      preferred={isPreferredConflictRecord(record, profileConflicts)}
                    />
                    <div className="profile-card-heading">
                      <AvatarCircle avatarUrl={record.payload.avatarUrl} label={record.payload.displayName} />
                      <div>
                        <h2>{record.payload.displayName}</h2>
                        <SupporterBadge receipt={supportReceiptForPublicKey(record.payload.publicKey, operatorSupportReceipts)} />
                      </div>
                    </div>
                    <p>{record.payload.bio}</p>
                    <p className="key">{record.authorPublicKey}</p>
                    <SyncedRecordActions
                      conflict={isRecordConflicted(record, profileConflicts)}
                      preferred={isPreferredConflictRecord(record, profileConflicts)}
                      record={record}
                      onToggleHidden={onToggleHidden}
                    />
                  </article>
                ))}
                {filteredProfiles.length === 0 ? <EmptyState title={t('empty.syncedProfilesTitle')} body={t('empty.syncedProfilesBody')} /> : null}
              </div>
            </DisclosurePanel>
            <DisclosurePanel title={t('sync.publicListings')} defaultOpen>
              <div className="card-grid single">
                {filteredListings.map((record) => (
                  <article className="card compact" key={record.id}>
                    <SyncedQualityBadges
                      conflict={isRecordConflicted(record, listingConflicts)}
                      hidden={record.hidden}
                      preferred={isPreferredConflictRecord(record, listingConflicts)}
                    />
                    <div className="row between">
                      <h2>{record.payload.title}</h2>
                      <span className={isListingExpired(record.payload) ? 'warning mini' : 'pill'}>
                        {isListingExpired(record.payload) ? t('common.expired') : categoryLabel(record.payload.category, t)}
                      </span>
                    </div>
                    <p>{record.payload.description}</p>
                    <p className="muted">
                      {record.payload.region} · {record.payload.expiresAt}
                    </p>
                    {reviewScopeLabel(record.discoveryScope) ? <span className="pill subtle-pill">{reviewScopeLabel(record.discoveryScope)}</span> : null}
                    <p className="key">{record.authorPublicKey}</p>
                    <SyncedRecordActions
                      conflict={isRecordConflicted(record, listingConflicts)}
                      preferred={isPreferredConflictRecord(record, listingConflicts)}
                      record={record}
                      onToggleHidden={onToggleHidden}
                    />
                  </article>
                ))}
                {filteredListings.length === 0 ? <EmptyState title={t('empty.syncedListingsTitle')} body={t('empty.syncedListingsBody')} /> : null}
              </div>
            </DisclosurePanel>
            <DisclosurePanel title={t('sync.disputeOutcomes')}>
              <div className="card-grid single">
                {filteredDisputeOutcomes.map((record) => (
                  <article className="card compact" key={record.id}>
                    <div className="row">
                      <span className="pill">{record.trusted ? t('sync.trusted') : t('sync.untrusted')}</span>
                      <SyncedQualityBadges
                        conflict={isRecordConflicted(record, outcomeConflicts)}
                        hidden={record.hidden}
                        preferred={isPreferredConflictRecord(record, outcomeConflicts)}
                      />
                    </div>
                    <h2>{record.payload.state}</h2>
                    <p>{record.payload.outcomeSummary}</p>
                    {record.payload.agreementHash ? <p className="key">{record.payload.agreementHash}</p> : null}
                    <SyncedRecordActions
                      conflict={isRecordConflicted(record, outcomeConflicts)}
                      preferred={isPreferredConflictRecord(record, outcomeConflicts)}
                      record={record}
                      onToggleHidden={onToggleHidden}
                    />
                  </article>
                ))}
                {filteredDisputeOutcomes.length === 0 ? (
                  <EmptyState title={t('empty.disputeOutcomesTitle')} body={t('empty.disputeOutcomesBody')} />
                ) : null}
              </div>
            </DisclosurePanel>
            <DisclosurePanel title={t('curation.syncedTitle')}>
              <div className="card-grid single">
                {filteredCommunityLists.map((record) => (
                  <article className="card compact" key={record.id}>
                    <div className="row">
                      <span className="pill">{record.trusted ? t('sync.trusted') : t('sync.untrusted')}</span>
                      <SyncedQualityBadges
                        conflict={isRecordConflicted(record, curationConflicts)}
                        hidden={record.hidden}
                        preferred={isPreferredConflictRecord(record, curationConflicts)}
                      />
                    </div>
                    <h2>{record.payload.title}</h2>
                    <p>{record.payload.description}</p>
                    <p className="muted">
                      {t('curation.references')}: {record.payload.referencedCoordinates.length}
                    </p>
                    <p className="key">{record.authorPublicKey}</p>
                    <SyncedRecordActions
                      conflict={isRecordConflicted(record, curationConflicts)}
                      preferred={isPreferredConflictRecord(record, curationConflicts)}
                      record={record}
                      onToggleHidden={onToggleHidden}
                    />
                  </article>
                ))}
                {filteredCommunityLists.length === 0 ? <EmptyState title={t('empty.curationTitle')} body={t('empty.curationBody')} /> : null}
              </div>
            </DisclosurePanel>
          </section>
        ) : null}

        {activeTab === 'trust' ? (
          <section className="settings-section" aria-labelledby="settings-trust">
            <h2 id="settings-trust">{t('sync.allowlist')}</h2>
            <form className="stack-form" onSubmit={(event) => void addAllowlistEntry(event)}>
              <label>
                {t('common.publicKey')}
                <input
                  pattern="[0-9a-fA-F]{64}"
                  required
                  placeholder={t('placeholder.publicKey')}
                  value={allowlistForm.publicKey}
                  onChange={(event) => setAllowlistForm({ ...allowlistForm, publicKey: event.target.value })}
                />
                <FieldHint>{t('hint.allowlistKey')}</FieldHint>
              </label>
              <label>
                {t('sync.label')}
                <input
                  required
                  placeholder={t('placeholder.allowlistLabel')}
                  value={allowlistForm.label}
                  onChange={(event) => setAllowlistForm({ ...allowlistForm, label: event.target.value })}
                />
              </label>
              <label>
                {t('sync.note')}
                <input
                  placeholder={t('placeholder.allowlistNote')}
                  value={allowlistForm.note}
                  onChange={(event) => setAllowlistForm({ ...allowlistForm, note: event.target.value })}
                />
              </label>
              <button type="submit">{t('sync.addTrusted')}</button>
            </form>
            <DisclosurePanel title={t('ui.advanced')}>
              <InlineHelp>{t('help.allowlist')}</InlineHelp>
              <div className="actions small">
                <button onClick={exportAllowlist} type="button">
                  <Download size={16} /> {t('sync.exportAllowlist')}
                </button>
                <label className="file-button" title={t('a11y.fileInputHelp')}>
                  <Upload size={16} /> {t('sync.importAllowlist')}
                  <input accept="application/json" type="file" onChange={(event) => void importAllowlist(event)} />
                </label>
              </div>
            </DisclosurePanel>
            <div className="card-grid single">
              {allowlist.map((entry) => (
                <article className="card compact" key={entry.id}>
                  <div className="row between">
                    <strong>{entry.label}</strong>
                    <button className="danger" onClick={() => void removeAllowlistEntry(entry.id)} type="button">
                      {t('common.delete')}
                    </button>
                  </div>
                  <p className="key">{entry.publicKey}</p>
                  <p>{entry.note}</p>
                </article>
              ))}
              {allowlist.length === 0 ? <EmptyState title={t('empty.allowlistTitle')} body={t('empty.allowlistBody')} /> : null}
            </div>
          </section>
        ) : null}

        {activeTab === 'media' ? (
          <section className="settings-section" aria-labelledby="settings-media">
            <h2 id="settings-media">{t('settings.mediaServers')}</h2>
            <SafetyNotice>{t('safety.blossomImages')}</SafetyNotice>
            <form className="inline-form" onSubmit={(event) => void addBlossomServer(event)}>
              <label className="sr-only" htmlFor="blossom-url">
                {t('settings.blossomUrl')}
              </label>
              <input
                id="blossom-url"
                placeholder={t('placeholder.blossomUrl')}
                value={blossomUrl}
                onChange={(event) => setBlossomUrl(event.target.value)}
              />
              <button type="submit">{t('settings.addMediaServer')}</button>
            </form>
            <div className="compact-list">
              {blossomServers.map((server) => (
                <label className="checkbox relay" key={server.id}>
                  <input type="checkbox" checked={server.enabled} onChange={() => void toggleBlossomServer(server)} />
                  <span>
                    {server.url}
                    {server.lastError ? <small className="warning"> · {server.lastError}</small> : null}
                  </span>
                </label>
              ))}
              {blossomServers.length === 0 ? <p className="muted">{t('settings.noMediaServers')}</p> : null}
            </div>
          </section>
        ) : null}

        {activeTab === 'diagnostics' ? (
          <section className="settings-section" aria-labelledby="settings-diagnostics">
            <h2 id="settings-diagnostics">{t('settings.tab.diagnostics')}</h2>
            <div aria-live="polite" role="status">
              {syncStatuses.map((status) => (
                <p className={status.ok ? 'ok' : 'warning'} key={`${status.relay}-${status.at}`}>
                  {status.relay}: {status.message}
                </p>
              ))}
            </div>
            {relayFetchSummaries.length > 0 ? (
              <div className="status-chip-row" aria-label={t('sync.fetchSummary')}>
                {relayFetchSummaries.map((summary) => (
                  <span className={summary.ok ? 'status-chip' : 'status-chip warning'} key={summary.relayUrl}>
                    <strong>{summary.received}</strong> {summary.relayUrl} · {summary.invalid} {t('sync.invalidShort')} · {summary.duplicates}{' '}
                    {t('sync.duplicatesShort')} · {summary.elapsedMs}ms
                  </span>
                ))}
              </div>
            ) : null}
            <DisclosurePanel title={t('sync.relayHealth')} defaultOpen>
              <div aria-live="polite" aria-relevant="additions text" className="card-grid single">
                {relayScores.map((score) => {
                  const health = relayHealth.find((entry) => entry.url === score.url);
                  return (
                    <article className="card compact" key={score.url}>
                      <div className="row between">
                        <strong>{score.url}</strong>
                        <span className={score.label === 'excellent' || score.label === 'healthy' ? 'ok mini' : 'warning mini'}>
                          {t(`sync.relayScore.${score.label}`)}
                        </span>
                      </div>
                      <p className="muted">
                        {t('sync.relayScore')}: {score.score}/100 · {score.reasons.map((reason) => t(`sync.relayReason.${reason}`)).join(', ')}
                      </p>
                      <p className="muted">
                        {t('sync.received')}: {health?.eventsReceived ?? 0} · {t('sync.published')}: {health?.eventsPublished ?? 0} ·{' '}
                        {t('sync.failures')}: {health?.consecutiveFailures ?? 0}
                      </p>
                      {health?.latencyMs !== undefined ? <p className="muted">{t('sync.latency')}: {health.latencyMs}ms</p> : null}
                      {health?.lastError ? <p className="warning">{health.lastError}</p> : null}
                    </article>
                  );
                })}
                {relayScores.length === 0 ? <EmptyState title={t('empty.relayHealthTitle')} body={t('empty.relayHealthBody')} /> : null}
              </div>
            </DisclosurePanel>
            <DisclosurePanel title={t('sync.publishReceipts')}>
              <div className="card-grid single">
                {publishReceipts.slice(0, 12).map((receipt) => (
                  <article className="card compact" key={receipt.id}>
                    <div className="row between">
                      <span className="pill">{receipt.objectType}</span>
                      <span className={receipt.status === 'accepted' ? 'ok mini' : 'warning mini'}>{receipt.status}</span>
                    </div>
                    <p className="key">{receipt.eventId}</p>
                    <p className="muted">{receipt.relayUrl}</p>
                    <p>{receipt.message}</p>
                  </article>
                ))}
                {publishReceipts.length === 0 ? <EmptyState title={t('empty.receiptsTitle')} body={t('empty.receiptsBody')} /> : null}
              </div>
            </DisclosurePanel>
            <NostrInboxPanel
              cursors={nostrInboxCursors}
              defaultOpen={window.location.hash === '#settings:inbox'}
              identity={identity}
              messages={nostrMessages}
              nostrSigner={nostrSigner}
              privateKeyHex={privateKeyHex}
              receipts={nostrContactReceipts}
              relays={relays}
              threads={nostrMessageThreads}
              onConnectSigner={onConnectSigner}
              onFetch={onFetchNostrInbox}
              onSend={onSendNostrIntro}
              onThreadChange={onNostrThreadChange}
            />
            <DisclosurePanel title={t('nostrContact.receipts')}>
              <div className="card-grid single">
                {nostrContactReceipts.slice(0, 12).map((receipt) => (
                  <article className="card compact" key={receipt.id}>
                    <div className="row between">
                      <span className="pill">{receipt.contextType}</span>
                      <span className={receipt.status === 'accepted' ? 'ok mini' : 'warning mini'}>{receipt.status}</span>
                    </div>
                    <p className="key">{receipt.recipientNpub}</p>
                    <p className="muted">
                      {receipt.contextTitle || receipt.contextId || t('common.none')} · {receipt.sentAt}
                    </p>
                    <p className="muted">
                      {t('nostrContact.receiptEvents')}: {receipt.eventIds.length} · {t('sync.published')}:{' '}
                      {receipt.relayReceipts.filter((entry) => entry.ok).length}
                    </p>
                    <p className="key">{receipt.eventIds.join(', ')}</p>
                  </article>
                ))}
                {nostrContactReceipts.length === 0 ? <EmptyState title={t('nostrContact.noReceiptsTitle')} body={t('nostrContact.noReceiptsBody')} /> : null}
              </div>
            </DisclosurePanel>
            <NwcWalletPanel
              connections={nwcConnections}
              unlockedConnectionIds={unlockedNwcConnectionIds}
              onSave={onSaveNwcConnection}
              onUnlock={onUnlockNwcConnection}
              onLock={onLockNwcConnection}
              onDisconnect={onDisconnectNwcConnection}
              onTest={onTestNwcConnection}
            />
            <DisclosurePanel title={t('payment.attempts')}>
              <div className="card-grid single">
                {lightningPaymentAttempts.slice(0, 12).map((attempt) => (
                  <article className="card compact" key={attempt.id}>
                    <div className="row between">
                      <span className="pill">{t(`payment.status.${attempt.status}`)}</span>
                      <span className="muted">{attempt.amountSats} sats</span>
                    </div>
                    <p className="muted">
                      {attempt.listingTitle || attempt.listingId || t('common.none')} · {attempt.createdAt}
                    </p>
                    <p className="key">{attempt.bolt11}</p>
                    <p className="muted">
                      {t('sync.published')}: {attempt.receiptRelayUrls.length} · {attempt.error || t('common.none')}
                    </p>
                    {attempt.nwcRequestEventId ? (
                      <p className="muted">
                        NWC: {attempt.nwcRelayUrl || t('common.none')} · {attempt.feesPaidMsats ?? 0} msats fee
                      </p>
                    ) : null}
                    {attempt.receiptEventId ? <p className="key">{attempt.receiptEventId}</p> : null}
                    {attempt.nwcResponseEventId ? <p className="key">{attempt.nwcResponseEventId}</p> : null}
                  </article>
                ))}
                {lightningPaymentAttempts.length === 0 ? <EmptyState title={t('payment.noAttemptsTitle')} body={t('payment.noAttemptsBody')} /> : null}
              </div>
            </DisclosurePanel>
            <DisclosurePanel title={t('support.receipts')}>
              <div className="card-grid single">
                {operatorSupportReceipts.slice(0, 12).map((receipt) => (
                  <article className="card compact" key={receipt.id}>
                    <div className="row between">
                      <SupporterBadge receipt={receipt} />
                      <span className="muted">{Math.floor(receipt.amountMsats / 1000)} sats</span>
                    </div>
                    <p className="key">{receipt.payerPublicKey}</p>
                    <p className="muted">
                      {receipt.operatorLnurl} · {receipt.validatedAt}
                    </p>
                    <p className="key">{receipt.receiptEventId}</p>
                  </article>
                ))}
                {operatorSupportReceipts.length === 0 ? <EmptyState title={t('support.noReceiptsTitle')} body={t('support.noReceiptsBody')} /> : null}
              </div>
            </DisclosurePanel>
            <DisclosurePanel key={shouldOpenAdvancedReview ? 'review-route-open' : 'review-route-closed'} title={t('settings.advancedReviewQueue')} defaultOpen={shouldOpenAdvancedReview}>
              {reviewQueuePanel}
            </DisclosurePanel>
          </section>
        ) : null}

        {activeTab === 'backup' ? (
          <section className="settings-section" aria-labelledby="settings-backup">
            <h2 id="settings-backup">{t('settings.tab.backupDanger')}</h2>
            <div className="actions vertical">
              <button
                onClick={() =>
                  void exportAllData().then((data) => {
                    downloadJson('agoramesh-backup.json', data);
                    onChanged(t('notice.backupExported'));
                  })
                }
                type="button"
              >
                <Download size={16} /> {t('settings.exportAll')}
              </button>
              <DisclosurePanel title={t('ui.advanced')}>
                <label className="file-button" title={t('a11y.fileInputHelp')}>
                  <Upload size={16} /> {t('settings.importAll')}
                  <input accept="application/json" aria-describedby="settings-import-help" type="file" onChange={(event) => void importBackup(event)} />
                </label>
                <p className="sr-only" id="settings-import-help">
                  {t('a11y.fileInputHelp')}
                </p>
                <DisclosurePanel title={t('ui.whyMatters')}>
                  <p className="muted">{t('settings.privacyBody')}</p>
                  <p className="muted">{t('about.body')}</p>
                </DisclosurePanel>
                <button
                  className="danger"
                  onClick={() => {
                    if (window.confirm(t('settings.deleteConfirm'))) {
                      void deleteLocalData().then(() => onChanged(t('notice.localDataDeleted')));
                    }
                  }}
                  type="button"
                >
                  {t('settings.deleteAll')}
                </button>
              </DisclosurePanel>
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}

function SyncedQualityBadges({ conflict, hidden, preferred }: { conflict: boolean; hidden: boolean; preferred: boolean }): ReactNode {
  const { t } = useI18n();
  if (!conflict && !hidden) return null;
  return (
    <div className="tags">
      {hidden ? <span>{t('sync.hidden')}</span> : null}
      {conflict ? <span>{preferred ? t('sync.conflictPreferred') : t('sync.conflictDuplicate')}</span> : null}
    </div>
  );
}

function SyncedRecordActions<T>({
  record,
  conflict = false,
  preferred = false,
  onToggleHidden
}: {
  record: SyncedPublicRecord<T>;
  conflict?: boolean;
  preferred?: boolean;
  onToggleHidden: (record: SyncedPublicRecord<T>, hidden: boolean) => void;
}): ReactNode {
  const { t } = useI18n();
  const label = record.hidden
    ? t('sync.unhideRecord')
    : conflict && !preferred
      ? t('sync.hideDuplicate')
      : conflict
        ? t('sync.keepVisible')
        : t('sync.hideRecord');
  const nextHidden = record.hidden ? false : conflict && preferred ? false : true;
  return (
    <button onClick={() => onToggleHidden(record, nextHidden)} type="button">
      {record.hidden || (conflict && preferred) ? <Eye size={16} /> : <EyeOff size={16} />} {label}
    </button>
  );
}

function StatusChipRow({ items }: { items: [string, string][] }): ReactNode {
  const { t } = useI18n();
  return (
    <div className="status-chip-row" aria-label={t('marketplace.statusLabel')}>
      {items.map(([label, value]) => (
        <span className="status-chip" key={label}>
          <strong>{value}</strong> {label}
        </span>
      ))}
    </div>
  );
}

function NostrConnectPairingPanel({
  relays,
  onConnected
}: {
  relays: RelayConfig[];
  onConnected: (state: NostrSignerState) => void;
}): ReactNode {
  const { t } = useI18n();
  const [connectUri, setConnectUri] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const onConnectedRef = useRef(onConnected);
  const failureMessageRef = useRef(t('signer.nostrConnectFailed'));

  useEffect(() => {
    onConnectedRef.current = onConnected;
    failureMessageRef.current = t('signer.nostrConnectFailed');
  }, [onConnected, t]);

  useEffect(() => {
    const pairing = resumeNostrConnectPairing();
    if (!pairing) return;
    let mounted = true;
    setConnectUri(pairing.uri);
    setConnecting(true);
    setError('');
    void pairing.promise
      .then((state) => {
        if (!mounted) return;
        onConnectedRef.current(state);
        setConnecting(false);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : failureMessageRef.current);
        setConnecting(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const startPairing = (): void => {
    setError('');
    setConnecting(true);
    const pairing = startNostrConnectPairing(relays.filter((relay) => relay.enabled).map((relay) => relay.url));
    setConnectUri(pairing.uri);
    void pairing.promise
      .then((state) => {
        onConnected(state);
        setConnecting(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : t('signer.nostrConnectFailed'));
        setConnecting(false);
      });
  };
  return (
    <div className="nostr-connect-pairing">
      <p className="muted">{t('signer.nostrConnectFallback')}</p>
      <div className="actions small">
        <button className="subtle" disabled={connecting} onClick={startPairing} type="button">
          {connecting ? t('signer.nostrConnectWaiting') : t('signer.startNostrConnect')}
        </button>
        {connectUri ? (
          <a className="button subtle" href={connectUri} rel="noopener noreferrer" target="_blank">
            {t('signer.openNostrConnect')}
          </a>
        ) : null}
        <button className="subtle" disabled={!connectUri} onClick={() => void navigator.clipboard?.writeText(connectUri)} type="button">
          {t('signer.copyNostrConnectUrl')}
        </button>
      </div>
      {connectUri ? <p className="key">{connectUri}</p> : null}
      {error ? <p className="warning compact-warning">{error}</p> : null}
    </div>
  );
}

function SignerStatusStrip({
  status,
  relays,
  onConnect,
  onNostrConnectConnected,
  onUseAsIdentity
}: {
  status: SignerIdentityStatus;
  relays: RelayConfig[];
  onConnect: () => void;
  onNostrConnectConnected: (state: NostrSignerState) => void;
  onUseAsIdentity?: () => void;
}): ReactNode {
  const { t } = useI18n();
  const showNostrConnectPairing = status.state !== 'active-identity' && status.state !== 'connected';
  return (
    <article className="inline-card signer-strip">
      <div className="row between">
        <strong>{t(`signer.status.${status.state}`)}</strong>
        <span className={status.state === 'active-identity' ? 'ok mini' : status.state === 'connected-mismatch' ? 'warning mini' : 'pill'}>
          {status.state}
        </span>
      </div>
      <p className="muted">{t(`signer.status.${status.state}.body`)}</p>
      {status.signerPublicKey ? <p className="key">{status.signerPublicKey}</p> : null}
      <div className="actions small">
        <button onClick={onConnect} type="button">
          <KeyRound size={16} /> {status.state === 'connected-mismatch' ? t('signer.reconnect') : t('signer.connect')}
        </button>
        {status.signerPublicKey && status.state !== 'active-identity' && onUseAsIdentity ? (
          <button onClick={onUseAsIdentity} type="button">
            {t('signer.useAsIdentity')}
          </button>
        ) : null}
      </div>
      {showNostrConnectPairing ? <NostrConnectPairingPanel relays={relays} onConnected={onNostrConnectConnected} /> : null}
    </article>
  );
}

function PublicSyncWizard({ steps }: { steps: PublicSyncStep[] }): ReactNode {
  const { t } = useI18n();
  const nextStepIndex = steps.findIndex((step) => !step.done);
  const activeActionIndex = nextStepIndex === -1 ? steps.length - 1 : nextStepIndex;
  return (
    <section className="sync-wizard" aria-labelledby="public-sync-wizard-title">
      <div>
        <h2 id="public-sync-wizard-title">{t('sync.wizard.title')}</h2>
        <p>{t('sync.wizard.body')}</p>
      </div>
      <div className="sync-step-grid">
        {steps.map((step, index) => (
          <article className={step.done ? 'sync-step done' : 'sync-step'} key={step.title}>
            <span className={step.done ? 'ok mini' : 'pill'}>{step.done ? t('sync.wizard.done') : t('sync.wizard.next')}</span>
            <h3>
              {index + 1}. {step.title}
            </h3>
            <p>{step.body}</p>
            {index === activeActionIndex && step.onAction && step.actionLabel ? (
              <button className="subtle" onClick={step.onAction} type="button">
                {step.actionLabel}
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function PublishReceiptSummaryView({ summary }: { summary: PublishReceiptSummary }): ReactNode {
  const { t } = useI18n();
  if (!summary.latest) return <ActionHint>{t('marketplace.noReceipts')}</ActionHint>;
  return (
    <div className="receipt-summary">
      <strong>{t('marketplace.receiptSummary')}</strong>
      <p className="muted">
        {t('marketplace.receiptAccepted')}: {summary.accepted} · {t('marketplace.receiptFailed')}: {summary.failed} ·{' '}
        {t('marketplace.receiptPending')}: {summary.pending}
      </p>
      <p className={summary.latest.status === 'accepted' ? 'ok mini' : 'warning mini'}>
        {summary.latest.relayUrl}: {summary.latest.message}
      </p>
    </div>
  );
}

function StatusMessage({
  children,
  className = 'notice',
  assertive = false
}: {
  children: ReactNode;
  className?: string;
  assertive?: boolean;
}): ReactNode {
  return (
    <div aria-live={assertive ? 'assertive' : 'polite'} className={className} role={assertive ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }): ReactNode {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}

function InlineHelp({ children }: { children: ReactNode }): ReactNode {
  return <p className="inline-help">{children}</p>;
}

function FieldHint({ children }: { children: ReactNode }): ReactNode {
  return <span className="field-hint">{children}</span>;
}

function ActionHint({ children }: { children: ReactNode }): ReactNode {
  return <p className="action-hint">{children}</p>;
}

function SafetyNotice({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="safety-notice" role="note">
      <ShieldCheck size={16} aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

function ReadinessSummary({ title, items }: { title: string; items: ReadinessItem[] }): ReactNode {
  const { t } = useI18n();
  return (
    <section className="readiness-summary" aria-label={title}>
      <h2>{title}</h2>
      <div className="readiness-grid">
        {items.map((item) => (
          <article className="readiness-item" key={item.label}>
            <span className={item.done ? 'ok mini' : 'pill'}>{item.done ? t('readiness.ready') : t('readiness.needsAttention')}</span>
            <strong>{item.label}</strong>
            {item.detail ? <p>{item.detail}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function PageStatusDisclosure({ title, items }: { title: string; items: ReadinessItem[] }): ReactNode {
  return (
    <DisclosurePanel title={title}>
      <ReadinessSummary title={title} items={items} />
    </DisclosurePanel>
  );
}

function NextStepActions({
  nextStep,
  go,
  onDismiss
}: {
  nextStep: NextStep;
  go: (page: RouteTarget) => void;
  onDismiss: () => void;
}): ReactNode {
  const { t } = useI18n();
  return (
    <section aria-label={t('next.title')} className="compact-action-notice">
      <div>
        <h2>{t('next.title')}</h2>
        <p>{nextStep.body}</p>
      </div>
      <div className="actions small">
        {nextStep.actions.map((action) => (
          <button
            className="subtle"
            key={`${action.page}-${action.label}`}
            onClick={() => {
              go(action.page);
              onDismiss();
            }}
            type="button"
          >
            {action.label}
          </button>
        ))}
        <button className="subtle" onClick={onDismiss} type="button">
          {t('next.dismiss')}
        </button>
      </div>
    </section>
  );
}

function DisclosurePanel({
  title,
  children,
  defaultOpen = false
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}): ReactNode {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <section className="disclosure-panel">
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className="disclosure-trigger subtle"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <span>{title}</span>
        <span aria-hidden="true">{open ? '-' : '+'}</span>
      </button>
      {open ? (
        <div className="disclosure-body" id={panelId}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

function CompactTabs<T extends string>({
  active,
  tabs,
  onChange,
  label
}: {
  active: T;
  tabs: [T, string][];
  onChange: (tab: T) => void;
  label?: string;
}): ReactNode {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const offset = event.key === 'ArrowRight' ? 1 : -1;
    const next = (index + offset + tabs.length) % tabs.length;
    onChange(tabs[next][0]);
  };
  return (
    <div className="compact-tabs" role="tablist" aria-label={label}>
      {tabs.map(([id, tabLabel], index) => (
        <button
          aria-selected={active === id}
          className={active === id ? 'active' : ''}
          key={id}
          onClick={() => onChange(id)}
          onKeyDown={(event) => onKeyDown(event, index)}
          role="tab"
          tabIndex={active === id ? 0 : -1}
          type="button"
        >
          {tabLabel}
        </button>
      ))}
    </div>
  );
}

function SecondaryMeta({ items }: { items: [string, string][] }): ReactNode {
  return (
    <dl className="secondary-meta">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SectionHeader({ icon, title, body }: { icon: ReactNode; title: string; body?: string }): ReactNode {
  return (
    <header className="section-header">
      <div className="card-icon">{icon}</div>
      <div>
        <h1>{title}</h1>
        {body ? <p>{body}</p> : null}
      </div>
    </header>
  );
}
