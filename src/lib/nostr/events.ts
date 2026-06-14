import { finalizeEvent, verifyEvent } from 'nostr-tools/pure';
import {
  appBackupSchema,
  communityCurationListSchema,
  listingSchema,
  listingCategorySchema,
  mediatorProfileSchema,
  publicDisputeOutcomeSchema,
  publicProfileSchema,
  reputationAttestationSchema,
  assertPublicPaymentIntentText
} from '../validation/schemas';
import type {
  AppBackup,
  CommunityAllowlistEntry,
  CommunityCurationList,
  DisputeCase,
  Listing,
  ListingDiscoveryScope,
  ListingImage,
  MediatorProfile,
  NostrProfileMetadata,
  NostrReviewItem,
  PublicDisputeOutcome,
  PublicProfile,
  PublishObjectType,
  PublishReceipt,
  ReputationAttestation,
  RelayConfig,
  SyncStatus,
  SyncedPublicRecord
} from '../../types/domain';
import { canonicalJson, newId, nowIso } from '../crypto/encoding';
import { decryptRelayContent, isEncryptedRelayContentEnvelope } from '../crypto/encryptedContent';
import { sha256Hex } from '../crypto/hash';
import { privateKeyBytes } from '../crypto/identity';
import { verifyAttestation } from '../crypto/attestations';
import { assertPublishablePayload } from '../security/publication';

export const AGORAMESH_EVENT_KINDS = {
  profile: 39001,
  listing: 30402,
  mediator: 39003,
  reputation: 39004,
  disputeOutcome: 39005,
  communityList: 30004
} as const;

type CacheablePayload =
  | PublicProfile
  | Listing
  | MediatorProfile
  | ReputationAttestation
  | PublicDisputeOutcome
  | CommunityCurationList;

const paymentPreferences = ['cash', 'bank', 'bitcoin', 'lightning', 'cashu', 'monero', 'barter', 'mutual-credit', 'other'] as const;
const paymentIntentMethods = ['bitcoin', 'lightning', 'cashu', 'monero', 'bank', 'cash', 'other'] as const;
const contactKinds = ['matrix', 'simplex', 'session', 'email', 'nostr', 'custom'] as const;
const fulfillmentTypes = ['local-pickup', 'shipping', 'delivery', 'digital', 'other'] as const;
const imageMimeTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;

function isListingCategory(value: string | undefined): value is (typeof listingCategorySchema.options)[number] {
  return Boolean(value && (listingCategorySchema.options as readonly string[]).includes(value));
}

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

interface AgoraRelayFilter {
  kinds: number[];
  authors?: string[];
  since?: number;
  until?: number;
  limit?: number;
  '#t'?: string[];
  '#client'?: string[];
}

interface NostrMetadataFilter {
  kinds: [0];
  authors: string[];
  limit: 1;
}

export type NostrLiveSubscription = () => void;

