import { createNostrConnectURI } from 'nostr-tools/nip46';
import { decrypt as decryptNip44, encrypt as encryptNip44, getConversationKey } from 'nostr-tools/nip44';
import { SimplePool } from 'nostr-tools/pool';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
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
const NOSTR_CONNECT_REQUEST_TIMEOUT_MS = 180_000;
const NOSTR_CONNECT_SESSION_KEY = 'agoramesh:nip46:session';
const NOSTR_EXTENSION_SESSION_KEY = 'agoramesh:nip07:connected';

let activeSignerProvider: NostrSignerState['provider'];
let activeNostrConnectSession: NostrConnectSession | undefined;

interface NostrConnectSession {
  clientSecretHex: string;
  clientPubkey: string;
  remotePubkey: string;
  relays: string[];
  secret: string;
}

interface PendingNostrConnectPairing extends Omit<NostrConnectSession, 'remotePubkey'> {
  uri: string;
  createdAtMs: number;
}

interface StoredNostrConnectSession extends NostrConnectSession {
  publicKey: string;
  connectedAtMs: number;
}

interface StoredExtensionSession {
  publicKey: string;
  connectedAtMs: number;
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

function storeNostrConnectSession(session: StoredNostrConnectSession): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(NOSTR_CONNECT_SESSION_KEY, JSON.stringify(session));
  } catch {
    // The active in-memory session can still be used until the page unloads.
  }
}

function readStoredNostrConnectSession(): StoredNostrConnectSession | undefined {
  if (typeof sessionStorage === 'undefined') return undefined;
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(NOSTR_CONNECT_SESSION_KEY);
  } catch {
    return undefined;
  }
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    const parsedRelays = isRecord(parsed) ? parsed.relays : undefined;
    if (
      isRecord(parsed) &&
      typeof parsed.clientSecretHex === 'string' &&
      /^[0-9a-f]{64}$/i.test(parsed.clientSecretHex) &&
      typeof parsed.clientPubkey === 'string' &&
      /^[0-9a-f]{64}$/i.test(parsed.clientPubkey) &&
      typeof parsed.remotePubkey === 'string' &&
      /^[0-9a-f]{64}$/i.test(parsed.remotePubkey) &&
      typeof parsed.publicKey === 'string' &&
      /^[0-9a-f]{64}$/i.test(parsed.publicKey) &&
      Array.isArray(parsedRelays) &&
      typeof parsed.secret === 'string' &&
      typeof parsed.connectedAtMs === 'number'
    ) {
      return {
        clientSecretHex: parsed.clientSecretHex.toLowerCase(),
        clientPubkey: parsed.clientPubkey.toLowerCase(),
        remotePubkey: parsed.remotePubkey.toLowerCase(),
        publicKey: parsed.publicKey.toLowerCase(),
        relays: uniqueRelays(parsedRelays.filter((relay): relay is string => typeof relay === 'string')),
        secret: parsed.secret,
        connectedAtMs: parsed.connectedAtMs
      };
    }
  } catch {
    // Ignore malformed stale session data.
  }
  clearStoredNostrConnectSession();
  return undefined;
}

function clearStoredNostrConnectSession(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(NOSTR_CONNECT_SESSION_KEY);
  } catch {
    // Ignore storage access failures.
  }
}

function storeExtensionSession(publicKey: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(NOSTR_EXTENSION_SESSION_KEY, JSON.stringify({ publicKey: publicKey.toLowerCase(), connectedAtMs: Date.now() }));
  } catch {
    // The extension can still be used while the current page stays alive.
  }
}

function readStoredExtensionSession(): StoredExtensionSession | undefined {
  if (typeof sessionStorage === 'undefined') return undefined;
  try {
    const raw = sessionStorage.getItem(NOSTR_EXTENSION_SESSION_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed) && typeof parsed.publicKey === 'string' && /^[0-9a-f]{64}$/i.test(parsed.publicKey) && typeof parsed.connectedAtMs === 'number') {
      return { publicKey: parsed.publicKey.toLowerCase(), connectedAtMs: parsed.connectedAtMs };
    }
  } catch {
    // Ignore malformed stale session data.
  }
  clearStoredExtensionSession();
  return undefined;
}

