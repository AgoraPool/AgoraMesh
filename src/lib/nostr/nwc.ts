import { getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import { encrypt as nip04Encrypt, decrypt as nip04Decrypt } from 'nostr-tools/nip04';
import { newId } from '../crypto/encoding';
import { privateKeyBytes } from '../crypto/identity';
import type { NwcConnection } from '../../types/domain';
import type { NostrEvent } from './events';
import { parseNostrEvent, verifyNostrEvent } from './events';

export const NWC_REQUEST_KIND = 23194;
export const NWC_RESPONSE_KIND = 23195;

export interface ParsedNwcUri {
  walletPublicKey: string;
  clientSecret: string;
  clientPublicKey: string;
  relayUrls: string[];
  lud16?: string;
}

export interface NwcRequestPayload {
  method: 'get_info' | 'pay_invoice';
  params?: Record<string, unknown>;
}

export interface NwcResponsePayload {
  result_type?: string;
  result?: Record<string, unknown>;
  error?: {
    code?: string;
    message?: string;
  };
}

export interface NwcRequestResult {
  request: NostrEvent;
  response: NostrEvent;
  payload: NwcResponsePayload;
  relayUrl: string;
}

const hex64 = /^[0-9a-f]{64}$/i;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function normalizeHex(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!hex64.test(normalized)) throw new Error(`${label} must be 64 hex characters.`);
  return normalized;
}

function responseTag(event: NostrEvent, name: string): string | undefined {
  return event.tags.find((tag) => tag[0] === name)?.[1];
}

export function parseNwcUri(value: string): ParsedNwcUri {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('NWC URI is required.');
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('NWC URI is malformed.');
  }
  if (url.protocol !== 'nostr+walletconnect:') throw new Error('NWC URI must start with nostr+walletconnect://.');
  const walletPublicKey = normalizeHex(url.hostname || url.pathname.replace(/^\/+/, ''), 'NWC wallet public key');
  const clientSecret = normalizeHex(url.searchParams.get('secret') ?? '', 'NWC client secret');
  const relayUrls = url.searchParams.getAll('relay').map((relay) => relay.trim()).filter(Boolean);
  if (relayUrls.length === 0) throw new Error('NWC URI must include at least one relay.');
  for (const relayUrl of relayUrls) {
    let parsedRelay: URL;
    try {
      parsedRelay = new URL(relayUrl);
    } catch {
      throw new Error('NWC relay URL is malformed.');
    }
    if (parsedRelay.protocol !== 'wss:') throw new Error('NWC relay must use wss://.');
  }
  return {
    walletPublicKey,
    clientSecret,
    clientPublicKey: getPublicKey(privateKeyBytes(clientSecret)),
    relayUrls,
    lud16: url.searchParams.get('lud16')?.trim() || undefined
  };
}

export function createNwcRequestEvent(clientSecret: string, walletPublicKey: string, payload: NwcRequestPayload): NostrEvent {
  const secret = normalizeHex(clientSecret, 'NWC client secret');
  const wallet = normalizeHex(walletPublicKey, 'NWC wallet public key');
  const encrypted = nip04Encrypt(privateKeyBytes(secret), wallet, JSON.stringify(payload));
  const event = finalizeEvent(
    {
      kind: NWC_REQUEST_KIND,
      created_at: nowSeconds(),
      tags: [['p', wallet]],
      content: encrypted
    },
    privateKeyBytes(secret)
  ) as NostrEvent;
  if (!verifyNostrEvent(event)) throw new Error('NWC request signature is invalid.');
  return event;
}

export function decryptNwcResponse(
  response: NostrEvent,
  clientSecret: string,
  walletPublicKey: string,
  requestEventId: string
): NwcResponsePayload {
  const secret = normalizeHex(clientSecret, 'NWC client secret');
  const wallet = normalizeHex(walletPublicKey, 'NWC wallet public key');
  const clientPublicKey = getPublicKey(privateKeyBytes(secret));
  if (!verifyNostrEvent(response)) throw new Error('NWC response signature is invalid.');
  if (response.kind !== NWC_RESPONSE_KIND) throw new Error('Expected NWC response event.');
  if (response.pubkey.toLowerCase() !== wallet) throw new Error('NWC response was not signed by the wallet.');
  if (responseTag(response, 'e') !== requestEventId) throw new Error('NWC response does not match the request.');
  if (responseTag(response, 'p')?.toLowerCase() !== clientPublicKey.toLowerCase()) throw new Error('NWC response client tag does not match.');
  const decrypted = nip04Decrypt(privateKeyBytes(secret), wallet, response.content);
  const parsed: unknown = JSON.parse(decrypted);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('NWC response payload is malformed.');
  const payload = parsed as NwcResponsePayload;
  if (payload.error) {
    throw new Error(payload.error.message || payload.error.code || 'NWC wallet returned an error.');
  }
  return payload;
}