export interface NostrUnsignedEvent {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

function createdAtSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function isAgoraEventKind(kind: number): boolean {
  return Object.values(AGORAMESH_EVENT_KINDS).some((value) => value === kind);
}

function agorameshNonListingKinds(): number[] {
  return Object.values(AGORAMESH_EVENT_KINDS).filter((kind) => kind !== AGORAMESH_EVENT_KINDS.listing);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function publicProfilePayload(profile: PublicProfile): PublicProfile {
  const parsed = publicProfileSchema.parse(profile);
  assertPublicPaymentIntentText(parsed.lightningAddress ?? '', parsed.lnurl ?? '');
  const payload = {
    ...parsed,
    publicVisibility: true
  };
  assertPublishablePayload(payload);
  return payload;
}

export function publicListingPayload(listing: Listing): Listing {
  const parsed = listingSchema.parse(listing);

  assertPublicPaymentIntentText(`${parsed.price.amount} ${parsed.price.currency}`, parsed.price.note);

  for (const intent of parsed.paymentIntents ?? []) {
    assertPublicPaymentIntentText(intent.value, intent.note);
  }

  const payload: Listing = {
    ...parsed,
    visibility: 'public'
  };

  assertPublishablePayload(payload);
  return payload;
}

export function nostrCoordinate(kind: number, pubkey: string, identifier: string): string {
  return `${kind}:${pubkey}:${identifier}`;
}

function unixTimeFromIso(value?: string): string {
  const timestamp = value ? Math.floor(new Date(value).getTime() / 1000) : createdAtSeconds();
  return String(Number.isFinite(timestamp) ? timestamp : createdAtSeconds());
}

function isoFromUnixTag(value?: string, fallbackSeconds?: number): string {
  const seconds = Number(value ?? fallbackSeconds ?? createdAtSeconds());
  return new Date(Number.isFinite(seconds) ? seconds * 1000 : Date.now()).toISOString();
}

function nip99ListingTags(listing: Listing): string[][] {
  const priceTag = ['price', listing.price.amount, listing.price.currency.toUpperCase()];
  if (listing.price.frequency) priceTag.push(listing.price.frequency);
  return [
    ['d', listing.id],
    ['title', listing.title],
    ['published_at', unixTimeFromIso(listing.publishedAt ?? listing.createdAt)],
    ['location', listing.region],
    priceTag,
    ['status', listing.status],
    ['client', 'agoramesh'],
    ['t', 'agoramesh'],
    ['t', listing.type],
    ['t', listing.category],
    ...listing.tags.map((tag) => ['t', tag]),
    ['category', listing.category],
    ['listing_type', listing.type],
    ['expires_at', listing.expiresAt],
    ['contact', listing.contactMethod.kind, listing.contactMethod.value],
    ...listing.paymentPreferences.map((entry) => ['payment', entry]),
    ...(listing.paymentIntents ?? []).map((intent) => ['payment_intent', intent.method, intent.value, intent.note]),
    ...(listing.mediatorPreference ? [['mediator', listing.mediatorPreference]] : []),
    ...(listing.price.note ? [['price_note', listing.price.note]] : []),
    ...(listing.barterAccepted ? [['barter', 'accepted']] : []),
    ...(listing.images ?? []).map(nip99ImageTag)
  ];
}

function nip99ImageTag(image: ListingImage): string[] {
  const tag = [
    'image',
    image.url,
    image.altText ?? '',
    image.sha256 ?? '',
    image.mimeType ?? '',
    image.sizeBytes ? String(image.sizeBytes) : '',
    image.blossomServerUrl ?? '',
    image.uploadedAt ?? ''
  ];
  while (tag.length > 2 && tag[tag.length - 1] === '') tag.pop();
  return tag;
}

function supportedImageMimeType(value?: string): ListingImage['mimeType'] | undefined {
  return imageMimeTypes.includes(value as (typeof imageMimeTypes)[number]) ? (value as ListingImage['mimeType']) : undefined;
}

function parsePositiveInteger(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseDimensions(value?: string): { width?: number; height?: number } {
  const match = value?.match(/^(\d+)x(\d+)$/);
  if (!match) return {};
  return {
    width: parsePositiveInteger(match[1]),
    height: parsePositiveInteger(match[2])
  };
}

function imetaValue(tag: string[], name: string): string | undefined {
  const prefix = `${name} `;
  return tag
    .slice(1)
    .find((entry) => entry.startsWith(prefix))
    ?.slice(prefix.length);
}

function imageFromImageTag(event: NostrEvent, tag: string[], index: number): ListingImage | undefined {
  const url = tag[1] ?? '';
  if (!url.startsWith('https://')) return undefined;
  return {
    id: `image_${event.id}_${index}`,
    url,
    altText: tag[2] || undefined,
    sha256: /^[0-9a-f]{64}$/i.test(tag[3] ?? '') ? tag[3].toLowerCase() : undefined,
    mimeType: supportedImageMimeType(tag[4]),
    sizeBytes: parsePositiveInteger(tag[5]),
    blossomServerUrl: tag[6]?.startsWith('https://') ? tag[6] : undefined,
    uploadedAt: tag[7] || isoFromUnixTag(undefined, event.created_at)
  };
}

function imageFromImetaTag(event: NostrEvent, tag: string[], index: number): ListingImage | undefined {
  const url = imetaValue(tag, 'url') ?? '';
  if (!url.startsWith('https://')) return undefined;
  const dimensions = parseDimensions(imetaValue(tag, 'dim'));
  const sha256 = imetaValue(tag, 'x');
  const service = imetaValue(tag, 'service');
  return {
    id: `image_${event.id}_imeta_${index}`,
    url,
    altText: imetaValue(tag, 'alt'),
    sha256: /^[0-9a-f]{64}$/i.test(sha256 ?? '') ? sha256?.toLowerCase() : undefined,
    mimeType: supportedImageMimeType(imetaValue(tag, 'm')),
    sizeBytes: parsePositiveInteger(imetaValue(tag, 'size')),
    width: dimensions.width,
    height: dimensions.height,
    blossomServerUrl: service?.startsWith('https://') ? service : undefined,
    uploadedAt: isoFromUnixTag(undefined, event.created_at)
  };
}

function nip99ListingImages(event: NostrEvent): ListingImage[] {
  const images = [
    ...event.tags.filter((tag) => tag[0] === 'image').map((tag, index) => imageFromImageTag(event, tag, index)),
    ...event.tags.filter((tag) => tag[0] === 'imeta').map((tag, index) => imageFromImetaTag(event, tag, index))
  ].filter((image): image is ListingImage => Boolean(image));
  const seen = new Set<string>();
  return images.filter((image) => {
    if (seen.has(image.url)) return false;
    seen.add(image.url);
    return true;
  });
}

function parseNip99Listing(event: NostrEvent): Listing {
  if (!verifyNostrEvent(event)) {
    throw new Error('Invalid Nostr event signature.');
  }
  if (event.kind !== AGORAMESH_EVENT_KINDS.listing) {
    throw new Error('Expected NIP-99 classified listing event.');
  }

  const id = firstTag(event, 'd');
  const title = firstTag(event, 'title');
  if (!id || !title) {
    throw new Error('NIP-99 listing requires d and title tags.');
  }
  const priceTag = event.tags.find((tag) => tag[0] === 'price') ?? [];
  const contactTag = event.tags.find((tag) => tag[0] === 'contact') ?? [];
  const tags = tagValues(event, 't').filter((tag) => tag !== 'agoramesh' && tag !== 'offer' && tag !== 'request' && !isListingCategory(tag));
  const categoryTag = firstTag(event, 'category') ?? tagValues(event, 't').find((tag) => isListingCategory(tag));
  const typeTag = firstTag(event, 'listing_type') ?? tagValues(event, 't').find((tag) => tag === 'offer' || tag === 'request');
  const paymentTags = tagValues(event, 'payment').filter((tag): tag is (typeof paymentPreferences)[number] =>
    paymentPreferences.includes(tag as (typeof paymentPreferences)[number])
  );
  const paymentIntents = event.tags
    .filter((tag) => tag[0] === 'payment_intent')
    .map((tag, index) => ({
      id: `payment_${event.id}_${index}`,
      method: paymentIntentMethods.includes(tag[1] as (typeof paymentIntentMethods)[number])
        ? (tag[1] as (typeof paymentIntentMethods)[number])
        : 'other',
      value: tag[2] ?? '',
      note: tag[3] ?? ''
    }))
    .filter((intent) => intent.value);
  const contactKind = contactKinds.includes(contactTag[1] as (typeof contactKinds)[number]) ? contactTag[1] : 'custom';
  const fulfillmentTag = firstTag(event, 'fulfillment');
  const fulfillmentType = fulfillmentTypes.includes(fulfillmentTag as (typeof fulfillmentTypes)[number])
    ? fulfillmentTag
    : undefined;

  return listingSchema.parse({
    id,
    authorPublicKey: event.pubkey,
    title,
    type: typeTag === 'request' ? 'request' : 'offer',
    category: isListingCategory(categoryTag) ? categoryTag : 'other-peaceful-services',
    description: event.content,
    region: firstTag(event, 'location') ?? '',
    status: firstTag(event, 'status') === 'sold' ? 'sold' : firstTag(event, 'status') === 'deleted' ? 'deleted' : 'active',
    price: {
      amount: priceTag[1] ?? '0',
      currency: (priceTag[2] ?? 'FREE').toUpperCase(),
      frequency: priceTag[3],
      note: firstTag(event, 'price_note')
    },
    publishedAt: isoFromUnixTag(firstTag(event, 'published_at'), event.created_at),
    paymentPreferences: paymentTags.length > 0 ? paymentTags : ['other'],
    paymentIntents,
    images: nip99ListingImages(event),
    fulfillmentType,
    fulfillmentNotes: firstTag(event, 'fulfillment_note'),
    barterAccepted: firstTag(event, 'barter') === 'accepted' || paymentTags.includes('barter'),
    tags,
    expiresAt: firstTag(event, 'expires_at') ?? new Date((event.created_at + 90 * 86_400) * 1000).toISOString().slice(0, 10),
    contactMethod: {
      id: `contact_${event.id}`,
      kind: contactKind,
      value: contactTag[2] ?? `nostr:${event.pubkey}`
    },
    mediatorPreference: firstTag(event, 'mediator'),
    visibility: 'public',
    createdAt: isoFromUnixTag(undefined, event.created_at),
    updatedAt: isoFromUnixTag(undefined, event.created_at)
  });
}

export function communityCurationListPayload(list: CommunityCurationList): CommunityCurationList {
  const payload = communityCurationListSchema.parse(list);
  assertPublishablePayload(payload);
  return payload;
}

export function publicMediatorPayload(profile: MediatorProfile): MediatorProfile {
  const payload = mediatorProfileSchema.parse(profile);
  assertPublishablePayload(payload);
  return payload;
}

export function publicReputationPayload(attestation: ReputationAttestation): ReputationAttestation {
  const payload = reputationAttestationSchema.parse(attestation);
  if (!verifyAttestation(payload)) {
    throw new Error('Reputation attestation signature is invalid.');
  }
  assertPublishablePayload(payload);
  return payload;
}

export function publicDisputeOutcomePayload(dispute: DisputeCase, signerPublicKey: string): PublicDisputeOutcome {
  if (!dispute.publishOutcomeAttestation || !dispute.outcomeSummary) {
    throw new Error('Dispute outcome publication requires explicit opt-in and an outcome summary.');
  }

  const payload = {
    id: dispute.id,
    state: dispute.state,
    agreementHash: dispute.agreementHash,
    signerPublicKey,
    outcomeSummary: dispute.outcomeSummary,
    updatedAt: dispute.updatedAt
  };
  const parsed = publicDisputeOutcomeSchema.parse(payload);
  assertPublishablePayload(parsed);
  return parsed;
}

export function signPublicProfile(profile: PublicProfile, privateKeyHex: string): NostrEvent {
  return signEvent(AGORAMESH_EVENT_KINDS.profile, publicProfilePayload(profile).publicKey, [['d', profile.id]], publicProfilePayload(profile), privateKeyHex);
}

export function signListing(listing: Listing, privateKeyHex: string): NostrEvent {
  const payload = publicListingPayload(listing);
  return signEventWithContent(AGORAMESH_EVENT_KINDS.listing, listing.authorPublicKey, nip99ListingTags(payload), payload.description, privateKeyHex);
}

export function unsignedListing(listing: Listing): NostrUnsignedEvent {
  const payload = publicListingPayload(listing);
  return unsignedEventWithContent(AGORAMESH_EVENT_KINDS.listing, nip99ListingTags(payload), payload.description);
}

export function signMediator(profile: MediatorProfile, privateKeyHex: string): NostrEvent {
  return signEvent(AGORAMESH_EVENT_KINDS.mediator, profile.publicKey, [['d', profile.id]], publicMediatorPayload(profile), privateKeyHex);
}

export function signReputation(attestation: ReputationAttestation, privateKeyHex: string): NostrEvent {
  const tags: string[][] = [
    ['d', attestation.id],
    ['p', attestation.subjectPublicKey],
    ...(attestation.agreementHash ? [['agreement', attestation.agreementHash]] : []),
    ...(attestation.listingCoordinate ? [['a', attestation.listingCoordinate]] : []),
    ...(attestation.score ? [['score', String(attestation.score)]] : [])
  ];
  return signEvent(
    AGORAMESH_EVENT_KINDS.reputation,
    attestation.reviewerPublicKey,
    tags,
    publicReputationPayload(attestation),
    privateKeyHex
  );
}

export function signDisputeOutcome(dispute: DisputeCase, signerPublicKey: string, privateKeyHex: string): NostrEvent {
  return signEvent(
    AGORAMESH_EVENT_KINDS.disputeOutcome,
    signerPublicKey,
    [
      ['d', dispute.id],
      ['agreement', dispute.agreementHash]
    ],
    publicDisputeOutcomePayload(dispute, signerPublicKey),
    privateKeyHex
  );
}

export function signCommunityCurationList(list: CommunityCurationList, privateKeyHex: string): NostrEvent {
  return signEvent(
    AGORAMESH_EVENT_KINDS.communityList,
    list.authorPublicKey,
    [
      ['d', list.id],
      ['title', list.title],
      ...list.referencedCoordinates.map((coordinate) => ['a', coordinate])
    ],
    communityCurationListPayload(list),
    privateKeyHex
  );
}

function signEvent(kind: number, pubkey: string, tags: string[][], payload: unknown, privateKeyHex: string): NostrEvent {
  assertPublishablePayload(payload);
  return signEventWithContent(kind, pubkey, tags, canonicalJson({ app: 'agoramesh', version: 1, payload }), privateKeyHex);
}

export function unsignedEventWithContent(kind: number, tags: string[][], content: string): NostrUnsignedEvent {
  return {
    kind,
    created_at: createdAtSeconds(),
    tags: [['client', 'agoramesh'], ...tags],
    content
  };
}

export function unsignedAgoraEvent(kind: number, tags: string[][], payload: unknown): NostrUnsignedEvent {
  assertPublishablePayload(payload);
  return unsignedEventWithContent(kind, tags, canonicalJson({ app: 'agoramesh', version: 1, payload }));
}

function signEventWithContent(kind: number, pubkey: string, tags: string[][], content: string, privateKeyHex: string): NostrEvent {
  const template = unsignedEventWithContent(kind, tags, content);
  const signed = finalizeEvent(template, privateKeyBytes(privateKeyHex));
  if (signed.pubkey !== pubkey) {
    throw new Error('Signing key does not match the expected public key.');
  }
  return signed;
}

export function verifyNostrEvent(event: NostrEvent): boolean {
  return verifyEvent(event);
}

export function profileFromNostrMetadata(metadata: unknown): NostrProfileMetadata {
  const parsed = typeof metadata === 'string' ? parseJsonRecord(metadata) : metadata;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Expected Nostr profile metadata object.');
  }
  const record = parsed as Record<string, unknown>;
  return {
    name: typeof record.name === 'string' ? record.name.slice(0, 80) : undefined,
    displayName: typeof record.display_name === 'string' ? record.display_name.slice(0, 80) : typeof record.displayName === 'string' ? record.displayName.slice(0, 80) : undefined,
    about: typeof record.about === 'string' ? record.about.slice(0, 500) : undefined,
    picture: typeof record.picture === 'string' ? record.picture.slice(0, 500) : undefined,
    lud06: typeof record.lud06 === 'string' ? record.lud06.slice(0, 500) : undefined,
    lud16: typeof record.lud16 === 'string' ? record.lud16.slice(0, 120) : undefined
  };
}

export function publicProfileFromNostrMetadata(metadata: NostrProfileMetadata, identity: Pick<PublicProfile, 'id' | 'publicKey'> & { displayName: string }): Partial<PublicProfile> {
  const picture = sanitizeMetadataText(metadata.picture ?? '', 500);
  return {
    displayName: sanitizeMetadataText(metadata.displayName ?? metadata.name ?? identity.displayName, 80),
    publicKey: identity.publicKey,
    avatarUrl: picture.startsWith('https://') ? picture : '',
    lnurl: sanitizeMetadataText(metadata.lud06 ?? '', 500),
    lightningAddress: sanitizeMetadataText(metadata.lud16 ?? '', 120),
    bio: sanitizeMetadataText(metadata.about ?? '', 500)
  };
}

function sanitizeMetadataText(value: string, max: number): string {
  return value.replace(/[<>]/g, '').trim().slice(0, max);
}

export function parseAgoraEventPayload(event: NostrEvent): unknown {
  if (!verifyNostrEvent(event)) {
    throw new Error('Invalid Nostr event signature.');
  }

  if (event.kind === AGORAMESH_EVENT_KINDS.listing) {
    return parseNip99Listing(event);
  }

  const parsed = parseAgoraEventEnvelope(event);
  return parsed.payload;
}

function firstTag(event: NostrEvent, name: string): string | undefined {
  return event.tags.find((tag) => tag[0] === name)?.[1];
}

function tagValues(event: NostrEvent, name: string): string[] {
  return event.tags.filter((tag) => tag[0] === name).map((tag) => tag[1]);
}

function requireTag(event: NostrEvent, name: string, expected: string): void {
  if (firstTag(event, name) !== expected) {
    throw new Error(`Nostr event tag ${name} does not match the signed payload.`);
  }
}

function requireOptionalTag(event: NostrEvent, name: string, expected?: string): void {
  const actual = firstTag(event, name);
  if (expected && actual !== expected) {
    throw new Error(`Nostr event tag ${name} does not match the signed payload.`);
  }
  if (!expected && actual) {
    throw new Error(`Nostr event tag ${name} is not present in the signed payload.`);
  }
}

function requireTagSet(event: NostrEvent, name: string, expected: string[]): void {
  const actual = [...tagValues(event, name)].sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((value, index) => value !== wanted[index])) {
    throw new Error(`Nostr event tags ${name} do not match the signed payload.`);
  }
}

function validateAgoraEventTags(event: NostrEvent, payload: unknown): void {
  if (event.kind === AGORAMESH_EVENT_KINDS.profile) {
    const profile = publicProfileSchema.parse(payload);
    requireTag(event, 'd', profile.id);
  }
  if (event.kind === AGORAMESH_EVENT_KINDS.listing) {
    const listing = listingSchema.parse(payload);
    requireTag(event, 'd', listing.id);
    requireTag(event, 'title', listing.title);
    const priceTag = event.tags.find((tag) => tag[0] === 'price') ?? [];
    if (
      priceTag.length > 0 &&
      (priceTag[1] !== listing.price.amount || (priceTag[2] ?? '').toLowerCase() !== listing.price.currency.toLowerCase())
    ) {
      throw new Error('Nostr event price tag does not match the signed payload.');
    }
  }
  if (event.kind === AGORAMESH_EVENT_KINDS.mediator) {
    const mediator = mediatorProfileSchema.parse(payload);
    requireTag(event, 'd', mediator.id);
  }
  if (event.kind === AGORAMESH_EVENT_KINDS.reputation) {
    const attestation = reputationAttestationSchema.parse(payload);
    requireTag(event, 'd', attestation.id);
    requireTag(event, 'p', attestation.subjectPublicKey);
    requireOptionalTag(event, 'agreement', attestation.agreementHash);
    requireOptionalTag(event, 'a', attestation.listingCoordinate);
    requireOptionalTag(event, 'score', attestation.score ? String(attestation.score) : undefined);
  }
  if (event.kind === AGORAMESH_EVENT_KINDS.disputeOutcome) {
    const outcome = publicDisputeOutcomeSchema.parse(payload);
    requireTag(event, 'd', outcome.id);
    requireTag(event, 'agreement', outcome.agreementHash);
  }
  if (event.kind === AGORAMESH_EVENT_KINDS.communityList) {
    const list = communityCurationListSchema.parse(payload);
    requireTag(event, 'd', list.id);
    requireTag(event, 'title', list.title);
    requireTagSet(event, 'a', list.referencedCoordinates);
  }
}

function parseAgoraEventEnvelope(event: NostrEvent): Record<string, unknown> {
  const parsed = parseJsonRecord(event.content);
  if (parsed.app !== 'agoramesh' || parsed.version !== 1) {
    throw new Error('Unsupported AgoraMesh event.');
  }
  return parsed;
}

export function isAgoraMeshEvent(event: NostrEvent): boolean {
  if (!isAgoraEventKind(event.kind)) return false;
  try {
    if (event.kind === AGORAMESH_EVENT_KINDS.listing) {
      parseNip99Listing(event);
      return true;
    }
    const parsed = parseJsonRecord(event.content);
    if (isEncryptedRelayContentEnvelope(parsed)) return true;
    parseAgoraEventEnvelope(event);
    return true;
  } catch {
    return false;
  }
}

export function parseNostrEvent(value: unknown): NostrEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected Nostr event object.');
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    typeof record.pubkey !== 'string' ||
    typeof record.created_at !== 'number' ||
    typeof record.kind !== 'number' ||
    !isUnknownArray(record.tags) ||
    typeof record.content !== 'string' ||
    typeof record.sig !== 'string'
  ) {
    throw new Error('Malformed Nostr event.');
  }
  return {
    id: record.id,
    pubkey: record.pubkey,
    created_at: record.created_at,
    kind: record.kind,
    tags: record.tags.filter(isUnknownArray).map((tag) => tag.map(String)),
    content: record.content,
    sig: record.sig
  };
}

