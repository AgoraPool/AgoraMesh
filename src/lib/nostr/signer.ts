import { BunkerSigner, createNostrConnectURI } from 'nostr-tools/nip46';
import { decrypt as decryptNip44, getConversationKey } from 'nostr-tools/nip44';
import { SimplePool } from 'nostr-tools/pool';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { verifyNostrEvent, type NostrEvent, type NostrUnsignedEvent } from './events';
import type { NostrSignerState } from '../../types/domain';

interface NostrExtension {
  getPublicKey?: () => Promise<string>;
  signEvent?: (event: NostrUnsignedEvent) => Promise<NostrEvent>;
  nip44?: {
    encrypt?: (pubkey: string, plaintext: string) => Promise<string>;
    decrypt?: (pubkey: string, ciphertext: string) => Promise<string>;
  };
}

declare global {
  interface Window {
    nostr?: NostrExtension;
  }
}

export interface NostrConnectPairing {
  uri: string;
  promise: Promise<NostrSignerState>;
}

const DEFAULT_NOSTR_CONNECT_RELAYS = ['wss://relay.primal.net', 'wss://relay.damus.io'];
const NOSTR_CONNECT_PERMS = ['get_public_key', 'sign_event', 'nip44_encrypt', 'nip44_decrypt'];
const NOSTR_CONNECT_TIMEOUT_MS = 120_000;
const NOSTR_CONNECT_KIND = 24133;
const NOSTR_CONNECT_PENDING_KEY = 'agoramesh:nip46:pending';
const NOSTR_CONNECT_POLL_MS = 2_000;

let activeSignerProvider: NostrSignerState['provider'];
let activeNostrConnectSigner: BunkerSigner | undefined;

interface PendingNostrConnectPairing {
  uri: string;
  clientSecretHex: string;
  clientPubkey: string;
  relays: string[];
  secret: string;
  createdAtMs: number;
}

function extension(): NostrExtension | undefined {
  return typeof window === 'undefined' ? undefined : window.nostr;
}

function requestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `nostr_connect_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function appUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return `${window.location.origin}${window.location.pathname}`;
}

function appIconUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return `${window.location.origin}/icons/icon.svg`;
}

function uniqueRelays(relays: string[]): string[] {
  const normalized = relays.map((relay) => relay.trim()).filter((relay) => relay.startsWith('wss://'));
  return [...new Set(normalized.length > 0 ? normalized : DEFAULT_NOSTR_CONNECT_RELAYS)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function storePendingPairing(pairing: PendingNostrConnectPairing): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(NOSTR_CONNECT_PENDING_KEY, JSON.stringify(pairing));
  } catch {
    // Pairing can still work while the current page stays alive.
  }
}

function clearPendingPairing(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(NOSTR_CONNECT_PENDING_KEY);
  } catch {
    // Ignore storage access failures.
  }
}

function readPendingPairing(): PendingNostrConnectPairing | undefined {
  if (typeof sessionStorage === 'undefined') return undefined;
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(NOSTR_CONNECT_PENDING_KEY);
  } catch {
    return undefined;
  }
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      clearPendingPairing();
      return undefined;
    }
    const parsedRelays = parsed.relays;
    if (
      typeof parsed.uri === 'string' &&
      typeof parsed.clientSecretHex === 'string' &&
      /^[0-9a-f]{64}$/i.test(parsed.clientSecretHex) &&
      typeof parsed.clientPubkey === 'string' &&
      /^[0-9a-f]{64}$/i.test(parsed.clientPubkey) &&
      Array.isArray(parsedRelays) &&
      typeof parsed.secret === 'string' &&
      typeof parsed.createdAtMs === 'number'
    ) {
      if (Date.now() - parsed.createdAtMs <= NOSTR_CONNECT_TIMEOUT_MS) {
        return {
          uri: parsed.uri,
          clientSecretHex: parsed.clientSecretHex.toLowerCase(),
          clientPubkey: parsed.clientPubkey.toLowerCase(),
          relays: uniqueRelays(parsedRelays.filter((relay): relay is string => typeof relay === 'string')),
          secret: parsed.secret,
          createdAtMs: parsed.createdAtMs
        };
      }
    }
  } catch {
    // Ignore malformed stale session data.
  }
  clearPendingPairing();
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function firstSuccessful<T>(promises: Promise<T>[]): Promise<T> {
  return new Promise((resolve, reject) => {
    let rejected = 0;
    let lastError: unknown;
    for (const promise of promises) {
      void promise.then(resolve).catch((error) => {
        rejected += 1;
        lastError = error;
        if (rejected === promises.length) reject(lastError instanceof Error ? lastError : new Error('Nostr Connect pairing failed.'));
      });
    }
  });
}

async function activateNostrConnectSigner(signer: BunkerSigner): Promise<NostrSignerState> {
  activeNostrConnectSigner = signer;
  activeSignerProvider = 'nip46';
  clearPendingPairing();
  const publicKey = (await signer.getPublicKey()).toLowerCase();
  return { available: true, connected: true, publicKey, provider: 'nip46' as const };
}

function signerFromConnectionEvent(pending: PendingNostrConnectPairing, event: NostrEvent): BunkerSigner | undefined {
  if (event.kind !== NOSTR_CONNECT_KIND || !verifyNostrEvent(event)) return undefined;
  if (!event.tags.some((tag) => tag[0] === 'p' && tag[1]?.toLowerCase() === pending.clientPubkey)) return undefined;
  const conversationKey = getConversationKey(hexToBytes(pending.clientSecretHex), event.pubkey);
  const decrypted: unknown = JSON.parse(decryptNip44(event.content, conversationKey));
  if (!isRecord(decrypted) || decrypted.result !== pending.secret) return undefined;
  return BunkerSigner.fromBunker(hexToBytes(pending.clientSecretHex), {
    pubkey: event.pubkey,
    relays: pending.relays,
    secret: pending.secret
  });
}

async function findStoredConnectionSigner(pending: PendingNostrConnectPairing): Promise<BunkerSigner | undefined> {
  const pool = new SimplePool();
  try {
    const events = (await pool.querySync(
      pending.relays,
      {
        kinds: [NOSTR_CONNECT_KIND],
        '#p': [pending.clientPubkey],
        since: Math.max(0, Math.floor(pending.createdAtMs / 1000) - 60),
        limit: 50
      },
      { maxWait: 5_000 }
    )) as NostrEvent[];
    for (const event of events.sort((left, right) => right.created_at - left.created_at)) {
      try {
        const signer = signerFromConnectionEvent(pending, event);
        if (signer) return signer;
      } catch {
        // Ignore unrelated or undecryptable NIP-46 events for this client key.
      }
    }
    return undefined;
  } finally {
    pool.close(pending.relays);
  }
}

async function pollStoredConnectionSigner(pending: PendingNostrConnectPairing): Promise<BunkerSigner> {
  const deadline = pending.createdAtMs + NOSTR_CONNECT_TIMEOUT_MS;
  while (Date.now() <= deadline) {
    const signer = await findStoredConnectionSigner(pending);
    if (signer) return signer;
    await sleep(NOSTR_CONNECT_POLL_MS);
  }
  throw new Error('Nostr Connect pairing timed out before a signer response was found.');
}

function waitForPendingPairing(pending: PendingNostrConnectPairing): Promise<NostrSignerState> {
  const clientSecretKey = hexToBytes(pending.clientSecretHex);
  return firstSuccessful([
    BunkerSigner.fromURI(clientSecretKey, pending.uri, { skipSwitchRelays: true }, NOSTR_CONNECT_TIMEOUT_MS),
    pollStoredConnectionSigner(pending)
  ]).then(activateNostrConnectSigner);
}

export function startNostrConnectPairing(relays: string[] = DEFAULT_NOSTR_CONNECT_RELAYS): NostrConnectPairing {
  const clientSecretKey = generateSecretKey();
  const clientPubkey = getPublicKey(clientSecretKey);
  const normalizedRelays = uniqueRelays(relays);
  const secret = requestId();
  const url = appUrl();
  const image = appIconUrl();
  const uri = createNostrConnectURI({
    clientPubkey,
    relays: normalizedRelays,
    secret,
    perms: NOSTR_CONNECT_PERMS,
    name: 'AgoraMesh',
    ...(url ? { url } : {}),
    ...(image ? { image } : {})
  });
  const pending: PendingNostrConnectPairing = {
    uri,
    clientSecretHex: bytesToHex(clientSecretKey),
    clientPubkey,
    relays: normalizedRelays,
    secret,
    createdAtMs: Date.now()
  };
  storePendingPairing(pending);
  const promise = waitForPendingPairing(pending);
  return { uri, promise };
}

export function resumeNostrConnectPairing(): NostrConnectPairing | undefined {
  const pending = readPendingPairing();
  if (!pending) return undefined;
  return { uri: pending.uri, promise: waitForPendingPairing(pending) };
}

export function openNostrConnectPairingUri(uri: string): void {
  if (typeof window === 'undefined') return;
  const opened = window.open(uri, '_blank', 'noopener,noreferrer');
  if (opened) return;
  const link = window.document.createElement('a');
  link.href = uri;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.click();
}

async function connectNostrConnectSigner(): Promise<NostrSignerState> {
  try {
    const pairing = startNostrConnectPairing();
    openNostrConnectPairingUri(pairing.uri);
    return await pairing.promise;
  } catch (error) {
    return {
      available: true,
      connected: false,
      provider: 'nip46',
      lastError: error instanceof Error ? error.message : 'Nostr Connect pairing failed.'
    };
  }
}

export function detectNostrSigner(): NostrSignerState {
  const nostr = extension();
  if (nostr?.getPublicKey && nostr.signEvent) return { available: true, connected: false, provider: 'nip07' };
  return { available: false, connected: false };
}

export async function connectNostrSigner(): Promise<NostrSignerState> {
  const nostr = extension();
  if (!nostr?.getPublicKey || !nostr.signEvent) return connectNostrConnectSigner();
  try {
    const publicKey = (await nostr.getPublicKey()).toLowerCase();
    activeSignerProvider = 'nip07';
    return { available: true, connected: true, publicKey, provider: 'nip07' };
  } catch (error) {
    return {
      available: true,
      connected: false,
      provider: 'nip07',
      lastError: error instanceof Error ? error.message : 'Signer connection was rejected.'
    };
  }
}

export async function signWithNostrSigner(event: NostrUnsignedEvent, expectedPublicKey: string): Promise<NostrEvent> {
  const nostr = extension();
  let signed: NostrEvent;
  if (activeSignerProvider === 'nip46' && activeNostrConnectSigner) {
    signed = (await activeNostrConnectSigner.signEvent(event)) as NostrEvent;
  } else if (nostr?.signEvent) {
    signed = await nostr.signEvent(event);
  } else {
    throw new Error('No Nostr signer is connected.');
  }

  if (signed.pubkey.toLowerCase() !== expectedPublicKey.toLowerCase()) {
    throw new Error('Signer public key does not match this object author.');
  }
  if (
    signed.kind !== event.kind ||
    signed.created_at !== event.created_at ||
    signed.content !== event.content ||
    JSON.stringify(signed.tags) !== JSON.stringify(event.tags)
  ) {
    throw new Error('Signer returned a modified event.');
  }
  if (!verifyNostrEvent(signed)) {
    throw new Error('Signer returned an invalid event signature.');
  }
  return signed;
}

export function signerSupportsNip44Encryption(): boolean {
  return Boolean(extension()?.nip44?.encrypt) || Boolean(activeNostrConnectSigner);
}

export function signerSupportsNip44Decryption(): boolean {
  return Boolean(extension()?.nip44?.decrypt) || Boolean(activeNostrConnectSigner);
}

export async function encryptWithNostrSigner(recipientPublicKey: string, plaintext: string): Promise<string> {
  const encrypt = extension()?.nip44?.encrypt;
  if (activeSignerProvider === 'nip46' && activeNostrConnectSigner) {
    return activeNostrConnectSigner.nip44Encrypt(recipientPublicKey, plaintext);
  }
  if (!encrypt) {
    throw new Error('Nostr signer does not expose NIP-44 encryption.');
  }
  return encrypt(recipientPublicKey, plaintext);
}

export async function decryptWithNostrSigner(senderPublicKey: string, ciphertext: string): Promise<string> {
  const decrypt = extension()?.nip44?.decrypt;
  if (activeSignerProvider === 'nip46' && activeNostrConnectSigner) {
    return activeNostrConnectSigner.nip44Decrypt(senderPublicKey, ciphertext);
  }
  if (!decrypt) {
    throw new Error('Nostr signer does not expose NIP-44 decryption.');
  }
  return decrypt(senderPublicKey, ciphertext);
}
