import { describe, expect, it } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { nprofileEncode, npubEncode } from 'nostr-tools/nip19';
import { normalizeNostrContact } from './contact';

describe('Nostr contact normalization', () => {
  it('accepts hex, npub, nostr:npub, nprofile, and nostr:nprofile contacts', () => {
    const publicKey = getPublicKey(generateSecretKey());
    const npub = npubEncode(publicKey);
    const nprofile = nprofileEncode({ pubkey: publicKey, relays: ['wss://relay.example'] });

    for (const value of [publicKey, npub, `nostr:${npub}`, nprofile, `nostr:${nprofile}`]) {
      expect(normalizeNostrContact(value)).toMatchObject({
        publicKey,
        npub,
        uri: `nostr:${npub}`
      });
    }
  });

  it('rejects unsupported or malformed contact values', () => {
    expect(normalizeNostrContact('')).toBeUndefined();
    expect(normalizeNostrContact('nostr:note1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq0lfl09')).toBeUndefined();
    expect(normalizeNostrContact('not-a-key')).toBeUndefined();
  });
});