function parseJsonRecord(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Expected a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

export async function publishToRelays(event: NostrEvent, relays: RelayConfig[]): Promise<SyncStatus[]> {
  const enabled = relays.filter((relay) => relay.enabled);
  const statuses = await Promise.all(enabled.map((relay) => publishToRelay(event, relay.url)));
  return statuses.length > 0
    ? statuses
    : [{ relay: 'local', ok: false, message: 'No enabled relays configured.', at: new Date().toISOString() }];
}

export async function fetchNostrProfileMetadata(relays: RelayConfig[], publicKey: string): Promise<NostrProfileMetadata | undefined> {
  const enabled = relays.filter((relay) => relay.enabled);
  const events = (
    await Promise.all(
      enabled.map((relay) =>
        fetchNostrProfileMetadataFromRelay(relay.url, publicKey).catch(() => undefined)
      )
    )
  )
    .filter((event): event is NostrEvent => Boolean(event))
    .filter((event) => event.pubkey.toLowerCase() === publicKey.toLowerCase() && verifyNostrEvent(event))
    .sort((left, right) => right.created_at - left.created_at);

  const newest = events[0];
  return newest ? profileFromNostrMetadata(newest.content) : undefined;
}

export function publishReceiptsFromStatuses(
  objectType: PublishObjectType,
  objectId: string,
  eventId: string,
  statuses: SyncStatus[]
): PublishReceipt[] {
  return statuses.map((status) => ({
    id: `receipt_${eventId}_${sha256Hex(status.relay).slice(0, 16)}`,
    objectType,
    objectId,
    eventId,
    relayUrl: status.relay,
    status: status.ok ? 'accepted' : 'failed',
    message: status.message,
    at: status.at
  }));
}

export function buildAgoraRelayFilter(since?: number, limit = 80): AgoraRelayFilter {
  return {
    kinds: Object.values(AGORAMESH_EVENT_KINDS),
    limit,
    ...(since ? { since } : {})
  };
}

export function buildAgoraRelayFilters(
  listingDiscoveryScope: ListingDiscoveryScope = 'agoramesh-native',
  since?: number,
  limit = 80
): AgoraRelayFilter[] {
  const base = since ? { since } : {};
  const listingLimit = Math.max(limit, 300);

  if (listingDiscoveryScope === 'all-nip99') {
    return [
      {
        kinds: [AGORAMESH_EVENT_KINDS.listing],
        limit: listingLimit,
        ...base
      },
      {
        kinds: agorameshNonListingKinds(),
        limit,
        ...base
      }
    ];
  }

  return [
    {
      kinds: [AGORAMESH_EVENT_KINDS.listing],
      '#t': ['agoramesh'],
      limit: listingLimit,
      ...base
    },
    {
      kinds: [AGORAMESH_EVENT_KINDS.listing],
      '#client': ['agoramesh'],
      limit: listingLimit,
      ...base
    },
    {
      kinds: agorameshNonListingKinds(),
      limit,
      ...base
    }
  ];
}

export function isAgoraMeshNativeListingEvent(event: NostrEvent): boolean {
  if (event.kind !== AGORAMESH_EVENT_KINDS.listing) return false;
  return event.tags.some((tag) => {
    const name = tag[0]?.toLowerCase();
    const value = tag[1]?.toLowerCase();
    return (name === 't' && value === 'agoramesh') || (name === 'client' && value === 'agoramesh');
  });
}

export function isoToNostrTimestamp(value?: string): number | undefined {
  if (!value) return undefined;
  const timestamp = Math.floor(new Date(value).getTime() / 1000);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export async function fetchAgoraEventsFromRelays(
  relays: RelayConfig[],
  sinceByRelay: Record<string, number | undefined> = {},
  listingDiscoveryScope: ListingDiscoveryScope = 'agoramesh-native'
): Promise<NostrReviewItem[]> {
  const enabled = relays.filter((relay) => relay.enabled);
  const batches = await Promise.all(enabled.map((relay) => fetchAgoraEventsFromRelay(relay.url, sinceByRelay[relay.url], listingDiscoveryScope)));
  return dedupeReviewItems(batches.flat());
}

export function dedupeReviewItems(items: NostrReviewItem[], existingEventIds: string[] = []): NostrReviewItem[] {
  const seen = new Set(existingEventIds);
  const deduped: NostrReviewItem[] = [];
  for (const item of items) {
    if (seen.has(item.eventId)) continue;
    seen.add(item.eventId);
    deduped.push(item);
  }
  return deduped;
}

export function reviewItemFromEvent(
  event: NostrEvent,
  relay: string,
  listingDiscoveryScope: ListingDiscoveryScope = 'agoramesh-native'
): NostrReviewItem {
  let signatureValid = false;
  let importStatus: NostrReviewItem['importStatus'] = 'invalid';
  let payloadPreview = 'Invalid or unsupported AgoraMesh event.';
  let discoveryScope: ListingDiscoveryScope | undefined = event.kind === AGORAMESH_EVENT_KINDS.listing ? listingDiscoveryScope : undefined;

  try {
    signatureValid = verifyNostrEvent(event);
    if (signatureValid && event.kind === AGORAMESH_EVENT_KINDS.listing && isAgoraMeshNativeListingEvent(event)) {
      discoveryScope = 'agoramesh-native';
    }
    const encrypted = signatureValid ? encryptedRelayContentFromEvent(event) : undefined;
    if (encrypted && event.kind === AGORAMESH_EVENT_KINDS.listing) {
      payloadPreview = 'Encrypted listing relay content is not valid NIP-99 marketplace discovery.';
    } else if (
      signatureValid &&
      event.kind === AGORAMESH_EVENT_KINDS.listing &&
      listingDiscoveryScope === 'agoramesh-native' &&
      !isAgoraMeshNativeListingEvent(event)
    ) {
      payloadPreview = 'NIP-99 classified listing is outside the current AgoraMesh-native discovery scope.';
    } else if (encrypted) {
      payloadPreview = 'Encrypted AgoraMesh relay content. Import requires the shared passphrase.';
      importStatus = 'pending';
    } else if (signatureValid && isAgoraMeshEvent(event)) {
      const payload = parseAgoraEventPayload(event);
      payloadPreview = JSON.stringify(payload, null, 2).slice(0, 5000);
      importStatus = 'pending';
    } else if (signatureValid && isAgoraEventKind(event.kind)) {
      payloadPreview = 'Unsupported non-AgoraMesh event using an AgoraMesh kind.';
    }
  } catch (error) {
    payloadPreview = error instanceof Error ? error.message : 'Invalid event.';
  }

  return {
    id: `review_${event.id}`,
    eventId: event.id,
    kind: event.kind,
    relay,
    authorPublicKey: /^[0-9a-f]{64}$/i.test(event.pubkey) ? event.pubkey : 'unknown',
    receivedAt: nowIso(),
    signatureValid,
    importStatus,
    payloadPreview,
    rawEvent: JSON.stringify(event),
    discoveryScope
  };
}

function encryptedRelayContentFromEvent(event: NostrEvent): unknown {
  try {
    const parsed = parseJsonRecord(event.content);
    return isEncryptedRelayContentEnvelope(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function reviewItemHasEncryptedContent(item: NostrReviewItem): boolean {
  try {
    const rawEvent: unknown = JSON.parse(item.rawEvent);
    const event = parseNostrEvent(rawEvent);
    return Boolean(encryptedRelayContentFromEvent(event));
  } catch {
    return false;
  }
}

export function reviewItemFromMalformed(rawMessage: string, relay: string, message: string): NostrReviewItem {
  return {
    id: newId('review_invalid'),
    eventId: `malformed_${sha256Hex(rawMessage).slice(0, 24)}`,
    kind: 0,
    relay,
    authorPublicKey: 'unknown',
    receivedAt: nowIso(),
    signatureValid: false,
    importStatus: 'invalid',
    payloadPreview: message,
    rawEvent: rawMessage
  };
}

export async function importablePayloadFromReviewItem(
  item: NostrReviewItem,
  passphrase = ''
): Promise<PublicProfile | Listing | MediatorProfile | ReputationAttestation | PublicDisputeOutcome | CommunityCurationList> {
  if (!item.signatureValid || item.importStatus !== 'pending') {
    throw new Error('Only valid pending review items can be imported.');
  }
  const rawEvent: unknown = JSON.parse(item.rawEvent);
  const event = parseNostrEvent(rawEvent);
  if (!verifyNostrEvent(event)) {
    throw new Error('Invalid Nostr event signature.');
  }
  const encrypted = encryptedRelayContentFromEvent(event);
  if (event.kind === AGORAMESH_EVENT_KINDS.listing && encrypted) {
    throw new Error('Encrypted listing relay content is not valid NIP-99 marketplace discovery.');
  }
  const payload = encrypted ? await decryptRelayContent(encrypted, passphrase) : parseAgoraEventPayload(event);
  validateAgoraEventTags(event, payload);

  if (event.kind === AGORAMESH_EVENT_KINDS.profile) {
    const profile = publicProfileSchema.parse(payload);
    if (profile.publicKey !== event.pubkey) throw new Error('Profile payload author does not match event signer.');
    return profile;
  }
  if (event.kind === AGORAMESH_EVENT_KINDS.listing) {
    const listing = listingSchema.parse(payload);
    if (listing.authorPublicKey !== event.pubkey) throw new Error('Listing payload author does not match event signer.');
    return listing;
  }
  if (event.kind === AGORAMESH_EVENT_KINDS.mediator) {
    const mediator = mediatorProfileSchema.parse(payload);
    if (mediator.publicKey !== event.pubkey) throw new Error('Mediator payload author does not match event signer.');
    return mediator;
  }
  if (event.kind === AGORAMESH_EVENT_KINDS.reputation) {
    const attestation = reputationAttestationSchema.parse(payload);
    if (attestation.reviewerPublicKey !== event.pubkey) throw new Error('Reputation payload author does not match event signer.');
    if (!verifyAttestation(attestation)) throw new Error('Reputation attestation signature is invalid.');
    return attestation;
  }
  if (event.kind === AGORAMESH_EVENT_KINDS.disputeOutcome) {
    const outcome = publicDisputeOutcomeSchema.parse(payload);
    if (outcome.signerPublicKey !== event.pubkey) throw new Error('Dispute outcome payload signer does not match event signer.');
    return outcome;
  }
  if (event.kind === AGORAMESH_EVENT_KINDS.communityList) {
    const list = communityCurationListSchema.parse(payload);
    if (list.authorPublicKey !== event.pubkey) throw new Error('Community list payload author does not match event signer.');
    return list;
  }

  throw new Error('This event kind is not importable.');
}

export function syncedRecordFromReviewItem<T extends CacheablePayload>(
  item: NostrReviewItem,
  allowlist: CommunityAllowlistEntry[],
  payload: T
): SyncedPublicRecord<T> {
  const trusted = allowlist.some(
    (entry) => entry.publicKey.toLowerCase() === item.authorPublicKey.toLowerCase()
  );

  return {
    id: `synced_${item.eventId}`,
    eventId: item.eventId,
    kind: item.kind,
    authorPublicKey: item.authorPublicKey,
    relayUrls: [item.relay],
    receivedAt: item.receivedAt,
    importedAt: nowIso(),
    trusted,
    hidden: false,
    rawEvent: item.rawEvent,
    discoveryScope: item.kind === AGORAMESH_EVENT_KINDS.listing ? item.discoveryScope : undefined,
    payload
  };
}

export function subscribeToAgoraEvents(
  relays: RelayConfig[],
  onItem: (item: NostrReviewItem) => void,
  sinceByRelay: Record<string, number | undefined> = {},
  onStatus?: (status: SyncStatus) => void,
  listingDiscoveryScope: ListingDiscoveryScope = 'agoramesh-native'
): NostrLiveSubscription {
  const sockets = relays
    .filter((relay) => relay.enabled)
    .map((relay) => {
      const socket = new WebSocket(relay.url);
      const subscriptionId = newId('live');
      socket.onopen = () => {
        socket.send(JSON.stringify(['REQ', subscriptionId, ...buildAgoraRelayFilters(listingDiscoveryScope, sinceByRelay[relay.url], 200)]));
        onStatus?.({ relay: relay.url, ok: true, message: 'Live subscription connected.', at: nowIso() });
      };
      socket.onmessage = (message) => {
        const raw = String(message.data);
        try {
          const parsed: unknown = JSON.parse(raw);
          if (!isUnknownArray(parsed)) return;
          if (parsed[0] === 'EVENT' && parsed[1] === subscriptionId) {
            const event = parseNostrEvent(parsed[2]);
            if (isAgoraEventKind(event.kind)) {
              onItem(reviewItemFromEvent(event, relay.url, listingDiscoveryScope));
            }
          }
        } catch (error) {
          onItem(reviewItemFromMalformed(raw, relay.url, error instanceof Error ? error.message : 'Malformed relay message.'));
        }
      };
      socket.onerror = () => {
        onStatus?.({ relay: relay.url, ok: false, message: 'Relay connection failed.', at: nowIso() });
      };
      return socket;
    });

  return () => sockets.forEach((socket) => socket.close());
}

function fetchAgoraEventsFromRelay(
  relay: string,
  since?: number,
  listingDiscoveryScope: ListingDiscoveryScope = 'agoramesh-native'
): Promise<NostrReviewItem[]> {
  return new Promise((resolve) => {
    const socket = new WebSocket(relay);
    const subscriptionId = newId('sync');
    const items: NostrReviewItem[] = [];
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      socket.close();
      resolve(items);
    };
    const timeout = window.setTimeout(finish, 9000);

    socket.onopen = () => {
      socket.send(
        JSON.stringify([
          'REQ',
          subscriptionId,
          ...buildAgoraRelayFilters(listingDiscoveryScope, since)
        ])
      );
    };
    socket.onerror = () => {
      window.clearTimeout(timeout);
      finish();
    };
    socket.onmessage = (message) => {
      const raw = String(message.data);
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!isUnknownArray(parsed)) return;
        if (parsed[0] === 'EVENT' && parsed[1] === subscriptionId) {
          const event = parseNostrEvent(parsed[2]);
          if (isAgoraEventKind(event.kind)) {
            items.push(reviewItemFromEvent(event, relay, listingDiscoveryScope));
          }
        }
        if (parsed[0] === 'EOSE' && parsed[1] === subscriptionId) {
          window.clearTimeout(timeout);
          finish();
        }
      } catch (error) {
        items.push(reviewItemFromMalformed(raw, relay, error instanceof Error ? error.message : 'Malformed relay message.'));
      }
    };
  });
}

function fetchNostrProfileMetadataFromRelay(relay: string, publicKey: string): Promise<NostrEvent | undefined> {
  return new Promise((resolve) => {
    const socket = new WebSocket(relay);
    const subscriptionId = newId('metadata');
    const filter: NostrMetadataFilter = { kinds: [0], authors: [publicKey], limit: 1 };
    let resolved = false;
    const finish = (event?: NostrEvent) => {
      if (resolved) return;
      resolved = true;
      socket.close();
      resolve(event);
    };
    const timeout = globalThis.setTimeout(() => finish(), 6000);
    socket.onopen = () => {
      socket.send(JSON.stringify(['REQ', subscriptionId, filter]));
    };
    socket.onmessage = (message) => {
      try {
        const parsed: unknown = JSON.parse(String(message.data));
        if (!isUnknownArray(parsed)) return;
        if (parsed[0] === 'EVENT' && parsed[1] === subscriptionId) {
          const event = parseNostrEvent(parsed[2]);
          if (event.kind === 0 && event.pubkey.toLowerCase() === publicKey.toLowerCase() && verifyNostrEvent(event)) {
            globalThis.clearTimeout(timeout);
            finish(event);
          }
        }
        if (parsed[0] === 'EOSE' && parsed[1] === subscriptionId) {
          globalThis.clearTimeout(timeout);
          finish();
        }
      } catch {
        globalThis.clearTimeout(timeout);
        finish();
      }
    };
    socket.onerror = () => {
      globalThis.clearTimeout(timeout);
      finish();
    };
  });
}

function publishToRelay(event: NostrEvent, relay: string): Promise<SyncStatus> {
  return new Promise((resolve) => {
    const socket = new WebSocket(relay);
    const done = (ok: boolean, message: string): void => {
      socket.close();
      resolve({ relay, ok, message, at: new Date().toISOString() });
    };
    const timeout = window.setTimeout(() => done(false, 'Relay timed out.'), 8000);

    socket.onopen = () => {
      socket.send(JSON.stringify(['EVENT', event]));
    };
    socket.onerror = () => {
      window.clearTimeout(timeout);
      done(false, 'Relay connection failed.');
    };
    socket.onmessage = (message) => {
      window.clearTimeout(timeout);
      const parsed: unknown = JSON.parse(String(message.data));
      const data = isUnknownArray(parsed) ? parsed : [];
      if (data[0] === 'OK') {
        done(Boolean(data[2]), String(data[3] ?? 'Relay accepted event.'));
      }
    };
  });
}

export function validateBackup(raw: unknown): AppBackup {
  return appBackupSchema.parse(raw);
}
