import { z } from 'zod';

const nonEmpty = z.string().trim().min(1);
const optionalText = z.string().trim().optional();

export const contactMethodSchema = z.object({
  id: nonEmpty,
  kind: z.enum(['matrix', 'simplex', 'session', 'email', 'nostr', 'custom']),
  value: nonEmpty.max(500),
  note: optionalText
});

export const encryptedSecretSchema = z.object({
  ciphertext: nonEmpty,
  iv: nonEmpty,
  salt: nonEmpty,
  iterations: z.number().int().positive(),
  algorithm: z.literal('AES-GCM'),
  kdf: z.literal('PBKDF2-SHA-256')
});

export const encryptedExportEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('encrypted-dispute-bundle'),
  createdAt: nonEmpty,
  kdf: z.literal('PBKDF2-SHA-256'),
  algorithm: z.literal('AES-GCM'),
  iterations: z.number().int().positive(),
  salt: nonEmpty,
  iv: nonEmpty,
  ciphertext: nonEmpty
});

export const encryptedRelayContentEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('encrypted-relay-content'),
  createdAt: nonEmpty,
  kdf: z.literal('PBKDF2-SHA-256'),
  algorithm: z.literal('AES-GCM'),
  iterations: z.number().int().positive(),
  salt: nonEmpty,
  iv: nonEmpty,
  ciphertext: nonEmpty
});

const baseIdentityRecordSchema = z.object({
  id: nonEmpty,
  displayName: nonEmpty.max(80),
  publicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  createdAt: nonEmpty,
  updatedAt: nonEmpty
});

export const identityRecordSchema = z.union([
  baseIdentityRecordSchema.extend({
    keySource: z.literal('local').default('local').optional(),
    encryptedPrivateKey: encryptedSecretSchema
  }),
  baseIdentityRecordSchema.extend({
    keySource: z.literal('nostr-extension'),
    encryptedPrivateKey: z.undefined().optional()
  })
]);

export const paymentIntentSchema = z.object({
  id: nonEmpty,
  method: z.enum(['bitcoin', 'lightning', 'cashu', 'monero', 'bank', 'cash', 'other']),
  value: nonEmpty.max(500),
  note: z.string().trim().max(500).default('')
});

export const listingImageSchema = z.object({
  id: nonEmpty,
  url: z.string().url().refine((value) => value.startsWith('https://'), {
    message: 'Listing image URL must use https://'
  }),
  sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']).optional(),
  sizeBytes: z.number().int().positive().max(5 * 1024 * 1024).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  altText: z.string().trim().max(160).optional(),
  blossomServerUrl: z.string().url().refine((value) => value.startsWith('https://'), {
    message: 'Blossom server URL must use https://'
  }).optional(),
  uploadedAt: nonEmpty.optional()
});

export const publicProfileSchema = z.object({
  id: nonEmpty,
  displayName: nonEmpty.max(80),
  publicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  avatarUrl: z
    .string()
    .url()
    .refine((value) => value.startsWith('https://'), {
      message: 'Avatar URL must use https://'
    })
    .optional()
    .or(z.literal('')),
  lightningAddress: z.string().trim().max(120).optional().or(z.literal('')),
  lnurl: z.string().trim().max(500).optional().or(z.literal('')),
  bio: z.string().trim().max(1000),
  region: z.string().trim().max(120),
  languages: z.array(nonEmpty).max(12),
  contactMethods: z.array(contactMethodSchema).max(8),
  skills: z.array(nonEmpty).max(24),
  mediatorAvailable: z.boolean(),
  publicVisibility: z.boolean(),
  createdAt: nonEmpty,
  updatedAt: nonEmpty
});

export const listingCategorySchema = z.enum([
  'web-dev-help',
  'computer-repair',
  'tutoring',
  'translation-language-exchange',
  'books-media',
  'tools-equipment-lending',
  'home-server-self-hosting-help',
  'accounting-admin-help',
  'repairs',
  'food-home-goods',
  'workshops-events',
  'other-peaceful-services'
]);

