import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { finalizeEvent } from 'nostr-tools/pure';
import { newId, nowIso } from '../crypto/encoding';
import { verifyNostrEvent, type NostrEvent, type NostrUnsignedEvent } from '../nostr/events';
import { signWithNostrSigner } from '../nostr/signer';
import { listingImageSchema } from '../validation/schemas';
import type { ListingImage } from '../../types/domain';

export const listingImageMimeTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const maxListingImageBytes = 5 * 1024 * 1024;
export const maxListingImages = 6;
export const blossomUploadAuthKind = 24242;

type ListingImageMimeType = (typeof listingImageMimeTypes)[number];
type BlossomUploadResponse = Record<string, unknown>;
type BlossomSigner = (event: NostrUnsignedEvent, expectedPublicKey: string) => Promise<NostrEvent> | NostrEvent;

function ensureHttpsUrl(value: string, label: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:') {
    throw new Error(`${label} must use https://`);
  }
  return parsed.toString().replace(/\/$/, '');
}

function fileType(file: File): ListingImageMimeType {
  if (!listingImageMimeTypes.includes(file.type as ListingImageMimeType)) {
    throw new Error('Listing images must be JPEG, PNG, or WebP.');
  }
  return file.type as ListingImageMimeType;
}

export function validateListingImageFile(file: File): void {
  fileType(file);
  if (file.size <= 0 || file.size > maxListingImageBytes) {
    throw new Error('Listing image must be 5 MB or smaller.');
  }
}

export async function sha256File(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return bytesToHex(new Uint8Array(digest));
}

export function unsignedBlossomUploadAuth(fileHash: string, mimeType: string, sizeBytes: number): NostrUnsignedEvent {
  if (!/^[0-9a-f]{64}$/.test(fileHash)) {
    throw new Error('Image hash must be 64 lowercase hex characters.');
  }
  if (!listingImageMimeTypes.includes(mimeType as ListingImageMimeType)) {
    throw new Error('Listing images must be JPEG, PNG, or WebP.');
  }
  if (sizeBytes <= 0 || sizeBytes > maxListingImageBytes) {
    throw new Error('Listing image must be 5 MB or smaller.');
  }
  return {
    kind: blossomUploadAuthKind,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['t', 'upload'],
      ['x', fileHash],
      ['m', mimeType],
      ['size', String(sizeBytes)],
      ['expiration', String(Math.floor(Date.now() / 1000) + 600)],
      ['client', 'agoramesh']
    ],
    content: 'Upload public AgoraMesh media image'
  };
}

export async function createBlossomUploadAuth(
  fileHash: string,
  mimeType: string,
  sizeBytes: number,
  signer: BlossomSigner,
  expectedPublicKey: string
): Promise<NostrEvent> {
  const unsigned = unsignedBlossomUploadAuth(fileHash, mimeType, sizeBytes);
  const signed = await signer(unsigned, expectedPublicKey);
  if (signed.pubkey.toLowerCase() !== expectedPublicKey.toLowerCase()) {
    throw new Error('Blossom upload signer does not match the listing author.');
  }
  if (
    signed.kind !== unsigned.kind ||
    signed.created_at !== unsigned.created_at ||
    signed.content !== unsigned.content ||
    JSON.stringify(signed.tags) !== JSON.stringify(unsigned.tags)
  ) {
    throw new Error('Blossom upload signer returned a modified auth event.');
  }
  if (!verifyNostrEvent(signed)) {
    throw new Error('Blossom upload signer returned an invalid signature.');
  }
  return signed;
}

export function signBlossomUploadAuthLocally(
  fileHash: string,
  mimeType: string,
  sizeBytes: number,
  privateKeyHex: string,
  expectedPublicKey: string
): Promise<NostrEvent> {
  return createBlossomUploadAuth(
    fileHash,
    mimeType,
    sizeBytes,
    (event) => finalizeEvent(event, hexToBytes(privateKeyHex)),
    expectedPublicKey
  );
}

export function signBlossomUploadAuthWithExtension(
  fileHash: string,
  mimeType: string,
  sizeBytes: number,
  expectedPublicKey: string
): Promise<NostrEvent> {
  return createBlossomUploadAuth(fileHash, mimeType, sizeBytes, signWithNostrSigner, expectedPublicKey);
}

