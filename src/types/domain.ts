export type LanguageCode = 'en' | 'cs';

export type ContactKind = 'matrix' | 'simplex' | 'session' | 'email' | 'nostr' | 'custom';

export type PaymentPreference =
  | 'cash'
  | 'bank'
  | 'bitcoin'
  | 'lightning'
  | 'cashu'
  | 'monero'
  | 'barter'
  | 'mutual-credit'
  | 'other';

export type PaymentIntentMethod = 'bitcoin' | 'lightning' | 'cashu' | 'monero' | 'bank' | 'cash' | 'other';

export type ListingFulfillmentType = 'local-pickup' | 'shipping' | 'delivery' | 'digital' | 'other';

export type ListingType = 'offer' | 'request';

export type ListingVisibility = 'local' | 'public' | 'draft';

export type ListingStatus = 'active' | 'sold' | 'deleted';

export interface ListingPrice {
  amount: string;
  currency: string;
  frequency?: string;
  note?: string;
}

export type DisputeState =
  | 'draft'
  | 'opened'
  | 'awaiting-response'
  | 'mediation-proposed'
  | 'settlement-proposed'
  | 'resolved'
  | 'abandoned';

export type AttestationTag =
  | 'fulfilled-agreement'
  | 'clear-communication'
  | 'late'
  | 'no-show'
  | 'fair-mediator'
  | 'resolved-dispute'
  | 'refund-honored'
  | 'other';

export interface ContactMethod {
  id: string;
  kind: ContactKind;
  value: string;
  note?: string;
}

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  salt: string;
  iterations: number;
  algorithm: 'AES-GCM';
  kdf: 'PBKDF2-SHA-256';
}

