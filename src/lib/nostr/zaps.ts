import { finalizeEvent, getEventHash, verifyEvent } from 'nostr-tools/pure';
import { newId, nowIso } from '../crypto/encoding';
import { privateKeyBytes } from '../crypto/identity';
import type { NostrEvent, NostrUnsignedEvent } from './events';
import { parseNostrEvent, verifyNostrEvent } from './events';
import type { RelayConfig } from '../../types/domain';

export const NOSTR_ZAP_REQUEST_KIND = 9734;
export const NOSTR_ZAP_RECEIPT_KIND = 9735;
export const OPERATOR_SUPPORT_TAG = 'agoramesh-supporter';
export const OPERATOR_SUPPORT_PURPOSE = 'agoramesh-support-badge';

export interface ZapRequestArgs {
  buyerPublicKey: string;
  sellerPublicKey: string;
  amountMsats: number;
  lnurl: string;
  relays: string[];
  content?: string;
  listingCoordinate?: string;
  customTags?: string[][];
}

export interface ValidateZapReceiptArgs {
  receipt: NostrEvent;
  zapRequest: NostrEvent;
  bolt11: string;
  sellerWalletPubkey: string;
}

export interface ZapReceiptFetchResult {
  relayUrl: string;
  ok: boolean;
  events: NostrEvent[];
  message: string;
}

export interface ValidateOperatorSupportReceiptArgs {
  receipt: NostrEvent;
  payerPublicKey?: string;
  operatorWalletPubkey: string;
  operatorLnurl: string;
  minimumMsats: number;
  bolt11?: string;
}