export const listingFulfillmentTypeSchema = z.enum(['local-pickup', 'shipping', 'delivery', 'digital', 'other']);
export const listingStatusSchema = z.enum(['active', 'sold', 'deleted']);

export const listingPriceSchema = z.object({
  amount: nonEmpty.max(80).default('0'),
  currency: nonEmpty.max(16).default('FREE'),
  frequency: z.string().trim().max(40).optional(),
  note: z.string().trim().max(240).optional()
});

export const listingSchema = z.object({
  id: nonEmpty,
  authorPublicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  title: nonEmpty.max(120),
  type: z.enum(['offer', 'request']),
  category: listingCategorySchema,
  description: nonEmpty.max(5000),
  region: z.string().trim().max(120),
  status: listingStatusSchema.default('active'),
  price: listingPriceSchema.default({ amount: '0', currency: 'FREE' }),
  publishedAt: z.string().trim().optional(),
  paymentPreferences: z
    .array(z.enum(['cash', 'bank', 'bitcoin', 'lightning', 'cashu', 'monero', 'barter', 'mutual-credit', 'other']))
    .min(1),
  paymentIntents: z.array(paymentIntentSchema).max(6).default([]).optional(),
  images: z.array(listingImageSchema).max(6).default([]).optional(),
  fulfillmentType: listingFulfillmentTypeSchema.optional(),
  fulfillmentNotes: z.string().trim().max(500).optional(),
  barterAccepted: z.boolean(),
  tags: z.array(nonEmpty.max(40)).max(16),
  expiresAt: nonEmpty,
  contactMethod: contactMethodSchema,
  mediatorPreference: optionalText,
  visibility: z.enum(['local', 'public', 'draft']),
  createdAt: nonEmpty,
  updatedAt: nonEmpty
});

export const agreementSchema = z.object({
  id: nonEmpty,
  buyer: nonEmpty.max(120),
  seller: nonEmpty.max(120),
  buyerPublicKey: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
  sellerPublicKey: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
  buyerLabel: optionalText,
  sellerLabel: optionalText,
  listingId: optionalText,
  exchangeDescription: nonEmpty.max(4000),
  priceAndPayment: nonEmpty.max(1000),
  fulfillmentTerms: nonEmpty.max(2000),
  deadline: nonEmpty,
  refundTerms: nonEmpty.max(2000),
  mediator: optionalText,
  evidenceExpectations: nonEmpty.max(2000),
  buyerAccepted: z.boolean(),
  sellerAccepted: z.boolean(),
  hashVersion: z.literal(2).optional(),
  hash: z.string().regex(/^[0-9a-f]{64}$/i),
  createdAt: nonEmpty,
  updatedAt: nonEmpty
});

export const agreementTermsPacketSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('agreement-terms-packet'),
  agreement: agreementSchema,
  agreementHash: z.string().regex(/^[0-9a-f]{64}$/i),
  exportedAt: nonEmpty
});

export const agreementAcceptanceReceiptSchema = z.object({
  id: nonEmpty,
  schemaVersion: z.literal(1),
  kind: z.literal('agreement-acceptance-receipt'),
  agreementHash: z.string().regex(/^[0-9a-f]{64}$/i),
  role: z.enum(['buyer', 'seller']),
  signerPublicKey: z.string().regex(/^[0-9a-f]{64}$/i).optional().default(''),
  acceptedAt: nonEmpty,
  eventId: nonEmpty,
  signature: nonEmpty
});

export const mediatorProfileSchema = z.object({
  id: nonEmpty,
  displayName: nonEmpty.max(80),
  publicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  region: z.string().trim().max(120),
  languages: z.array(nonEmpty).max(12),
  specialties: z.array(nonEmpty).max(20),
  feeModel: nonEmpty.max(400),
  mediationStyle: nonEmpty.max(1000),
  responseTime: nonEmpty.max(80),
  caseCount: z.number().int().nonnegative(),
  contactMethods: z.array(contactMethodSchema).max(8),
  procedure: nonEmpty.max(4000),
  createdAt: nonEmpty,
  updatedAt: nonEmpty
});