function blossomAuthorizationHeader(event: NostrEvent): string {
  const json = JSON.stringify(event);
  const encoded =
    typeof btoa === 'function'
      ? btoa(json)
      : Buffer.from(json, 'utf8').toString('base64');
  return `Nostr ${encoded}`;
}

export async function uploadToBlossom(serverUrl: string, file: File, signedAuth: NostrEvent): Promise<BlossomUploadResponse> {
  validateListingImageFile(file);
  const baseUrl = ensureHttpsUrl(serverUrl, 'Blossom server');
  const response = await fetch(`${baseUrl}/upload`, {
    method: 'PUT',
    headers: {
      Authorization: blossomAuthorizationHeader(signedAuth),
      'Content-Type': file.type
    },
    body: file
  });
  if (!response.ok) {
    throw new Error(`Blossom upload failed: ${response.status}`);
  }
  const parsed = (await response.json()) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Blossom upload response was not an object.');
  }
  return parsed as BlossomUploadResponse;
}

function responseString(response: BlossomUploadResponse, keys: string[]): string | undefined {
  const direct = responseStringFromObject(response, keys);
  if (direct) return direct;
  const nested = responseNestedObjects(response)
    .map((entry) => responseStringFromObject(entry, keys))
    .find((entry): entry is string => Boolean(entry));
  if (nested) return nested;
  return responseTagString(response, keys);
}

function responseStringFromObject(response: BlossomUploadResponse, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = response[key];
    if (typeof value === 'string') return value;
  }
  return undefined;
}

function responseNumber(response: BlossomUploadResponse, keys: string[]): number | undefined {
  const direct = responseNumberFromObject(response, keys);
  if (typeof direct === 'number') return direct;
  const nested = responseNestedObjects(response)
    .map((entry) => responseNumberFromObject(entry, keys))
    .find((entry): entry is number => typeof entry === 'number');
  if (typeof nested === 'number') return nested;
  const tagged = responseTagString(response, keys);
  if (!tagged) return undefined;
  const parsed = Number(tagged);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function responseNumberFromObject(response: BlossomUploadResponse, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = response[key];
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is BlossomUploadResponse {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function responseNestedObjects(response: BlossomUploadResponse): BlossomUploadResponse[] {
  return ['blob', 'data', 'descriptor', 'event', 'file', 'nip94', 'nip94_event', 'nip94Event']
    .map((key) => response[key])
    .filter(isRecord);
}

function responseTagString(response: BlossomUploadResponse, keys: string[]): string | undefined {
  const tagKeys = new Set(keys);
  for (const entry of [response, ...responseNestedObjects(response)]) {
    const tags = entry.tags;
    if (!Array.isArray(tags)) continue;
    for (const tag of tags) {
      if (!Array.isArray(tag) || typeof tag[0] !== 'string' || !tagKeys.has(tag[0])) continue;
      const value = tag[1];
      if (typeof value === 'string') return value;
      if (typeof value === 'number') return String(value);
    }
  }
  return undefined;
}

function listingImageUrl(responseUrl: string | undefined, normalizedServerUrl: string, sha256: string): string {
  if (!responseUrl) return `${normalizedServerUrl}/${sha256}`;
  if (responseUrl.startsWith('/')) return `${normalizedServerUrl}${responseUrl}`;
  return responseUrl;
}

export function listingImageFromBlossomResponse(
  response: BlossomUploadResponse,
  file: File,
  expectedHash: string,
  blossomServerUrl: string,
  altText = ''
): ListingImage {
  const normalizedServerUrl = ensureHttpsUrl(blossomServerUrl, 'Blossom server');
  const sha256 = (responseString(response, ['sha256', 'hash', 'x']) ?? expectedHash).toLowerCase();
  const url = listingImageUrl(responseString(response, ['url', 'downloadUrl', 'href']), normalizedServerUrl, sha256);
  const mimeType = responseString(response, ['mimeType', 'type', 'm']) ?? file.type;
  const sizeBytes = responseNumber(response, ['sizeBytes', 'size']) ?? file.size;
  const image = listingImageSchema.parse({
    id: newId('image'),
    url,
    sha256,
    mimeType,
    sizeBytes,
    width: responseNumber(response, ['width']),
    height: responseNumber(response, ['height']),
    altText: altText.trim() || undefined,
    blossomServerUrl: normalizedServerUrl,
    uploadedAt: nowIso()
  });
  if (image.sha256 !== expectedHash) {
    throw new Error('Blossom upload response hash does not match the uploaded file.');
  }
  return image;
}
