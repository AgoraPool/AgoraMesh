import { bytesToHex } from '@noble/hashes/utils';
import { describe, expect, it } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent } from 'nostr-tools/pure';
import { encrypt as nip04Encrypt } from 'nostr-tools/nip04';
import {
  createNwcRequestEvent,
  decryptNwcResponse,
  NWC_REQUEST_KIND,
  NWC_RESPONSE_KIND,
  parseNwcUri
} from './nwc';
import type { NostrEvent } from './events';

describe('NIP-47 NWC helpers', () => {
  it('parses a valid NWC URI and rejects insecure relays or malformed secrets', () => {
    const walletKey = generateSecretKey();
    const clientKey = generateSecretKey();
    const walletPublicKey = getPublicKey(walletKey);
    const clientSecret = bytesToHex(clientKey);

    const parsed = parseNwcUri(
      `nostr+walletconnect://${walletPublicKey}?relay=${encodeURIComponent('wss://wallet.example')}&secret=${clientSecret}&lud16=seller@example.com`
    );

    expect(parsed.walletPublicKey).toBe(walletPublicKey);
    expect(parsed.clientSecret).toBe(clientSecret);
    expect(parsed.clientPublicKey).toBe(getPublicKey(clientKey));
    expect(parsed.relayUrls).toEqual(['wss://wallet.example']);
    expect(parsed.lud16).toBe('seller@example.com');

    expect(() => parseNwcUri(`nostr+walletconnect://${walletPublicKey}?relay=ws://wallet.example&secret=${clientSecret}`)).toThrow(/wss/);
    expect(() => parseNwcUri(`nostr+walletconnect://${walletPublicKey}?relay=wss://wallet.example&secret=abc`)).toThrow(/secret/);
  });

  it('creates signed encrypted kind 23194 requests with the wallet p tag', () => {
    const walletKey = generateSecretKey();
    const clientKey = generateSecretKey();
    const walletPublicKey = getPublicKey(walletKey);
    const clientSecret = bytesToHex(clientKey);

    const request = createNwcRequestEvent(clientSecret, walletPublicKey, {
      method: 'pay_invoice',
      params: { invoice: 'lnbc1example' }
    });

    expect(request.kind).toBe(NWC_REQUEST_KIND);
    expect(request.pubkey).toBe(getPublicKey(clientKey));
    expect(request.tags).toContainEqual(['p', walletPublicKey]);
    expect(verifyEvent(request)).toBe(true);
    expect(JSON.stringify(request)).not.toContain('lnbc1example');
  });

  it('decrypts only matching signed wallet responses', () => {
    const walletKey = generateSecretKey();
    const clientKey = generateSecretKey();
    const walletPublicKey = getPublicKey(walletKey);
    const clientPublicKey = getPublicKey(clientKey);
    const clientSecret = bytesToHex(clientKey);
    const request = createNwcRequestEvent(clientSecret, walletPublicKey, { method: 'get_info' });
    const response = finalizeEvent(
      {
        kind: NWC_RESPONSE_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['e', request.id],
          ['p', clientPublicKey]
        ],
        content: nip04Encrypt(walletKey, clientPublicKey, JSON.stringify({ result_type: 'get_info', result: { methods: ['pay_invoice'] } }))
      },
      walletKey
    ) as NostrEvent;

    expect(decryptNwcResponse(response, clientSecret, walletPublicKey, request.id)).toMatchObject({
      result_type: 'get_info',
      result: { methods: ['pay_invoice'] }
    });

    expect(() => decryptNwcResponse(response, clientSecret, walletPublicKey, 'wrong-request')).toThrow(/request/);
    const wrongWallet = getPublicKey(generateSecretKey());
    expect(() => decryptNwcResponse(response, clientSecret, wrongWallet, request.id)).toThrow(/wallet/);
  });
});