function clearStoredExtensionSession(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(NOSTR_EXTENSION_SESSION_KEY);
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

function firstSuccessful<T>(promises: Promise<T>[], errorMessage = 'Nostr Connect request failed.'): Promise<T> {
  return new Promise((resolve, reject) => {
    let rejected = 0;
    let lastError: unknown;
    for (const promise of promises) {
      void promise.then(resolve).catch((error) => {
        rejected += 1;
        lastError = error;
        if (rejected === promises.length) reject(lastError instanceof Error ? lastError : new Error(errorMessage));
      });
    }
  });
}

async function activateNostrConnectSession(session: NostrConnectSession): Promise<NostrSignerState> {
  activeNostrConnectSession = session;
  activeSignerProvider = 'nip46';
  clearPendingPairing();
  const publicKey = (await sendNostrConnectRequest(session, 'get_public_key', [])).toLowerCase();
  storeNostrConnectSession({ ...session, publicKey, connectedAtMs: Date.now() });
  return { available: true, connected: true, publicKey, provider: 'nip46' as const };
}

function sessionFromConnectionEvent(pending: PendingNostrConnectPairing, event: NostrEvent): NostrConnectSession | undefined {
  if (event.kind !== NOSTR_CONNECT_KIND || !verifyNostrEvent(event)) return undefined;
  if (!event.tags.some((tag) => tag[0] === 'p' && tag[1]?.toLowerCase() === pending.clientPubkey)) return undefined;
  const conversationKey = getConversationKey(hexToBytes(pending.clientSecretHex), event.pubkey);
  const decrypted: unknown = JSON.parse(decryptNip44(event.content, conversationKey));
  if (!isRecord(decrypted) || decrypted.result !== pending.secret) return undefined;
  return {
    clientSecretHex: pending.clientSecretHex,
    clientPubkey: pending.clientPubkey,
    remotePubkey: event.pubkey.toLowerCase(),
    relays: pending.relays,
    secret: pending.secret
  };
}

async function findStoredConnectionSession(pending: PendingNostrConnectPairing): Promise<NostrConnectSession | undefined> {
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
        const session = sessionFromConnectionEvent(pending, event);
        if (session) return session;
      } catch {
        // Ignore unrelated or undecryptable NIP-46 events for this client key.
      }
    }
    return undefined;
  } finally {
    pool.close(pending.relays);
  }
}

async function pollStoredConnectionSession(pending: PendingNostrConnectPairing): Promise<NostrConnectSession> {
  const deadline = pending.createdAtMs + NOSTR_CONNECT_TIMEOUT_MS;
  while (Date.now() <= deadline) {
    const session = await findStoredConnectionSession(pending);
    if (session) return session;
    await sleep(NOSTR_CONNECT_POLL_MS);
  }
  throw new Error('Nostr Connect pairing timed out before a signer response was found.');
}

function waitForLiveConnectionSession(pending: PendingNostrConnectPairing): Promise<NostrConnectSession> {
  const pool = new SimplePool();
  return new Promise((resolve, reject) => {
    let settled = false;
    let closer: { close: (reason?: string) => void } | undefined;
    const finish = (session?: NostrConnectSession, error?: Error): void => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeout);
      closer?.close();
      pool.close(pending.relays);
      if (session) {
        resolve(session);
      } else {
        reject(error ?? new Error('Nostr Connect pairing failed.'));
      }
    };
    const timeout = globalThis.setTimeout(() => finish(undefined, new Error('Nostr Connect pairing timed out.')), NOSTR_CONNECT_TIMEOUT_MS);
    closer = pool.subscribe(
      pending.relays,
      {
        kinds: [NOSTR_CONNECT_KIND],
        '#p': [pending.clientPubkey],
        since: Math.max(0, Math.floor(pending.createdAtMs / 1000) - 60),
        limit: 0
      },
      {
        onevent: (event) => {
          try {
            const session = sessionFromConnectionEvent(pending, event as NostrEvent);
            if (!session) return;
            globalThis.clearTimeout(timeout);
            finish(session);
          } catch {
            // Ignore unrelated or undecryptable NIP-46 events.
          }
        },
        onclose: () => {
          globalThis.clearTimeout(timeout);
          finish(undefined, new Error('Nostr Connect subscription closed before connection was established.'));
        }
      }
    );
  });
}

function waitForPendingPairing(pending: PendingNostrConnectPairing): Promise<NostrSignerState> {
  return firstSuccessful([
    waitForLiveConnectionSession(pending),
    pollStoredConnectionSession(pending)
  ], 'Nostr Connect pairing failed.').then(activateNostrConnectSession);
}

function nostrConnectConversationKey(session: NostrConnectSession): Uint8Array {
  return getConversationKey(hexToBytes(session.clientSecretHex), session.remotePubkey);
}