export const evidenceMetadataSchema = z.object({
  id: nonEmpty,
  title: nonEmpty.max(120),
  description: z.string().trim().max(1000),
  fileHash: z.string().trim().max(160).optional(),
  date: nonEmpty,
  source: z.string().trim().max(240),
  localFilename: z.string().trim().max(240).optional(),
  notes: z.string().trim().max(1000).optional()
});

export const disputeCaseSchema = z.object({
  id: nonEmpty,
  state: z.enum([
    'draft',
    'opened',
    'awaiting-response',
    'mediation-proposed',
    'settlement-proposed',
    'resolved',
    'abandoned'
  ]),
  agreementHash: nonEmpty,
  claimant: nonEmpty.max(120),
  respondent: nonEmpty.max(120),
  mediator: optionalText,
  claimSummary: nonEmpty.max(4000),
  requestedResolution: nonEmpty.max(2000),
  response: optionalText,
  timeline: z.array(z.object({ id: nonEmpty, at: nonEmpty, note: nonEmpty.max(1000) })),
  evidence: z.array(evidenceMetadataSchema),
  settlementProposal: optionalText,
  outcomeSummary: optionalText,
  publishOutcomeAttestation: z.boolean(),
  createdAt: nonEmpty,
  updatedAt: nonEmpty
});

export const publicDisputeOutcomeSchema = z.object({
  id: nonEmpty,
  state: z.enum([
    'draft',
    'opened',
    'awaiting-response',
    'mediation-proposed',
    'settlement-proposed',
    'resolved',
    'abandoned'
  ]),
  agreementHash: nonEmpty,
  signerPublicKey: z.string().regex(/^[0-9a-f]{64}$/i).optional().default(''),
  outcomeSummary: nonEmpty.max(2000),
  updatedAt: nonEmpty
});

export const reputationAttestationSchema = z.object({
  id: nonEmpty,
  reviewerPublicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  subjectPublicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  agreementHash: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
  role: z.enum(['buyer', 'seller', 'mediator']),
  score: z.number().int().min(1).max(5).optional(),
  listingId: optionalText,
  listingTitle: optionalText,
  listingCoordinate: optionalText,
  tags: z.array(
    z.enum([
      'fulfilled-agreement',
      'clear-communication',
      'late',
      'no-show',
      'fair-mediator',
      'resolved-dispute',
      'refund-honored',
      'other'
    ])
  ),
  text: z.string().trim().max(1000),
  timestamp: z.number().int().positive(),
  signature: nonEmpty,
  eventId: nonEmpty
});

export const relayConfigSchema = z.object({
  url: z.string().url().refine((value) => value.startsWith('wss://'), {
    message: 'Relay must use wss://'
  }),
  enabled: z.boolean()
});

export const nostrReviewItemSchema = z.object({
  id: nonEmpty,
  eventId: nonEmpty,
  kind: z.number().int().nonnegative(),
  relay: nonEmpty,
  authorPublicKey: z.string().regex(/^[0-9a-f]{64}$/i).or(z.literal('unknown')),
  receivedAt: nonEmpty,
  signatureValid: z.boolean(),
  importStatus: z.enum(['pending', 'imported', 'rejected', 'invalid']),
  payloadPreview: z.string().max(5000),
  rawEvent: z.string(),
  discoveryScope: z.enum(['agoramesh-native', 'all-nip99']).optional()
});

