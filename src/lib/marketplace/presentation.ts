import type {
  CommunityAllowlistEntry,
  ContactMethod,
  Listing,
  ListingFulfillmentType,
  PaymentIntentMethod,
  PaymentPreference,
  PublicProfile,
  ReputationAttestation,
  SyncedPublicRecord
} from '../../types/domain';
import { listingCategorySchema } from '../validation/schemas';

export type Translate = (key: string) => string;

export interface SellerSummary {
  displayName: string;
  avatarUrl?: string;
  publicKey: string;
  shortKey: string;
  region?: string;
  languages: string[];
  skills: string[];
  contactMethods: ContactMethod[];
  mediatorAvailable: boolean;
  trusted: boolean;
  reputationCount: number;
  reputationTags: string[];
  verified: false;
}

export const fulfillmentTypes: ListingFulfillmentType[] = ['local-pickup', 'shipping', 'delivery', 'digital', 'other'];

export function categoryLabel(categoryId: string, t: Translate): string {
  return t(`category.${categoryId}`);
}

export function paymentBadgeLabel(method: PaymentPreference | PaymentIntentMethod | string, t: Translate): string {
  return t(`payment.${method}`);
}

export function fulfillmentBadgeForListing(listing: Pick<Listing, 'fulfillmentType'>, t: Translate): string {
  return listing.fulfillmentType ? t(`fulfillment.${listing.fulfillmentType}`) : t('fulfillment.unspecified');
}

export function paymentMatchesListing(listing: Listing, payment: string): boolean {
  if (payment === 'all') return true;
  return listing.paymentPreferences.includes(payment as PaymentPreference) || (listing.paymentIntents ?? []).some((intent) => intent.method === payment);
}

export function fulfillmentMatchesListing(listing: Listing, fulfillment: string): boolean {
  if (fulfillment === 'all') return true;
  return listing.fulfillmentType === fulfillment;
}

export function sellerSummaryForListing(
  listing: Pick<Listing, 'authorPublicKey'>,
  profiles: PublicProfile[],
  syncedProfiles: SyncedPublicRecord<PublicProfile>[],
  attestations: ReputationAttestation[],
  syncedAttestations: SyncedPublicRecord<ReputationAttestation>[],
  allowlist: CommunityAllowlistEntry[]
): SellerSummary {
  const publicKey = listing.authorPublicKey.toLowerCase();
  const profile =
    profiles.find((entry) => entry.publicKey.toLowerCase() === publicKey) ??
    syncedProfiles.find((entry) => entry.payload.publicKey.toLowerCase() === publicKey)?.payload;
  const relevantAttestations = [
    ...attestations.filter((entry) => entry.subjectPublicKey.toLowerCase() === publicKey),
    ...syncedAttestations.filter((entry) => entry.payload.subjectPublicKey.toLowerCase() === publicKey).map((entry) => entry.payload)
  ];
  const reputationTags = [...new Set(relevantAttestations.flatMap((entry) => entry.tags))].slice(0, 4);
  return {
    displayName: profile?.displayName || `${publicKey.slice(0, 12)}...`,
    avatarUrl: profile?.avatarUrl || undefined,
    publicKey,
    shortKey: `${publicKey.slice(0, 12)}...${publicKey.slice(-6)}`,
    region: profile?.region || undefined,
    languages: profile?.languages ?? [],
    skills: profile?.skills ?? [],
    contactMethods: profile?.contactMethods ?? [],
    mediatorAvailable: profile?.mediatorAvailable ?? false,
    trusted: allowlist.some((entry) => entry.publicKey.toLowerCase() === publicKey) || syncedProfiles.some((entry) => entry.authorPublicKey.toLowerCase() === publicKey && entry.trusted),
    reputationCount: relevantAttestations.length,
    reputationTags,
    verified: false
  };
}

export function categoryLabelKeys(): string[] {
  return listingCategorySchema.options.map((category) => `category.${category}`);
}