function parseNostrConnectResponse(session: NostrConnectSession, requestIdValue: string, event: NostrEvent): string | undefined {
  if (event.kind !== NOSTR_CONNECT_KIND || event.pubkey.toLowerCase() !== session.remotePubkey || !verifyNostrEvent(event)) return undefined;
  if (!event.tags.some((tag) => tag[0] === 'p' && tag[1]?.toLowerCase() === session.clientPubkey)) return undefined;
  const decrypted: unknown = JSON.parse(decryptNip44(event.content, nostrConnectConversationKey(session)));
  if (!isRecord(decrypted) || decrypted.id !== requestIdValue) return undefined;
  if (typeof decrypted.error === 'string' && decrypted.error) {
    throw new Error(decrypted.error);
  }
  if (typeof decrypted.result === 'string') return decrypted.result;
  if (decrypted.result !== undefined) return JSON.stringify(decrypted.result);
  return undefined;
}

function parseSignedEventResponse(response: string): NostrEvent {
  const parsed: unknown = JSON.parse(response);
  if (!isRecord(parsed)) throw new Error('Signer returned a malformed event.');
  const tags = parsed.tags;
  if (
    typeof parsed.id !== 'string' ||
    typeof parsed.pubkey !== 'string' ||
    typeof parsed.created_at !== 'number' ||
    typeof parsed.kind !== 'number' ||
    !Array.isArray(tags) ||
    typeof parsed.content !== 'string' ||
    typeof parsed.sig !== 'string'
  ) {
    throw new Error('Signer returned a malformed event.');
  }
  return {
    id: parsed.id,
    pubkey: parsed.pubkey.toLowerCase(),
    created_at: parsed.created_at,
    kind: parsed.kind,
    tags: tags.filter((tag): tag is unknown[] => Array.isArray(tag)).map((tag) => tag.map((value) => String(value))),
    content: parsed.content,
    sig: parsed.sig
  };
}

async function findStoredNostrConnectResponse(session: NostrConnectSession, requestIdValue: string, since: number): Promise<string | undefined> {
  const pool = new SimplePool();
  try {
    const events = (await pool.querySync(
      session.relays,
      {
        kinds: [NOSTR_CONNECT_KIND],
        authors: [session.remotePubkey],
        '#p': [session.clientPubkey],
        since,
        limit: 100
      },
      { maxWait: 5_000 }
    )) as NostrEvent[];
    for (const event of events.sort((left, right) => right.created_at - left.created_at)) {
      try {
        const result = parseNostrConnectResponse(session, requestIdValue, event);
        if (result !== undefined) return result;
      } catch (error) {
        if (error instanceof Error) throw error;
      }
    }
    return undefined;
  } finally {
    pool.close(session.relays);
  }
}

async function pollStoredNostrConnectResponse(session: NostrConnectSession, requestIdValue: string, since: number): Promise<string> {
  const deadline = Date.now() + NOSTR_CONNECT_REQUEST_TIMEOUT_MS;
  while (Date.now() <= deadline) {
    const result = await findStoredNostrConnectResponse(session, requestIdValue, since);
    if (result !== undefined) return result;
    await sleep(NOSTR_CONNECT_POLL_MS);
  }
  throw new Error('Nostr Connect signer did not respond before the request timed out.');
}

function waitForLiveNostrConnectResponse(session: NostrConnectSession, requestIdValue: string, since: number): Promise<string> {
  const pool = new SimplePool();
  return new Promise((resolve, reject) => {
    let settled = false;
    let closer: { close: (reason?: string) => void } | undefined;
    const finish = (result?: string, error?: Error): void => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeout);
      closer?.close();
      pool.close(session.relays);
      if (result !== undefined) {
        resolve(result);
      } else {
        reject(error ?? new Error('Nostr Connect signer did not respond.'));
      }
    };
    const timeout = globalThis.setTimeout(
      () => finish(undefined, new Error('Nostr Connect signer did not respond before the request timed out.')),
      NOSTR_CONNECT_REQUEST_TIMEOUT_MS
    );
    closer = pool.subscribe(
      session.relays,
      {
        kinds: [NOSTR_CONNECT_KIND],
        authors: [session.remotePubkey],
        '#p': [session.clientPubkey],
        since,
        limit: 0
      },
      {
        onevent: (event) => {
          try {
            const result = parseNostrConnectResponse(session, requestIdValue, event as NostrEvent);
            if (result !== undefined) finish(result);
          } catch (error) {
            finish(undefined, error instanceof Error ? error : new Error('Nostr Connect signer rejected the request.'));
          }
        },
        onclose: () => finish(undefined, new Error('Nostr Connect response subscription closed before the signer responded.'))
      }
    );
  });
}