export function sendNwcRequest(
  connection: NwcConnection,
  clientSecret: string,
  payload: NwcRequestPayload,
  timeoutMs = 15_000
): Promise<NwcRequestResult> {
  const request = createNwcRequestEvent(clientSecret, connection.walletPublicKey, payload);
  return sendNwcRequestEvent(connection.relayUrls, connection.walletPublicKey, clientSecret, request, timeoutMs);
}

export async function requestNwcInfo(connection: NwcConnection, clientSecret: string): Promise<NwcRequestResult> {
  return sendNwcRequest(connection, clientSecret, { method: 'get_info' });
}

export async function payNwcInvoice(connection: NwcConnection, clientSecret: string, invoice: string): Promise<NwcRequestResult> {
  return sendNwcRequest(connection, clientSecret, { method: 'pay_invoice', params: { invoice } }, 30_000);
}

async function sendNwcRequestEvent(
  relayUrls: string[],
  walletPublicKey: string,
  clientSecret: string,
  request: NostrEvent,
  timeoutMs: number
): Promise<NwcRequestResult> {
  const errors: string[] = [];
  for (const relayUrl of relayUrls) {
    try {
      return await sendNwcRequestToRelay(relayUrl, walletPublicKey, clientSecret, request, timeoutMs);
    } catch (error) {
      errors.push(`${relayUrl}: ${error instanceof Error ? error.message : 'NWC request failed.'}`);
    }
  }
  throw new Error(errors[0] ?? 'NWC wallet did not return a response.');
}

function sendNwcRequestToRelay(
  relayUrl: string,
  walletPublicKey: string,
  clientSecret: string,
  request: NostrEvent,
  timeoutMs: number
): Promise<NwcRequestResult> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(relayUrl);
    const subscriptionId = newId('nwc');
    let settled = false;
    const clientPublicKey = getPublicKey(privateKeyBytes(clientSecret));

    const finish = (error?: Error, result?: NwcRequestResult): void => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeout);
      try {
        socket.close();
      } catch {
        // Already closed.
      }
      if (error) reject(error);
      else if (result) resolve(result);
      else reject(new Error('NWC request failed.'));
    };

    const timeout = globalThis.setTimeout(() => finish(new Error('NWC wallet response timed out.')), timeoutMs);

    socket.onopen = () => {
      socket.send(
        JSON.stringify([
          'REQ',
          subscriptionId,
          {
            kinds: [NWC_RESPONSE_KIND],
            authors: [walletPublicKey.toLowerCase()],
            '#e': [request.id],
            '#p': [clientPublicKey],
            limit: 1
          }
        ])
      );
      socket.send(JSON.stringify(['EVENT', request]));
    };

    socket.onerror = () => finish(new Error('NWC relay connection failed.'));

    socket.onmessage = (message) => {
      try {
        const parsed: unknown = JSON.parse(String(message.data));
        if (!Array.isArray(parsed)) return;
        if (parsed[0] === 'NOTICE' && typeof parsed[1] === 'string') {
          return;
        }
        if (parsed[0] === 'OK' && parsed[1] === request.id && parsed[2] === false) {
          finish(new Error(String(parsed[3] ?? 'NWC relay rejected the request.')));
          return;
        }
        if (parsed[0] !== 'EVENT' || parsed[1] !== subscriptionId) return;
        const response = parseNostrEvent(parsed[2]);
        const payload = decryptNwcResponse(response, clientSecret, walletPublicKey, request.id);
        finish(undefined, { request, response, payload, relayUrl });
      } catch (error) {
        finish(error instanceof Error ? error : new Error('NWC response could not be decoded.'));
      }
    };
  });
}