export const syncedPublicRecordSchema = <T extends z.ZodTypeAny>(payloadSchema: T) =>
  z.object({
    id: nonEmpty,
    eventId: nonEmpty,
    kind: z.number().int().positive(),
    authorPublicKey: z.string().regex(/^[0-9a-f]{64}$/i),
    relayUrls: z.array(nonEmpty),
    receivedAt: nonEmpty,
    importedAt: nonEmpty,
    payload: payloadSchema,
    trusted: z.boolean(),
    hidden: z.boolean(),
    rawEvent: z.string().optional(),
    discoveryScope: z.enum(['agoramesh-native', 'all-nip99']).optional()
  });

export const relayHealthSchema = z.object({
  url: nonEmpty,
  enabled: z.boolean(),
  lastConnectedAt: optionalText,
  lastError: optionalText,
  latencyMs: z.number().nonnegative().optional(),
  eventsReceived: z.number().int().nonnegative(),
  eventsPublished: z.number().int().nonnegative(),
  consecutiveFailures: z.number().int().nonnegative()
});

export const publishReceiptSchema = z.object({
  id: nonEmpty,
  objectType: z.enum(['profile', 'listing', 'mediator', 'reputation', 'disputeOutcome', 'communityList']),
  objectId: nonEmpty,
  eventId: nonEmpty,
  relayUrl: nonEmpty,
  status: z.enum(['accepted', 'failed', 'pending']),
  message: z.string(),
  at: nonEmpty
});

export const nostrContactReceiptSchema = z.object({
  id: nonEmpty,
  senderPublicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  recipientPublicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  recipientNpub: nonEmpty,
  contextType: z.enum(['listing', 'profile', 'mediator', 'manual', 'trade-room']),
  contextId: optionalText,
  contextTitle: optionalText,
  eventIds: z.array(nonEmpty),
  relayReceipts: z.array(
    z.object({
      relay: nonEmpty,
      ok: z.boolean(),
      message: z.string(),
      at: nonEmpty
    })
  ),
  status: z.enum(['accepted', 'partial', 'failed']),
  sentAt: nonEmpty
});

export const nostrMessageRecordSchema = z.object({
  id: nonEmpty,
  ownerPublicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  eventId: nonEmpty,
  wrapPublicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  senderPublicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  recipientPublicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  counterpartPublicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  direction: z.enum(['incoming', 'outgoing']),
  threadKey: nonEmpty,
  subject: optionalText,
  contextType: z.enum(['listing', 'profile', 'mediator', 'manual', 'trade-room']).optional(),
  contextId: optionalText,
  wrapCreatedAt: nonEmpty,
  messageCreatedAt: nonEmpty,
  receivedAt: nonEmpty,
  relayUrls: z.array(nonEmpty),
  rawEvent: nonEmpty,
  encryptedPlaintext: encryptedSecretSchema,
  read: z.boolean(),
  archived: z.boolean()
});

export const nostrMessageThreadSchema = z.object({
  id: nonEmpty,
  ownerPublicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  counterpartPublicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  threadKey: nonEmpty,
  subject: optionalText,
  contextType: z.enum(['listing', 'profile', 'mediator', 'manual', 'trade-room']).optional(),
  contextId: optionalText,
  lastMessageAt: nonEmpty,
  lastMessageId: optionalText,
  unreadCount: z.number().int().nonnegative(),
  archived: z.boolean(),
  updatedAt: nonEmpty
});

export const nostrInboxCursorSchema = z.object({
  id: nonEmpty,
  ownerPublicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  relayUrl: nonEmpty,
  since: z.number().int().nonnegative(),
  newestCreatedAt: z.number().int().nonnegative(),
  lastFetchedAt: nonEmpty
});

export const nwcConnectionSchema = z.object({
  id: nonEmpty,
  label: nonEmpty.max(120),
  walletPublicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  clientPublicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  relayUrls: z.array(
    z.string().url().refine((value) => value.startsWith('wss://'), {
      message: 'NWC relay must use wss://'
    })
  ).min(1),
  encryptedSecret: encryptedSecretSchema,
  lud16: optionalText,
  createdAt: nonEmpty,
  updatedAt: nonEmpty,
  lastConnectedAt: optionalText,
  lastError: optionalText
});