export interface OperatorSupportReceiptValidation {
  receipt: NostrEvent;
  zapRequest: NostrEvent;
  amountMsats: number;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function firstTag(event: Pick<NostrEvent, 'tags'> | Pick<NostrUnsignedEvent, 'tags'>, name: string): string | undefined {
  return event.tags.find((tag) => tag[0] === name)?.[1];
}

function relayTagHasValues(event: Pick<NostrEvent, 'tags'> | Pick<NostrUnsignedEvent, 'tags'>): boolean {
  return event.tags.some((tag) => tag[0] === 'relays' && tag.slice(1).some((value) => value.startsWith('wss://')));
}

export function unsignedZapRequest(args: ZapRequestArgs): NostrUnsignedEvent {
  const tags = [
    ['relays', ...args.relays],
    ['amount', String(args.amountMsats)],
    ['lnurl', args.lnurl],
    ['p', args.sellerPublicKey.toLowerCase()],
    ...(args.listingCoordinate ? [['a', args.listingCoordinate]] : []),
    ...(args.customTags ?? [])
  ];
  return {
    kind: NOSTR_ZAP_REQUEST_KIND,
    created_at: nowSeconds(),
    tags,
    content: args.content?.trim() ?? ''
  };
}

export function signZapRequestLocally(args: ZapRequestArgs, privateKeyHex: string): NostrEvent {
  const event = finalizeEvent(unsignedZapRequest(args), privateKeyBytes(privateKeyHex)) as NostrEvent;
  if (event.pubkey.toLowerCase() !== args.buyerPublicKey.toLowerCase()) {
    throw new Error('Zap request signing key does not match buyer public key.');
  }
  validateZapRequest(event, args);
  return event;
}

export async function signZapRequestWithExtension(
  args: ZapRequestArgs,
  signWithSigner: (event: NostrUnsignedEvent) => Promise<NostrEvent>
): Promise<NostrEvent> {
  const event = await signWithSigner(unsignedZapRequest(args));
  if (event.kind !== NOSTR_ZAP_REQUEST_KIND || event.pubkey.toLowerCase() !== args.buyerPublicKey.toLowerCase()) {
    throw new Error('Signed zap request does not match buyer public key.');
  }
  if (getEventHash(event) !== event.id || !verifyEvent(event)) {
    throw new Error('Signed zap request is invalid.');
  }
  validateZapRequest(event, args);
  return event;
}

export function validateZapRequest(event: NostrEvent, args: ZapRequestArgs): void {
  if (!verifyNostrEvent(event)) throw new Error('Zap request signature is invalid.');
  if (event.kind !== NOSTR_ZAP_REQUEST_KIND) throw new Error('Expected NIP-57 zap request.');
  if (event.pubkey.toLowerCase() !== args.buyerPublicKey.toLowerCase()) throw new Error('Zap request buyer does not match.');
  if (firstTag(event, 'p')?.toLowerCase() !== args.sellerPublicKey.toLowerCase()) throw new Error('Zap request seller does not match.');
  if (firstTag(event, 'amount') !== String(args.amountMsats)) throw new Error('Zap request amount does not match.');
  if (firstTag(event, 'lnurl') !== args.lnurl) throw new Error('Zap request LNURL does not match.');
  if (args.listingCoordinate && firstTag(event, 'a') !== args.listingCoordinate) throw new Error('Zap request listing reference does not match.');
  for (const tag of args.customTags ?? []) {
    if (!event.tags.some((eventTag) => eventTag.length === tag.length && eventTag.every((value, index) => value === tag[index]))) {
      throw new Error(`Zap request ${tag[0]} tag does not match.`);
    }
  }
  if (!relayTagHasValues(event)) throw new Error('Zap request did not include relays.');
}

function parseDescription(description: string): NostrEvent {
  return parseNostrEvent(JSON.parse(description));
}

export function validateZapReceipt(args: ValidateZapReceiptArgs): NostrEvent {
  const { receipt, zapRequest, bolt11, sellerWalletPubkey } = args;
  if (!verifyNostrEvent(receipt)) throw new Error('Zap receipt signature is invalid.');
  if (receipt.kind !== NOSTR_ZAP_RECEIPT_KIND) throw new Error('Expected NIP-57 zap receipt.');
  if (receipt.pubkey.toLowerCase() !== sellerWalletPubkey.toLowerCase()) throw new Error('Zap receipt signer does not match LNURL server.');
  if (firstTag(receipt, 'bolt11') !== bolt11) throw new Error('Zap receipt invoice does not match.');
  const buyerTag = firstTag(receipt, 'P');
  if (buyerTag && buyerTag.toLowerCase() !== zapRequest.pubkey.toLowerCase()) throw new Error('Zap receipt buyer tag does not match.');
  const describedRequest = parseDescription(firstTag(receipt, 'description') ?? '');
  if (!verifyNostrEvent(describedRequest)) throw new Error('Zap receipt description contains an invalid zap request.');
  if (describedRequest.id !== zapRequest.id) throw new Error('Zap receipt description does not match zap request.');
  if (describedRequest.pubkey.toLowerCase() !== zapRequest.pubkey.toLowerCase()) throw new Error('Zap receipt buyer does not match.');
  if (firstTag(describedRequest, 'amount') !== firstTag(zapRequest, 'amount')) throw new Error('Zap receipt amount does not match.');
  if (firstTag(describedRequest, 'lnurl') !== firstTag(zapRequest, 'lnurl')) throw new Error('Zap receipt LNURL does not match.');
  if (firstTag(receipt, 'p')?.toLowerCase() !== firstTag(zapRequest, 'p')?.toLowerCase()) throw new Error('Zap receipt seller tag does not match.');
  if (firstTag(describedRequest, 'p')?.toLowerCase() !== firstTag(zapRequest, 'p')?.toLowerCase()) throw new Error('Zap receipt described seller does not match.');
  if (firstTag(describedRequest, 'a') !== firstTag(zapRequest, 'a')) throw new Error('Zap receipt listing reference does not match.');
  if (!relayTagHasValues(zapRequest)) throw new Error('Zap request did not include relays.');
  return receipt;
}

export function validateOperatorSupportReceipt(args: ValidateOperatorSupportReceiptArgs): OperatorSupportReceiptValidation {
  const { receipt, operatorWalletPubkey, operatorLnurl, minimumMsats } = args;
  if (!verifyNostrEvent(receipt)) throw new Error('Zap receipt signature is invalid.');
  if (receipt.kind !== NOSTR_ZAP_RECEIPT_KIND) throw new Error('Expected NIP-57 zap receipt.');
  if (receipt.pubkey.toLowerCase() !== operatorWalletPubkey.toLowerCase()) throw new Error('Zap receipt signer does not match operator wallet.');
  if (firstTag(receipt, 'p')?.toLowerCase() !== operatorWalletPubkey.toLowerCase()) throw new Error('Zap receipt operator tag does not match.');
  if (args.bolt11 && firstTag(receipt, 'bolt11') !== args.bolt11) throw new Error('Zap receipt invoice does not match.');
  const describedRequest = parseDescription(firstTag(receipt, 'description') ?? '');
  if (!verifyNostrEvent(describedRequest)) throw new Error('Zap receipt description contains an invalid zap request.');
  const payerPublicKey = args.payerPublicKey?.toLowerCase() ?? describedRequest.pubkey.toLowerCase();
  const buyerTag = firstTag(receipt, 'P');
  if (buyerTag && buyerTag.toLowerCase() !== payerPublicKey) throw new Error('Zap receipt payer tag does not match.');
  if (describedRequest.pubkey.toLowerCase() !== payerPublicKey.toLowerCase()) throw new Error('Zap request payer does not match.');
  if (firstTag(describedRequest, 'p')?.toLowerCase() !== operatorWalletPubkey.toLowerCase()) throw new Error('Zap request operator recipient does not match.');
  if (firstTag(describedRequest, 'lnurl') !== operatorLnurl) throw new Error('Zap request operator LNURL does not match.');
  if (firstTag(describedRequest, 't') !== OPERATOR_SUPPORT_TAG) throw new Error('Zap request support tag is missing.');
  if (firstTag(describedRequest, 'purpose') !== OPERATOR_SUPPORT_PURPOSE) throw new Error('Zap request support purpose is missing.');
  if (!relayTagHasValues(describedRequest)) throw new Error('Zap request did not include relays.');
  const amountMsats = Number(firstTag(describedRequest, 'amount') ?? '0');
  if (!Number.isSafeInteger(amountMsats) || amountMsats < minimumMsats) throw new Error('Zap receipt amount is below the operator support minimum.');
  return { receipt, zapRequest: describedRequest, amountMsats };
}

export async function fetchZapReceiptsFromRelays(relays: RelayConfig[], sellerPublicKey: string, since?: number): Promise<ZapReceiptFetchResult[]> {
  const enabled = relays.filter((relay) => relay.enabled);
  return Promise.all(enabled.map((relay) => fetchZapReceiptsFromRelay(relay.url, sellerPublicKey, since)));
}

function fetchZapReceiptsFromRelay(relayUrl: string, sellerPublicKey: string, since?: number): Promise<ZapReceiptFetchResult> {
  return new Promise((resolve) => {
    const socket = new WebSocket(relayUrl);
    const subscriptionId = newId('zap');
    const events: NostrEvent[] = [];
    let settled = false;
    const finish = (ok: boolean, message: string): void => {
      if (settled) return;
      settled = true;
      socket.close();
      resolve({ relayUrl, ok, events, message });
    };
    const timeout = globalThis.setTimeout(() => finish(false, 'Relay timed out.'), 8000);
    socket.onopen = () => {
      socket.send(
        JSON.stringify([
          'REQ',
          subscriptionId,
          {
            kinds: [NOSTR_ZAP_RECEIPT_KIND],
            '#p': [sellerPublicKey.toLowerCase()],
            limit: 50,
            ...(since ? { since } : {})
          }
        ])
      );
    };
    socket.onerror = () => {
      globalThis.clearTimeout(timeout);
      finish(false, 'Relay connection failed.');
    };
    socket.onmessage = (message) => {
      try {
        const parsed: unknown = JSON.parse(String(message.data));
        if (!Array.isArray(parsed)) return;
        if (parsed[0] === 'EVENT' && parsed[1] === subscriptionId) {
          const event = parseNostrEvent(parsed[2]);
          if (event.kind === NOSTR_ZAP_RECEIPT_KIND) events.push(event);
        }
        if (parsed[0] === 'EOSE' && parsed[1] === subscriptionId) {
          globalThis.clearTimeout(timeout);
          finish(true, `Fetched ${events.length} zap receipt events at ${nowIso()}.`);
        }
      } catch {
        // Ignore malformed relay payloads and continue collecting valid receipts.
      }
    };
  });
}
