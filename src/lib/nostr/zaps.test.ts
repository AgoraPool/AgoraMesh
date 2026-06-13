import { bytesToHex } from '@noble/hashes/utils';
import { describe, expect, it } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent } from 'nostr-tools/pure';
import { signZapRequestLocally, signZapRequestWithExtension, validateZapReceipt, validateZapRequest, NOSTR_ZAP_RECEIPT_KIND } from './zaps';
import type { NostrEvent, NostrUnsignedEvent } from './events';

describe('NIP-57 zap helpers', () => {
  function signedZapFixture() {
    const buyerKey = generateSecretKey();
    const sellerKey = generateSecretKey();
    const buyerPublicKey = getPublicKey(buyerKey);
    const sellerPublicKey = getPublicKey(sellerKey);
    const args = {
      buyerPublicKey,
      sellerPublicKey,
      amountMsats: 21000,
      lnurl: 'seller@example.com',
      relays: ['wss://relay.example'],
      content: '',
      listingCoordinate: `30402:${sellerPublicKey}:listing_1`
    };
    return { args, buyerKey, zapRequest: signZapRequestLocally(args, bytesToHex(buyerKey)) };
  }

  it('signs and validates local zap requests', () => {
    const { args, zapRequest } = signedZapFixture();

    expect(zapRequest.kind).toBe(9734);
    expect(zapRequest.tags).toContainEqual(['amount', '21000']);
    expect(zapRequest.tags).toContainEqual(['p', args.sellerPublicKey]);
    expect(zapRequest.tags).toContainEqual(['a', args.listingCoordinate]);
    expect(verifyEvent(zapRequest)).toBe(true);
    expect(() => validateZapRequest(zapRequest, args)).not.toThrow();
  });

  it('signs extension zap requests and rejects signer pubkey mismatch', async () => {
    const { args } = signedZapFixture();
    const buyerKey = generateSecretKey();
    const buyerPublicKey = getPublicKey(buyerKey);
    const matchingArgs = { ...args, buyerPublicKey };

    await expect(signZapRequestWithExtension(matchingArgs, async (event: NostrUnsignedEvent) => finalizeEvent(event, buyerKey) as NostrEvent)).resolves.toMatchObject({
      pubkey: buyerPublicKey,
      kind: 9734
    });
    await expect(signZapRequestWithExtension(args, async (event: NostrUnsignedEvent) => finalizeEvent(event, buyerKey) as NostrEvent)).rejects.toThrow(
      /buyer public key/i
    );
  });

  it('accepts a matching zap receipt from the LNURL server pubkey', () => {
    const { args, zapRequest } = signedZapFixture();
    const walletKey = generateSecretKey();
    const walletPublicKey = getPublicKey(walletKey);
    const bolt11 = 'lnbc1exampleinvoice';
    const receipt = finalizeEvent(
      {
        kind: NOSTR_ZAP_RECEIPT_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['p', args.sellerPublicKey],
          ['P', args.buyerPublicKey],
          ['a', args.listingCoordinate],
          ['bolt11', bolt11],
          ['description', JSON.stringify(zapRequest)]
        ],
        content: ''
      },
      walletKey
    ) as NostrEvent;

    expect(validateZapReceipt({ receipt, zapRequest, bolt11, sellerWalletPubkey: walletPublicKey })).toBe(receipt);
  });

  it('rejects receipts with the wrong invoice, buyer, seller, request, or wallet signer', () => {
    const { args, buyerKey, zapRequest } = signedZapFixture();
    const walletKey = generateSecretKey();
    const walletPublicKey = getPublicKey(walletKey);
    const bolt11 = 'lnbc1exampleinvoice';
    const makeReceipt = (tags: string[][]): NostrEvent =>
      finalizeEvent(
        {
          kind: NOSTR_ZAP_RECEIPT_KIND,
          created_at: Math.floor(Date.now() / 1000),
          tags,
          content: ''
        },
        walletKey
      ) as NostrEvent;
    const receiptTags = [
      ['p', args.sellerPublicKey],
      ['P', args.buyerPublicKey],
      ['bolt11', bolt11],
      ['description', JSON.stringify(zapRequest)]
    ];
    const receipt = makeReceipt(receiptTags);

    expect(() =>
      validateZapReceipt({
        receipt: makeReceipt(receiptTags.map((tag) => (tag[0] === 'bolt11' ? ['bolt11', 'lnbc1wrong'] : tag))),
        zapRequest,
        bolt11,
        sellerWalletPubkey: walletPublicKey
      })
    ).toThrow(/invoice/i);
    expect(() => validateZapReceipt({ receipt, zapRequest, bolt11, sellerWalletPubkey: getPublicKey(generateSecretKey()) })).toThrow(/LNURL server/i);
    expect(() =>
      validateZapReceipt({
        receipt: makeReceipt(receiptTags.map((tag) => (tag[0] === 'p' ? ['p', getPublicKey(generateSecretKey())] : tag))),
        zapRequest,
        bolt11,
        sellerWalletPubkey: walletPublicKey
      })
    ).toThrow(/seller/i);
    expect(() =>
      validateZapReceipt({
        receipt: makeReceipt(receiptTags.map((tag) => (tag[0] === 'P' ? ['P', getPublicKey(generateSecretKey())] : tag))),
        zapRequest,
        bolt11,
        sellerWalletPubkey: walletPublicKey
      })
    ).toThrow(/buyer/i);
    expect(() =>
      validateZapReceipt({
        receipt: makeReceipt([
          ['p', args.sellerPublicKey],
          ['P', args.buyerPublicKey],
          ['bolt11', bolt11],
          ['description', JSON.stringify(signZapRequestLocally({ ...args, amountMsats: 22000 }, bytesToHex(buyerKey)))]
        ]),
        zapRequest,
        bolt11,
        sellerWalletPubkey: walletPublicKey
      })
    ).toThrow(/request|buyer/i);
  });
});