export const lightningPaymentAttemptSchema = z.object({
  id: nonEmpty,
  buyerPublicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  sellerPublicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  purpose: z.enum(['listing-payment', 'operator-support']).optional().default('listing-payment'),
  badgeSubjectPublicKey: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
  listingId: optionalText,
  listingTitle: optionalText,
  amountSats: z.number().int().positive(),
  amountMsats: z.number().int().positive(),
  lnurlSource: nonEmpty.max(500),
  callbackUrl: z.string().url().refine((value) => value.startsWith('https://'), {
    message: 'LNURL callback must use https://'
  }),
  sellerWalletPubkey: z.string().regex(/^[0-9a-f]{64}$/i),
  zapRequestId: nonEmpty,
  zapRequest: nonEmpty,
  bolt11: nonEmpty,
  paymentHash: optionalText,
  nwcConnectionId: optionalText,
  nwcRequestEventId: optionalText,
  nwcResponseEventId: optionalText,
  nwcRelayUrl: optionalText,
  nwcResult: optionalText,
  preimage: optionalText,
  feesPaidMsats: z.number().int().nonnegative().optional(),
  statusDetail: optionalText,
  receiptEventId: optionalText,
  receiptEvent: optionalText,
  receiptRelayUrls: z.array(nonEmpty).default([]),
  status: z.enum(['invoice-created', 'wallet-payment-pending', 'paid', 'receipt-found', 'failed']),
  createdAt: nonEmpty,
  updatedAt: nonEmpty,
  error: optionalText
});

export const operatorSupportReceiptSchema = z.object({
  id: nonEmpty,
  payerPublicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  operatorLnurl: nonEmpty.max(500),
  operatorWalletPubkey: z.string().regex(/^[0-9a-f]{64}$/i),
  amountMsats: z.number().int().positive(),
  minimumSats: z.number().int().positive(),
  zapRequestId: nonEmpty,
  zapRequest: nonEmpty,
  receiptEventId: nonEmpty,
  receiptEvent: nonEmpty,
  relayUrls: z.array(nonEmpty).default([]),
  paidAt: nonEmpty,
  validatedAt: nonEmpty
});

export const listingZapReceiptSchema = z.object({
  id: nonEmpty,
  listingId: nonEmpty,
  listingTitle: optionalText,
  listingCoordinate: nonEmpty,
  sellerPublicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  buyerPublicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  lnurl: nonEmpty.max(500),
  sellerWalletPubkey: z.string().regex(/^[0-9a-f]{64}$/i),
  amountMsats: z.number().int().positive(),
  zapRequestId: nonEmpty,
  zapRequest: nonEmpty,
  receiptEventId: nonEmpty,
  receiptEvent: nonEmpty,
  bolt11: nonEmpty,
  relayUrls: z.array(nonEmpty).default([]),
  paidAt: nonEmpty,
  validatedAt: nonEmpty
});

export const buyerRequestOfferSchema = z.object({
  id: nonEmpty,
  requestListingId: nonEmpty,
  requestCoordinate: nonEmpty,
  requestTitle: nonEmpty.max(120),
  buyerPublicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  sellerPublicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  amount: nonEmpty.max(80),
  currency: nonEmpty.max(16),
  fulfillmentNotes: z.string().trim().max(1000),
  timeline: z.string().trim().max(240),
  paymentPreferences: z
    .array(z.enum(['cash', 'bank', 'bitcoin', 'lightning', 'cashu', 'monero', 'barter', 'mutual-credit', 'other']))
    .min(1),
  contactMethod: contactMethodSchema.optional(),
  message: nonEmpty.max(2000),
  sourceEventIds: z.array(nonEmpty),
  sourceReceiptId: optionalText,
  sourceMessageId: optionalText,
  direction: z.enum(['incoming', 'outgoing']),
  status: z.enum(['sent', 'received', 'selected', 'superseded']),
  createdAt: nonEmpty,
  updatedAt: nonEmpty,
  selectedAt: optionalText
});

