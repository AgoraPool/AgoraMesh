import { bytesToHex } from '@noble/hashes/utils';
import { describe, expect, it } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent } from 'nostr-tools/pure';
import { createExtensionNostrIntroEvents, createLocalNostrIntroEvents, NOSTR_GIFT_WRAP_KIND, nostrInboxSince, unwrapLocalNostrGiftWrap } from './messages';
import { encrypt } from 'nostr-tools/nip44';
import type { NostrUnsignedEvent } from './events';

describe('encrypted Nostr intro messages', () => {
  it('creates valid NIP-17 gift wraps with a local unlocked key without plaintext bodies', () => {
    const senderKey = generateSecretKey();
    const senderPublicKey = getPublicKey(senderKey);
    const recipientPublicKey = getPublicKey(generateSecretKey());
    const message = 'Hello from AgoraMesh';

    const events = createLocalNostrIntroEvents({
      senderPrivateKeyHex: bytesToHex(senderKey),
      recipientPublicKey,
      message,
      context: { type: 'listing', id: 'listing-1', title: 'Test listing' }
    });

    expect(events).toHaveLength(2);
    expect(events.every((event) => event.kind === NOSTR_GIFT_WRAP_KIND)).toBe(true);
    expect(events.every((event) => verifyEvent(event))).toBe(true);
    expect(JSON.stringify(events)).not.toContain(message);
    expect(events.flatMap((event) => event.tags.filter((tag) => tag[0] === 'p').map((tag) => tag[1])).sort()).toEqual(
      [recipientPublicKey, senderPublicKey].sort()
    );
  });

  it('creates one local gift wrap when sender contacts the same pubkey', () => {
    const senderKey = generateSecretKey();
    const senderPublicKey = getPublicKey(senderKey);
    const message = 'Note to self';

    const events = createLocalNostrIntroEvents({
      senderPrivateKeyHex: bytesToHex(senderKey),
      recipientPublicKey: senderPublicKey,
      message
    });

    expect(events).toHaveLength(1);
    expect(events[0].tags).toContainEqual(['p', senderPublicKey]);
    const unwrapped = unwrapLocalNostrGiftWrap(events[0], bytesToHex(senderKey), senderPublicKey);
    expect(unwrapped.senderPublicKey).toBe(senderPublicKey);
    expect(unwrapped.recipientPublicKey).toBe(senderPublicKey);
    expect(unwrapped.rumor.content).toBe(message);
  });

  it('creates extension-backed gift wraps through signer NIP-44 encryption and signEvent', async () => {
    const senderKey = generateSecretKey();
    const senderPublicKey = getPublicKey(senderKey);
    const recipientPublicKey = getPublicKey(generateSecretKey());
    const message = 'Extension encrypted intro';

    const events = await createExtensionNostrIntroEvents({
      senderPublicKey,
      recipientPublicKey,
      message,
      encryptWithSigner: async () => encrypt('encrypted-payload', new Uint8Array(32).fill(1)),
      signWithSigner: async (event: NostrUnsignedEvent) => finalizeEvent(event, senderKey)
    });

    expect(events).toHaveLength(2);
    expect(events.every((event) => event.kind === NOSTR_GIFT_WRAP_KIND)).toBe(true);
    expect(events.every((event) => verifyEvent(event))).toBe(true);
    expect(JSON.stringify(events)).not.toContain(message);
    expect(events.flatMap((event) => event.tags.filter((tag) => tag[0] === 'p').map((tag) => tag[1])).sort()).toEqual(
      [recipientPublicKey, senderPublicKey].sort()
    );
  });

  it('creates one extension-backed gift wrap when sender contacts the same pubkey', async () => {
    const senderKey = generateSecretKey();
    const senderPublicKey = getPublicKey(senderKey);
    const message = 'Extension note to self';

    const events = await createExtensionNostrIntroEvents({
      senderPublicKey,
      recipientPublicKey: senderPublicKey,
      message,
      encryptWithSigner: async () => encrypt('encrypted-payload', new Uint8Array(32).fill(1)),
      signWithSigner: async (event: NostrUnsignedEvent) => finalizeEvent(event, senderKey)
    });

    expect(events).toHaveLength(1);
    expect(events[0].tags).toContainEqual(['p', senderPublicKey]);
    expect(events[0].kind).toBe(NOSTR_GIFT_WRAP_KIND);
    expect(verifyEvent(events[0])).toBe(true);
  });

  it('unwraps received local-key gift wraps and rejects the wrong recipient', () => {
    const senderKey = generateSecretKey();
    const senderPublicKey = getPublicKey(senderKey);
    const recipientKey = generateSecretKey();
    const recipientPublicKey = getPublicKey(recipientKey);
    const message = 'Read this inside AgoraMesh';
    const events = createLocalNostrIntroEvents({
      senderPrivateKeyHex: bytesToHex(senderKey),
      recipientPublicKey,
      message,
      context: { type: 'listing', id: 'listing-2', title: 'Inbox listing' }
    });
    const recipientWrap = events.find((event) => event.tags.some((tag) => tag[0] === 'p' && tag[1] === recipientPublicKey));

    expect(recipientWrap).toBeDefined();
    const unwrapped = unwrapLocalNostrGiftWrap(recipientWrap!, bytesToHex(recipientKey), recipientPublicKey);
    expect(unwrapped.senderPublicKey).toBe(senderPublicKey);
    expect(unwrapped.recipientPublicKey).toBe(recipientPublicKey);
    expect(unwrapped.subject).toBe('Inbox listing');
    expect(unwrapped.rumor.content).toContain(message);
    expect(() => unwrapLocalNostrGiftWrap(recipientWrap!, bytesToHex(generateSecretKey()), getPublicKey(generateSecretKey()))).toThrow();
  });

  it('uses a 30-day inbox lookback first and a 3-day overlap after cursors', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(nostrInboxSince()).toBeLessThanOrEqual(nowSeconds - 29 * 86_400);
    expect(nostrInboxSince(1_000_000)).toBe(1_000_000 - 3 * 86_400);
  });
});
