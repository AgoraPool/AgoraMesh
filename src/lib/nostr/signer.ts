import { getPublicKeyUri, signEventUri, encryptNip44Uri, decryptNip44Uri } from 'nostr-tools/nip55';
import * as nip19 from 'nostr-tools/nip19';
import { getEventHash } from 'nostr-tools/pure';
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

function extension(): NostrExtension | undefined {
  return typeof window === 'undefined' ? undefined : window.nostr;
}

type Nip55RequestKind = 'publicKey' | 'event' | 'text';

interface Nip55PendingRequest {
  kind: Nip55RequestKind;
  resolve: (value: string) => void;
  reject: (error: Error) => void;
  returnHash: string;
  timeoutId: ReturnType<typeof setTimeout>;
}

const NIP55_CALLBACK_HASH = 'nostrsigner-callback';
const NIP55_TIMEOUT_MS = 120_000;
const nip55PendingRequests = new Map<string, Nip55PendingRequest>();
let activeSignerProvider: NostrSignerState['provider'];
let nip55ListenerInstalled = false;

function isAndroidLike(): boolean {
  return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
}

function nip55Available(): boolean {
  return typeof window !== 'undefined' && isAndroidLike();
}

function callbackUrl(): string {
  const location = window.location;
  return `${location.origin}${location.pathname}${location.search}#${NIP55_CALLBACK_HASH}`;
}

function requestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `nip55_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function parseCallbackSearch(value: string): URLSearchParams | undefined {
  const query = value.includes('?') ? value.slice(value.indexOf('?') + 1) : value.startsWith('?') ? value.slice(1) : '';
  return query ? new URLSearchParams(query) : undefined;
}

function callbackParamSets(): URLSearchParams[] {
  if (typeof window === 'undefined') return [];
  const sets: URLSearchParams[] = [];
  const search = parseCallbackSearch(window.location.search);
  if (search) sets.push(search);
  const hash = window.location.hash.replace(/^#/, '');
  const hashSearch = parseCallbackSearch(hash);
  if (hashSearch) sets.push(hashSearch);
  return sets;
}

function firstParam(params: URLSearchParams, names: string[]): string | undefined {
  for (const name of names) {
    const value = params.get(name);
    if (value) return value;
  }
  return undefined;
}

function restoreHashAfterNip55(pending: Nip55PendingRequest): void {
  if (window.location.hash.startsWith(`#${NIP55_CALLBACK_HASH}`)) {
    if (pending.returnHash) {
      window.location.hash = pending.returnHash;
    } else {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
  }
}

function safeDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizePublicKey(value: string): string | undefined {
  const trimmed = value.trim();
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return trimmed.toLowerCase();
  if (trimmed.startsWith('npub')) {
    try {
      const decoded = nip19.decode(trimmed);
      return typeof decoded.data === 'string' && /^[0-9a-f]{64}$/i.test(decoded.data) ? decoded.data.toLowerCase() : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function consumeNip55Callbacks(): void {
  for (const params of callbackParamSets()) {
    const id = params.get('id') ?? [...nip55PendingRequests.keys()][0];
    if (!id) continue;
    const pending = nip55PendingRequests.get(id);
    if (!pending) continue;
    const error = firstParam(params, ['error', 'errorMessage']);
    clearTimeout(pending.timeoutId);
    nip55PendingRequests.delete(id);
    if (error) {
      pending.reject(new Error(error));
      restoreHashAfterNip55(pending);
      continue;
    }
    const value =
      pending.kind === 'event'
        ? firstParam(params, ['event', 'result', 'signature'])
        : firstParam(params, ['public_key', 'pubkey', 'npub', 'result', 'signature']);
    if (!value) {
      pending.reject(new Error('Amber did not return a signer result.'));
      restoreHashAfterNip55(pending);
      continue;
    }
    pending.resolve(value);
    restoreHashAfterNip55(pending);
  }
}

function ensureNip55Listener(): void {
  if (typeof window === 'undefined' || nip55ListenerInstalled) return;
  nip55ListenerInstalled = true;
  window.addEventListener('hashchange', consumeNip55Callbacks);
  window.addEventListener('focus', consumeNip55Callbacks);
  window.setTimeout(consumeNip55Callbacks, 0);
}

function requestNip55(uri: string, kind: Nip55RequestKind): Promise<string> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Amber signer is only available in a browser.'));
  ensureNip55Listener();
  const id = requestId();
  const separator = uri.includes('?') ? '&' : '?';
  const uriWithId = `${uri}${separator}id=${encodeURIComponent(id)}`;
  const returnHash = window.location.hash.startsWith(`#${NIP55_CALLBACK_HASH}`) ? '' : window.location.hash;
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      nip55PendingRequests.delete(id);
      reject(new Error('Amber signer did not return before the request timed out.'));
    }, NIP55_TIMEOUT_MS);
    nip55PendingRequests.set(id, { kind, resolve, reject, returnHash, timeoutId });
    window.location.href = uriWithId;
  });
}