export interface EncryptedExportEnvelope {
  schemaVersion: 1;
  kind: 'encrypted-dispute-bundle';
  createdAt: string;
  kdf: 'PBKDF2-SHA-256';
  algorithm: 'AES-GCM';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface EncryptedRelayContentEnvelope {
  schemaVersion: 1;
  kind: 'encrypted-relay-content';
  createdAt: string;
  kdf: 'PBKDF2-SHA-256';
  algorithm: 'AES-GCM';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface PaymentIntent {
  id: string;
  method: PaymentIntentMethod;
  value: string;
  note: string;
}

export interface ListingImage {
  id: string;
  url: string;
  sha256?: string;
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
  sizeBytes?: number;
  width?: number;
  height?: number;
  altText?: string;
  blossomServerUrl?: string;
  uploadedAt?: string;
}

export interface CommunityCurationList {
  id: string;
  title: string;
  description: string;
  authorPublicKey: string;
  referencedCoordinates: string[];
  createdAt: string;
  updatedAt: string;
}

export interface NostrSignerState {
  available: boolean;
  connected: boolean;
  publicKey?: string;
  lastError?: string;
  provider?: 'nip07' | 'nip46';
  connectedAtMs?: number;
}

export interface NostrProfileMetadata {
  name?: string;
  displayName?: string;
  about?: string;
  picture?: string;
  lud06?: string;
  lud16?: string;
}

interface BaseIdentityRecord {
  id: string;
  displayName: string;
  publicKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalIdentityRecord extends BaseIdentityRecord {
  keySource?: 'local';
  encryptedPrivateKey: EncryptedSecret;
}

export interface ExtensionIdentityRecord extends BaseIdentityRecord {
  keySource: 'nostr-extension';
  encryptedPrivateKey?: never;
}

export type IdentityRecord = LocalIdentityRecord | ExtensionIdentityRecord;

export interface PublicProfile {
  id: string;
  displayName: string;
  publicKey: string;
  avatarUrl?: string;
  lightningAddress?: string;
  lnurl?: string;
  bio: string;
  region: string;
  languages: string[];
  contactMethods: ContactMethod[];
  skills: string[];
  mediatorAvailable: boolean;
  publicVisibility: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Listing {
  id: string;
  authorPublicKey: string;
  title: string;
  type: ListingType;
  category: string;
  description: string;
  region: string;
  status: ListingStatus;
  price: ListingPrice;
  publishedAt?: string;
  paymentPreferences: PaymentPreference[];
  paymentIntents?: PaymentIntent[];
  images?: ListingImage[];
  fulfillmentType?: ListingFulfillmentType;
  fulfillmentNotes?: string;
  barterAccepted: boolean;
  tags: string[];
  expiresAt: string;
  contactMethod: ContactMethod;
  mediatorPreference?: string;
  visibility: ListingVisibility;
  createdAt: string;
  updatedAt: string;
}

export interface Agreement {
  id: string;
  buyer: string;
  seller: string;
  buyerPublicKey?: string;
  sellerPublicKey?: string;
  buyerLabel?: string;
  sellerLabel?: string;
  listingId?: string;
  exchangeDescription: string;
  priceAndPayment: string;
  fulfillmentTerms: string;
  deadline: string;
  refundTerms: string;
  mediator?: string;
  evidenceExpectations: string;
  buyerAccepted: boolean;
  sellerAccepted: boolean;
  hashVersion?: 2;
  hash: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgreementTermsPacket {
  schemaVersion: 1;
  kind: 'agreement-terms-packet';
  agreement: Agreement;
  agreementHash: string;
  exportedAt: string;
}

export interface AgreementAcceptanceReceipt {
  id: string;
  schemaVersion: 1;
  kind: 'agreement-acceptance-receipt';
  agreementHash: string;
  role: 'buyer' | 'seller';
  signerPublicKey: string;
  acceptedAt: string;
  eventId: string;
  signature: string;
}

export type AgreementReceiptStatus = 'draft' | 'partially-signed' | 'mutually-signed';

export interface MediatorProfile {
  id: string;
  displayName: string;
  publicKey: string;
  region: string;
  languages: string[];
  specialties: string[];
  feeModel: string;
  mediationStyle: string;
  responseTime: string;
  caseCount: number;
  contactMethods: ContactMethod[];
  procedure: string;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceMetadata {
  id: string;
  title: string;
  description: string;
  fileHash?: string;
  date: string;
  source: string;
  localFilename?: string;
  notes?: string;
}

export interface TimelineEntry {
  id: string;
  at: string;
  note: string;
}

export interface DisputeCase {
  id: string;
  state: DisputeState;
  agreementHash: string;
  claimant: string;
  respondent: string;
  mediator?: string;
  claimSummary: string;
  requestedResolution: string;
  response?: string;
  timeline: TimelineEntry[];
  evidence: EvidenceMetadata[];
  settlementProposal?: string;
  outcomeSummary?: string;
  publishOutcomeAttestation: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReputationAttestation {
  id: string;
  reviewerPublicKey: string;
  subjectPublicKey: string;
  agreementHash?: string;
  role: 'buyer' | 'seller' | 'mediator';
  score?: number;
  listingId?: string;
  listingTitle?: string;
  listingCoordinate?: string;
  tags: AttestationTag[];
  text: string;
  timestamp: number;
  signature: string;
  eventId: string;
}

export interface RelayConfig {
  url: string;
  enabled: boolean;
}

export interface SyncStatus {
  relay: string;
  ok: boolean;
  message: string;
  at: string;
}

export type NostrImportStatus = 'pending' | 'imported' | 'rejected' | 'invalid';
export type DataSourceFilter = 'local' | 'synced' | 'combined';
export type TrustFilter = 'all' | 'trusted' | 'untrusted';
export type ListingDiscoveryScope = 'agoramesh-native' | 'all-nip99';
export type HiddenFilter = 'visible' | 'hidden' | 'all';
export type PublishObjectType = 'profile' | 'listing' | 'mediator' | 'reputation' | 'disputeOutcome' | 'communityList';
export type PublishStatus = 'accepted' | 'failed' | 'pending';
export type RelayScoreLabel = 'excellent' | 'healthy' | 'degraded' | 'offline';
export type SignerIdentityState = 'unavailable' | 'available' | 'connected' | 'connected-mismatch' | 'active-identity';

export interface SignerIdentityStatus {
  state: SignerIdentityState;
  signerPublicKey?: string;
  identityPublicKey?: string;
  message: string;
}

export interface RelayFetchSummary {
  relayUrl: string;
  ok: boolean;
  elapsedMs: number;
  received: number;
  duplicates: number;
  invalid: number;
  message: string;
}

export interface NostrTrustContact {
  publicKey: string;
  relayUrl?: string;
  petname?: string;
}

export interface NostrTrustRecord {
  ownerPublicKey: string;
  contacts: NostrTrustContact[];
  eventId: string;
  relayUrls: string[];
  createdAt: string;
  fetchedAt: string;
}

export interface WebOfTrustEntry {
  publicKey: string;
  distance: 0 | 1 | 2;
  paths: string[][];
  referencedBy: string[];
  contactCount: number;
  seed: boolean;
}

export interface MarketplaceRankReason {
  code: string;
  label: string;
}

export interface ReviewQueueFilter {
  status: 'all' | NostrImportStatus;
  encryption: 'all' | 'encrypted' | 'plain';
  trust: TrustFilter;
}

export interface NostrReviewItem {
  id: string;
  eventId: string;
  kind: number;
  relay: string;
  authorPublicKey: string;
  receivedAt: string;
  signatureValid: boolean;
  importStatus: NostrImportStatus;
  payloadPreview: string;
  rawEvent: string;
  discoveryScope?: ListingDiscoveryScope;
}

export interface SyncedPublicRecord<T> {
  id: string;
  eventId: string;
  kind: number;
  authorPublicKey: string;
  relayUrls: string[];
  receivedAt: string;
  importedAt: string;
  payload: T;
  trusted: boolean;
  hidden: boolean;
  rawEvent?: string;
  discoveryScope?: ListingDiscoveryScope;
}

export interface PublicDisputeOutcome {
  id: string;
  state: DisputeState;
  agreementHash: string;
  signerPublicKey: string;
  outcomeSummary: string;
  updatedAt: string;
}

export interface RelayHealth {
  url: string;
  enabled: boolean;
  lastConnectedAt?: string;
  lastError?: string;
  latencyMs?: number;
  eventsReceived: number;
  eventsPublished: number;
  consecutiveFailures: number;
}

export interface RelayScore {
  url: string;
  score: number;
  label: RelayScoreLabel;
  reasons: string[];
}

export type LightningPaymentAttemptStatus = 'invoice-created' | 'wallet-payment-pending' | 'paid' | 'receipt-found' | 'failed';
export type LightningPaymentPurpose = 'listing-payment' | 'operator-support';

export interface NwcConnection {
  id: string;
  label: string;
  walletPublicKey: string;
  clientPublicKey: string;
  relayUrls: string[];
  encryptedSecret: EncryptedSecret;
  lud16?: string;
  createdAt: string;
  updatedAt: string;
  lastConnectedAt?: string;
  lastError?: string;
}

export interface LightningPaymentAttempt {
  id: string;
  buyerPublicKey: string;
  sellerPublicKey: string;
  purpose?: LightningPaymentPurpose;
  badgeSubjectPublicKey?: string;
  listingId?: string;
  listingTitle?: string;
  amountSats: number;
  amountMsats: number;
  lnurlSource: string;
  callbackUrl: string;
  sellerWalletPubkey: string;
  zapRequestId: string;
  zapRequest: string;
  bolt11: string;
  paymentHash?: string;
  nwcConnectionId?: string;
  nwcRequestEventId?: string;
  nwcResponseEventId?: string;
  nwcRelayUrl?: string;
  nwcResult?: string;
  preimage?: string;
  feesPaidMsats?: number;
  statusDetail?: string;
  receiptEventId?: string;
  receiptEvent?: string;
  receiptRelayUrls: string[];
  status: LightningPaymentAttemptStatus;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface OperatorSupportReceipt {
  id: string;
  payerPublicKey: string;
  operatorLnurl: string;
  operatorWalletPubkey: string;
  amountMsats: number;
  minimumSats: number;
  zapRequestId: string;
  zapRequest: string;
  receiptEventId: string;
  receiptEvent: string;
  relayUrls: string[];
  paidAt: string;
  validatedAt: string;
}

export interface ListingZapReceipt {
  id: string;
  listingId: string;
  listingTitle?: string;
  listingCoordinate: string;
  sellerPublicKey: string;
  buyerPublicKey: string;
  lnurl: string;
  sellerWalletPubkey: string;
  amountMsats: number;
  zapRequestId: string;
  zapRequest: string;
  receiptEventId: string;
  receiptEvent: string;
  bolt11: string;
  relayUrls: string[];
  paidAt: string;
  validatedAt: string;
}

export type BuyerRequestOfferDirection = 'incoming' | 'outgoing';
export type BuyerRequestOfferStatus = 'sent' | 'received' | 'selected' | 'superseded';

export interface BuyerRequestOffer {
  id: string;
  requestListingId: string;
  requestCoordinate: string;
  requestTitle: string;
  buyerPublicKey: string;
  sellerPublicKey: string;
  amount: string;
  currency: string;
  fulfillmentNotes: string;
  timeline: string;
  paymentPreferences: PaymentPreference[];
  contactMethod?: ContactMethod;
  message: string;
  sourceEventIds: string[];
  sourceReceiptId?: string;
  sourceMessageId?: string;
  direction: BuyerRequestOfferDirection;
  status: BuyerRequestOfferStatus;
  createdAt: string;
  updatedAt: string;
  selectedAt?: string;
}

export type TradeRoomState = 'intent' | 'offer' | 'accepted' | 'payment-pending' | 'paid' | 'delivered' | 'confirmed' | 'reviewed';
export type TradeRoomPaymentState = 'none' | 'payment-pending' | 'paid' | 'receipt-found' | 'failed';
export type TradeRoomDeliveryState = 'none' | 'in-progress' | 'delivered' | 'confirmed';
export type TradeRoomDeliveryStatus = 'draft' | 'sent' | 'received' | 'confirmed';

export interface TradeRoom {
  id: string;
  buyerPublicKey: string;
  sellerPublicKey: string;
  buyerLabel?: string;
  sellerLabel?: string;
  mediator?: string;
  listingId?: string;
  listingCoordinate?: string;
  listingTitle?: string;
  agreementId?: string;
  agreementHash?: string;
  buyerRequestOfferId?: string;
  state: TradeRoomState;
  paymentState: TradeRoomPaymentState;
  deliveryState: TradeRoomDeliveryState;
  relatedPaymentAttemptIds: string[];
  relatedZapReceiptIds: string[];
  relatedMessageThreadIds: string[];
  lastMessageAt?: string;
  reviewedAt?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TradeRoomDelivery {
  id: string;
  roomId: string;
  senderPublicKey: string;
  fileName: string;
  fileHash: string;
  note: string;
  url?: string;
  sourceMessageId?: string;
  status: TradeRoomDeliveryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PublishReceipt {
  id: string;
  objectType: PublishObjectType;
  objectId: string;
  eventId: string;
  relayUrl: string;
  status: PublishStatus;
  message: string;
  at: string;
}

export type NostrContactContextType = 'listing' | 'profile' | 'mediator' | 'manual' | 'trade-room';
export type NostrContactReceiptStatus = 'accepted' | 'partial' | 'failed';

export interface NostrContactReceipt {
  id: string;
  senderPublicKey: string;
  recipientPublicKey: string;
  recipientNpub: string;
  contextType: NostrContactContextType;
  contextId?: string;
  contextTitle?: string;
  eventIds: string[];
  relayReceipts: SyncStatus[];
  status: NostrContactReceiptStatus;
  sentAt: string;
}

export type NostrMessageDirection = 'incoming' | 'outgoing';

export interface NostrMessageRecord {
  id: string;
  ownerPublicKey: string;
  eventId: string;
  wrapPublicKey: string;
  senderPublicKey: string;
  recipientPublicKey: string;
  counterpartPublicKey: string;
  direction: NostrMessageDirection;
  threadKey: string;
  subject?: string;
  contextType?: NostrContactContextType;
  contextId?: string;
  wrapCreatedAt: string;
  messageCreatedAt: string;
  receivedAt: string;
  relayUrls: string[];
  rawEvent: string;
  encryptedPlaintext: EncryptedSecret;
  read: boolean;
  archived: boolean;
}

export interface NostrMessageThread {
  id: string;
  ownerPublicKey: string;
  counterpartPublicKey: string;
  threadKey: string;
  subject?: string;
  contextType?: NostrContactContextType;
  contextId?: string;
  lastMessageAt: string;
  lastMessageId?: string;
  unreadCount: number;
  archived: boolean;
  updatedAt: string;
}

export interface NostrInboxCursor {
  id: string;
  ownerPublicKey: string;
  relayUrl: string;
  since: number;
  newestCreatedAt: number;
  lastFetchedAt: string;
}

export interface CommunityAllowlistEntry {
  id: string;
  publicKey: string;
  label: string;
  note: string;
  createdAt: string;
}

export interface CommunityAllowlistEnvelope {
  schemaVersion: 1;
  kind: 'community-allowlist';
  exportedAt: string;
  entries: Pick<CommunityAllowlistEntry, 'publicKey' | 'label' | 'note'>[];
}

export interface SyncedConflictGroup<T = unknown> {
  key: string;
  records: SyncedPublicRecord<T>[];
  preferredRecordId: string;
}

export interface SyncSettings {
  id: 'default';
  liveSyncEnabled: boolean;
  showDataSource: boolean;
  defaultBrowseSource: DataSourceFilter;
  listingDiscoveryScope: ListingDiscoveryScope;
}

export interface BlossomServerConfig {
  id: string;
  url: string;
  enabled: boolean;
  lastUploadAt?: string;
  lastError?: string;
}

export interface AppBackup {
  schemaVersion: 1;
  exportedAt: string;
  identity?: IdentityRecord;
  profile?: PublicProfile;
  listings: Listing[];
  agreements: Agreement[];
  agreementReceipts: AgreementAcceptanceReceipt[];
  mediators: MediatorProfile[];
  disputes: DisputeCase[];
  attestations: ReputationAttestation[];
  relays: RelayConfig[];
  nostrReview: NostrReviewItem[];
  publicProfiles: PublicProfile[];
  syncedProfiles: SyncedPublicRecord<PublicProfile>[];
  syncedListings: SyncedPublicRecord<Listing>[];
  syncedMediators: SyncedPublicRecord<MediatorProfile>[];
  syncedAttestations: SyncedPublicRecord<ReputationAttestation>[];
  syncedDisputeOutcomes: SyncedPublicRecord<PublicDisputeOutcome>[];
  communityLists: CommunityCurationList[];
  syncedCommunityLists: SyncedPublicRecord<CommunityCurationList>[];
  relayHealth: RelayHealth[];
  publishReceipts: PublishReceipt[];
  nostrContactReceipts: NostrContactReceipt[];
  nostrMessages: NostrMessageRecord[];
  nostrMessageThreads: NostrMessageThread[];
  nostrInboxCursors: NostrInboxCursor[];
  lightningPaymentAttempts: LightningPaymentAttempt[];
  operatorSupportReceipts: OperatorSupportReceipt[];
  listingZapReceipts: ListingZapReceipt[];
  buyerRequestOffers: BuyerRequestOffer[];
  tradeRooms: TradeRoom[];
  tradeRoomDeliveries: TradeRoomDelivery[];
  allowlist: CommunityAllowlistEntry[];
  syncSettings: SyncSettings[];
  blossomServers: BlossomServerConfig[];
}