export const tradeRoomStateSchema = z.enum(['intent', 'offer', 'accepted', 'payment-pending', 'paid', 'delivered', 'confirmed', 'reviewed']);
export const tradeRoomPaymentStateSchema = z.enum(['none', 'payment-pending', 'paid', 'receipt-found', 'failed']);
export const tradeRoomDeliveryStateSchema = z.enum(['none', 'in-progress', 'delivered', 'confirmed']);
export const tradeRoomDeliveryStatusSchema = z.enum(['draft', 'sent', 'received', 'confirmed']);

export const tradeRoomSchema = z.object({
  id: nonEmpty,
  buyerPublicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  sellerPublicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  buyerLabel: optionalText,
  sellerLabel: optionalText,
  mediator: optionalText,
  listingId: optionalText,
  listingCoordinate: optionalText,
  listingTitle: optionalText,
  agreementId: optionalText,
  agreementHash: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
  buyerRequestOfferId: optionalText,
  state: tradeRoomStateSchema,
  paymentState: tradeRoomPaymentStateSchema,
  deliveryState: tradeRoomDeliveryStateSchema,
  paymentClaimedBy: z.array(z.string().regex(/^[0-9a-f]{64}$/i)).default([]),
  deliveryClaimedBy: z.array(z.string().regex(/^[0-9a-f]{64}$/i)).default([]),
  relatedPaymentAttemptIds: z.array(nonEmpty).default([]),
  relatedZapReceiptIds: z.array(nonEmpty).default([]),
  relatedMessageThreadIds: z.array(nonEmpty).default([]),
  lastMessageAt: optionalText,
  reviewedAt: optionalText,
  deletedAt: optionalText,
  createdAt: nonEmpty,
  updatedAt: nonEmpty
});

export const tradeRoomDeliverySchema = z.object({
  id: nonEmpty,
  roomId: nonEmpty,
  senderPublicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  fileName: nonEmpty.max(240),
  fileHash: nonEmpty.max(160),
  note: z.string().trim().max(1000),
  url: z
    .string()
    .url()
    .refine((value) => value.startsWith('https://'), {
      message: 'Trade room delivery URL must use https://'
    })
    .optional()
    .or(z.literal('')),
  sourceMessageId: optionalText,
  status: tradeRoomDeliveryStatusSchema,
  createdAt: nonEmpty,
  updatedAt: nonEmpty
});

export const communityAllowlistEntrySchema = z.object({
  id: nonEmpty,
  publicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  label: nonEmpty.max(80),
  note: z.string().max(500),
  createdAt: nonEmpty
});

export const communityAllowlistEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('community-allowlist'),
  exportedAt: nonEmpty,
  entries: z.array(
    z.object({
      publicKey: z.string().regex(/^[0-9a-f]{64}$/i),
      label: nonEmpty.max(80),
      note: z.string().max(500).default('')
    })
  )
});

export const communityCurationListSchema = z.object({
  id: nonEmpty,
  title: nonEmpty.max(120),
  description: z.string().trim().max(1000),
  authorPublicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  referencedCoordinates: z.array(nonEmpty.max(240)).max(100),
  createdAt: nonEmpty,
  updatedAt: nonEmpty
});

export const syncSettingsSchema = z.object({
  id: z.literal('default'),
  liveSyncEnabled: z.boolean(),
  showDataSource: z.boolean(),
  defaultBrowseSource: z.enum(['local', 'synced', 'combined']),
  listingDiscoveryScope: z.enum(['agoramesh-native', 'all-nip99']).default('agoramesh-native')
});

export const blossomServerConfigSchema = z.object({
  id: nonEmpty,
  url: z.string().url().refine((value) => value.startsWith('https://'), {
    message: 'Blossom server must use https://'
  }),
  enabled: z.boolean(),
  lastUploadAt: optionalText,
  lastError: optionalText
});

