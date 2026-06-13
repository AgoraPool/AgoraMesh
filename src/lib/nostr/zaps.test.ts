import { bytesToHex } from '@noble/hashes/utils';
import { describe, expect, it } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent } from 'nostr-tools/pure';
import {
  signZapRequestLocally,
  signZapRequestWithExtension,
  validateOperatorSupportReceipt,
  validateZapReceipt,
  validateZapRequest,
  NOSTR_ZAP_RECEIPT_KIND,
  OPERATOR_SUPPORT_PURPOSE,
  OPERATOR_SUPPORT_TAG
} from './zaps';
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

  it('validates operator support receipts with support purpose tags', () => {
    const payerKey = generateSecretKey();
    const operatorKey = generateSecretKey();
    const payerPublicKey = getPublicKey(payerKey);
    const operatorPublicKey = getPublicKey(operatorKey);
    const bolt11 = 'lnbc1supportinvoice';
    const zapRequest = signZapRequestLocally(
      {
        buyerPublicKey: payerPublicKey,
        sellerPublicKey: operatorPublicKey,
        amountMsats: 5_000_000,
        lnurl: 'lnurl1operator',
        relays: ['wss://relay.example'],
        customTags: [
          ['t', OPERATOR_SUPPORT_TAG],
          ['purpose', OPERATOR_SUPPORT_PURPOSE]
        ]
      },
      bytesToHex(payerKey)
    );
    const receipt = finalizeEvent(
      {
        kind: NOSTR_ZAP_RECEIPT_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['p', operatorPublicKey],
          ['P', payerPublicKey],
          ['bolt11', bolt11],
          ['description', JSON.stringify(zapRequest)]
        ],
        content: ''
      },
      operatorKey
    ) as NostrEvent;

    expect(
      validateOperatorSupportReceipt({
        receipt,
        payerPublicKey,
        operatorWalletPubkey: operatorPublicKey,
        operatorLnurl: 'lnurl1operator',
        minimumMsats: 5_000_000,
        bolt11
      }).zapRequest.id
    ).toBe(zapRequest.id);
  });

  it('rejects invalid operator support receipts', () => {
    const payerKey = generateSecretKey();
    const operatorKey = generateSecretKey();
    const payerPublicKey = getPublicKey(payerKey);
    const operatorPublicKey = getPublicKey(operatorKey);
    const makeRequest = (customTags: string[][], amountMsats = 5_000_000, sellerPublicKey = operatorPublicKey): NostrEvent =>
      signZapRequestLocally(
        {
          buyerPublicKey: payerPublicKey,
          sellerPublicKey,
          amountMsats,
          lnurl: 'lnurl1operator',
          relays: ['wss://relay.example'],
          customTags
        },
        bytesToHex(payerKey)
      );
    const makeReceipt = (zapRequest: NostrEvent, tags: string[][] = []): NostrEvent =>
      finalizeEvent(
        {
          kind: NOSTR_ZAP_RECEIPT_KIND,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ['p', operatorPublicKey],
            ['P', payerPublicKey],
            ['bolt11', 'lnbc1supportinvoice'],
            ['description', JSON.stringify(zapRequest)],
            ...tags
          ],
          content: ''
        },
        operatorKey
      ) as NostrEvent;
    const validTags = [
      ['t', OPERATOR_SUPPORT_TAG],
      ['purpose', OPERATOR_SUPPORT_PURPOSE]
    ];
    const validRequest = makeRequest(validTags);

    expect(() =>
      validateOperatorSupportReceipt({
        receipt: makeReceipt(makeRequest([['t', OPERATOR_SUPPORT_TAG]])),
        payerPublicKey,
        operatorWalletPubkey: operatorPublicKey,
        operatorLnurl: 'lnurl1operator',
        minimumMsats: 5_000_000
      })
    ).toThrow(/purpose/i);
    expect(() =>
      validateOperatorSupportReceipt({
        receipt: makeReceipt(makeRequest(validTags, 4_999_000)),
        payerPublicKey,
        operatorWalletPubkey: operatorPublicKey,
        operatorLnurl: 'lnurl1operator',
        minimumMsats: 5_000_000
      })
    ).toThrow(/minimum/i);
    expect(() =>
      validateOperatorSupportReceipt({
        receipt: makeReceipt(validRequest),
        payerPublicKey: getPublicKey(generateSecretKey()),
        operatorWalletPubkey: operatorPublicKey,
        operatorLnurl: 'lnurl1operator',
        minimumMsats: 5_000_000
      })
    ).toThrow(/payer/i);
    expect(() =>
      validateOperatorSupportReceipt({
        receipt: makeReceipt(makeRequest(validTags, 5_000_000, getPublicKey(generateSecretKey()))),
        payerPublicKey,
        operatorWalletPubkey: operatorPublicKey,
        operatorLnurl: 'lnurl1operator',
        minimumMsats: 5_000_000
      })
    ).toThrow(/operator/i);
    expect(() =>
      validateOperatorSupportReceipt({
        receipt: makeReceipt(validRequest),
        payerPublicKey,
        operatorWalletPubkey: operatorPublicKey,
        operatorLnurl: 'lnurl1operator',
        minimumMsats: 5_000_000,
        bolt11: 'lnbc1wrong'
      })
    ).toThrow(/invoice/i);
  });
});