async function sendNostrConnectRequest(session: NostrConnectSession, method: string, params: string[]): Promise<string> {
  const id = requestId();
  const createdAt = Math.floor(Date.now() / 1000);
  const content = encryptNip44(JSON.stringify({ id, method, params }), nostrConnectConversationKey(session));
  const requestEvent = finalizeEvent(
    {
      kind: NOSTR_CONNECT_KIND,
      created_at: createdAt,
      tags: [['p', session.remotePubkey]],
      content
    },
    hexToBytes(session.clientSecretHex)
  ) as NostrEvent;
  const pool = new SimplePool();
  try {
    await firstSuccessful(pool.publish(session.relays, requestEvent), 'Could not publish Nostr Connect request to any relay.');
  } finally {
    pool.close(session.relays);
  }
  return firstSuccessful(
    [waitForLiveNostrConnectResponse(session, id, Math.max(0, createdAt - 60)), pollStoredNostrConnectResponse(session, id, Math.max(0, createdAt - 60))],
    'Nostr Connect signer did not respond.'
  );
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
  if (readStoredNostrConnectSession()) return { available: true, connected: false, provider: 'nip46' };
  return { available: false, connected: false };
}

export async function connectNostrSigner(): Promise<NostrSignerState> {
  const nostr = extension();
  if (!nostr?.getPublicKey || !nostr.signEvent) return connectNostrConnectSigner();
  try {
    const publicKey = (await nostr.getPublicKey()).toLowerCase();
    activeSignerProvider = 'nip07';
    storeExtensionSession(publicKey);
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

export async function restoreNostrSignerSession(): Promise<NostrSignerState> {
  const nostr = extension();
  const storedExtension = readStoredExtensionSession();
  if (storedExtension && nostr?.getPublicKey && nostr.signEvent) {
    try {
      const publicKey = (await nostr.getPublicKey()).toLowerCase();
      if (publicKey === storedExtension.publicKey) {
        activeSignerProvider = 'nip07';
        storeExtensionSession(publicKey);
        return { available: true, connected: true, publicKey, provider: 'nip07' };
      }
      clearStoredExtensionSession();
    } catch {
      return { available: true, connected: false, provider: 'nip07' };
    }
  }

  const storedNostrConnect = readStoredNostrConnectSession();
  if (storedNostrConnect) {
    activeNostrConnectSession = storedNostrConnect;
    activeSignerProvider = 'nip46';
    try {
      const publicKey = (await sendNostrConnectRequest(storedNostrConnect, 'get_public_key', [])).toLowerCase();
      if (publicKey !== storedNostrConnect.publicKey) {
        activeNostrConnectSession = undefined;
        clearStoredNostrConnectSession();
        return { available: true, connected: false, provider: 'nip46', lastError: 'Nostr Connect signer public key changed.' };
      }
      storeNostrConnectSession({ ...storedNostrConnect, publicKey, connectedAtMs: Date.now() });
      return { available: true, connected: true, publicKey, provider: 'nip46' };
    } catch (error) {
      activeNostrConnectSession = undefined;
      return {
        available: true,
        connected: false,
        provider: 'nip46',
        lastError: error instanceof Error ? error.message : 'Could not restore Nostr Connect signer.'
      };
    }
  }

  return detectNostrSigner();
}

export async function signWithNostrSigner(event: NostrUnsignedEvent, expectedPublicKey: string): Promise<NostrEvent> {
  const nostr = extension();
  let signed: NostrEvent;
  if (activeSignerProvider === 'nip46' && activeNostrConnectSession) {
    const response = await sendNostrConnectRequest(activeNostrConnectSession, 'sign_event', [JSON.stringify(event)]);
    signed = parseSignedEventResponse(response);
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
  return Boolean(extension()?.nip44?.encrypt) || Boolean(activeNostrConnectSession);
}

export function signerSupportsNip44Decryption(): boolean {
  return Boolean(extension()?.nip44?.decrypt) || Boolean(activeNostrConnectSession);
}

export async function encryptWithNostrSigner(recipientPublicKey: string, plaintext: string): Promise<string> {
  const encrypt = extension()?.nip44?.encrypt;
  if (activeSignerProvider === 'nip46' && activeNostrConnectSession) {
    return sendNostrConnectRequest(activeNostrConnectSession, 'nip44_encrypt', [recipientPublicKey, plaintext]);
  }
  if (!encrypt) {
    throw new Error('Nostr signer does not expose NIP-44 encryption.');
  }
  return encrypt(recipientPublicKey, plaintext);
}

export async function decryptWithNostrSigner(senderPublicKey: string, ciphertext: string): Promise<string> {
  const decrypt = extension()?.nip44?.decrypt;
  if (activeSignerProvider === 'nip46' && activeNostrConnectSession) {
    return sendNostrConnectRequest(activeNostrConnectSession, 'nip44_decrypt', [senderPublicKey, ciphertext]);
  }
  if (!decrypt) {
    throw new Error('Nostr signer does not expose NIP-44 decryption.');
  }
  return decrypt(senderPublicKey, ciphertext);
}