function parseNip55EventResult(value: string, unsigned: NostrUnsignedEvent, expectedPublicKey: string): NostrEvent {
  for (const candidate of [...new Set([value, safeDecodeUriComponent(value)])]) {
    try {
      const parsed = JSON.parse(candidate) as NostrEvent;
      if (parsed && typeof parsed === 'object' && typeof parsed.sig === 'string') return parsed;
    } catch {
      // Amber may return only a signature when a signer ignores returnType=event.
    }
  }
  const signature = value.trim();
  if (!/^[0-9a-f]{128}$/i.test(signature)) {
    throw new Error('Amber returned an invalid signing result.');
  }
  return {
    ...unsigned,
    pubkey: expectedPublicKey,
    id: getEventHash({ ...unsigned, pubkey: expectedPublicKey }),
    sig: signature
  };
}

async function connectNip55Signer(): Promise<NostrSignerState> {
  if (!nip55Available()) {
    return { available: false, connected: false, lastError: 'No Nostr signer extension or Amber signer was found.' };
  }
  try {
    const value = await requestNip55(
      getPublicKeyUri({
        callbackUrl: callbackUrl(),
        returnType: 'signature',
        compressionType: 'none'
      }),
      'publicKey'
    );
    const publicKey = normalizePublicKey(value);
    if (!publicKey) throw new Error('Amber returned an invalid public key.');
    activeSignerProvider = 'nip55';
    return { available: true, connected: true, publicKey, provider: 'nip55' };
  } catch (error) {
    return {
      available: true,
      connected: false,
      provider: 'nip55',
      lastError: error instanceof Error ? error.message : 'Amber signer connection was rejected.'
    };
  }
}

export function detectNostrSigner(): NostrSignerState {
  const nostr = extension();
  if (nostr?.getPublicKey && nostr.signEvent) return { available: true, connected: false, provider: 'nip07' };
  if (nip55Available()) return { available: true, connected: false, provider: 'nip55' };
  return { available: false, connected: false };
}

export async function connectNostrSigner(): Promise<NostrSignerState> {
  const nostr = extension();
  if (!nostr?.getPublicKey || !nostr.signEvent) {
    return connectNip55Signer();
  }
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
  const signed =
    activeSignerProvider !== 'nip55' && nostr?.signEvent
      ? await nostr.signEvent(event)
      : parseNip55EventResult(
          await requestNip55(
            signEventUri({
              eventJson: { ...event, pubkey: expectedPublicKey },
              callbackUrl: callbackUrl(),
              returnType: 'event',
              compressionType: 'none',
              currentUser: expectedPublicKey
            }),
            'event'
          ),
          event,
          expectedPublicKey
        );
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
  return Boolean(extension()?.nip44?.encrypt) || activeSignerProvider === 'nip55';
}

export function signerSupportsNip44Decryption(): boolean {
  return Boolean(extension()?.nip44?.decrypt) || activeSignerProvider === 'nip55';
}

export async function encryptWithNostrSigner(recipientPublicKey: string, plaintext: string): Promise<string> {
  const encrypt = extension()?.nip44?.encrypt;
  if (encrypt && activeSignerProvider !== 'nip55') {
    return encrypt(recipientPublicKey, plaintext);
  }
  if (activeSignerProvider === 'nip55') {
    return requestNip55(
      encryptNip44Uri({
        pubKey: recipientPublicKey,
        content: plaintext,
        callbackUrl: callbackUrl(),
        returnType: 'signature',
        compressionType: 'none'
      }),
      'text'
    );
  }
  if (!encrypt) {
    throw new Error('Nostr signer does not expose NIP-44 encryption.');
  }
  return encrypt(recipientPublicKey, plaintext);
}

export async function decryptWithNostrSigner(senderPublicKey: string, ciphertext: string): Promise<string> {
  const decrypt = extension()?.nip44?.decrypt;
  if (decrypt && activeSignerProvider !== 'nip55') {
    return decrypt(senderPublicKey, ciphertext);
  }
  if (activeSignerProvider === 'nip55') {
    return requestNip55(
      decryptNip44Uri({
        pubKey: senderPublicKey,
        content: ciphertext,
        callbackUrl: callbackUrl(),
        returnType: 'signature',
        compressionType: 'none'
      }),
      'text'
    );
  }
  if (!decrypt) {
    throw new Error('Nostr signer does not expose NIP-44 decryption.');
  }
  return decrypt(senderPublicKey, ciphertext);
}
