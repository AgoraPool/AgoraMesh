import { BunkerSigner, createNostrConnectURI } from 'nostr-tools/nip46';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
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

let activeSignerProvider: NostrSignerState['provider'];
let activeNostrConnectSigner: BunkerSigner | undefined;

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

export function startNostrConnectPairing(relays: string[] = DEFAULT_NOSTR_CONNECT_RELAYS): NostrConnectPairing {
  const clientSecretKey = generateSecretKey();
  const url = appUrl();
  const image = appIconUrl();
  const uri = createNostrConnectURI({
    clientPubkey: getPublicKey(clientSecretKey),
    relays: uniqueRelays(relays),
    secret: requestId(),
    perms: NOSTR_CONNECT_PERMS,
    name: 'AgoraMesh',
    ...(url ? { url } : {}),
    ...(image ? { image } : {})
  });
  const promise = BunkerSigner.fromURI(clientSecretKey, uri, {}, NOSTR_CONNECT_TIMEOUT_MS).then(async (signer) => {
    activeNostrConnectSigner = signer;
    activeSignerProvider = 'nip46';
    const publicKey = (await signer.getPublicKey()).toLowerCase();
    return { available: true, connected: true, publicKey, provider: 'nip46' as const };
  });
  return { uri, promise };
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