const backupRelaysSchema = z
  .array(z.unknown())
  .default([])
  .transform((entries) =>
    entries.flatMap((entry) => {
      const parsed = relayConfigSchema.safeParse(entry);
      return parsed.success ? [parsed.data] : [];
    })
  );

export const appBackupSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: nonEmpty,
  identity: identityRecordSchema.optional(),
  profile: publicProfileSchema.optional(),
  listings: z.array(listingSchema),
  agreements: z.array(agreementSchema),
  agreementReceipts: z.array(agreementAcceptanceReceiptSchema).default([]),
  mediators: z.array(mediatorProfileSchema),
  disputes: z.array(disputeCaseSchema),
  attestations: z.array(reputationAttestationSchema),
  relays: backupRelaysSchema,
  nostrReview: z.array(nostrReviewItemSchema).default([]),
  publicProfiles: z.array(publicProfileSchema).default([]),
  syncedProfiles: z.array(syncedPublicRecordSchema(publicProfileSchema)).default([]),
  syncedListings: z.array(syncedPublicRecordSchema(listingSchema)).default([]),
  syncedMediators: z.array(syncedPublicRecordSchema(mediatorProfileSchema)).default([]),
  syncedAttestations: z.array(syncedPublicRecordSchema(reputationAttestationSchema)).default([]),
  syncedDisputeOutcomes: z.array(syncedPublicRecordSchema(publicDisputeOutcomeSchema)).default([]),
  communityLists: z.array(communityCurationListSchema).default([]),
  syncedCommunityLists: z.array(syncedPublicRecordSchema(communityCurationListSchema)).default([]),
  relayHealth: z.array(relayHealthSchema).default([]),
  publishReceipts: z.array(publishReceiptSchema).default([]),
  nostrContactReceipts: z.array(nostrContactReceiptSchema).default([]),
  nostrMessages: z.array(nostrMessageRecordSchema).default([]),
  nostrMessageThreads: z.array(nostrMessageThreadSchema).default([]),
  nostrInboxCursors: z.array(nostrInboxCursorSchema).default([]),
  lightningPaymentAttempts: z.array(lightningPaymentAttemptSchema).default([]),
  operatorSupportReceipts: z.array(operatorSupportReceiptSchema).default([]),
  listingZapReceipts: z.array(listingZapReceiptSchema).default([]),
  buyerRequestOffers: z.array(buyerRequestOfferSchema).default([]),
  tradeRooms: z.array(tradeRoomSchema).default([]),
  tradeRoomDeliveries: z.array(tradeRoomDeliverySchema).default([]),
  allowlist: z.array(communityAllowlistEntrySchema).default([]),
  syncSettings: z.array(syncSettingsSchema).default([]),
  blossomServers: z.array(blossomServerConfigSchema).default([])
});

export const prohibitedCategoryTerms = [
  'violence',
  'weapon',
  'stolen',
  'coercion',
  'fraud',
  'exploit',
  'dox',
  'non-consensual'
];

export function assertPeacefulListingText(title: string, description: string): void {
  const normalized = `${title} ${description}`.toLowerCase();
  const match = prohibitedCategoryTerms.find((term) => normalized.includes(term));
  if (match) {
    throw new Error(`Listing appears to mention prohibited activity: ${match}`);
  }
}

export function assertPublicPaymentIntentText(value: string, note = ''): void {
  const normalized = `${value} ${note}`.toLowerCase();
  const blocked = [
    'secret',
    'seed',
    'private key',
    'wallet seed',
    'escrow',
    'custody',
    'custodial',
    'invoice memo',
    'private memo',
    'refund address',
    'refund secret',
    'settlement secret',
    'private settlement'
  ];
  const match = blocked.find((term) => normalized.includes(term));
  if (match) {
    throw new Error(`Payment intent appears to contain private or custodial wording: ${match}`);
  }
}

export type ListingInput = z.infer<typeof listingSchema>;
