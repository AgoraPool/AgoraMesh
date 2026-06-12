import { decode, npubEncode } from 'nostr-tools/nip19';

export interface NormalizedNostrContact {
  publicKey: string;
  npub: string;
  uri: string;
}

const hexPublicKeyPattern = /^[0-9a-f]{64}$/i;

export function normalizeNostrContact(value: string): NormalizedNostrContact | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const code = trimmed.toLowerCase().startsWith('nostr:') ? trimmed.slice('nostr:'.length) : trimmed;

  if (hexPublicKeyPattern.test(code)) {
    const publicKey = code.toLowerCase();
    const npub = npubEncode(publicKey);
    return { publicKey, npub, uri: `nostr:${npub}` };
  }

  try {
    const decoded = decode(code);
    if (decoded.type === 'npub' && hexPublicKeyPattern.test(decoded.data)) {
      const publicKey = decoded.data.toLowerCase();
      const npub = npubEncode(publicKey);
      return { publicKey, npub, uri: `nostr:${npub}` };
    }
    if (decoded.type === 'nprofile' && hexPublicKeyPattern.test(decoded.data.pubkey)) {
      const publicKey = decoded.data.pubkey.toLowerCase();
      const npub = npubEncode(publicKey);
      return { publicKey, npub, uri: `nostr:${npub}` };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function isNostrContact(value: string): boolean {
  return Boolean(normalizeNostrContact(value));
}

