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

export function detectNostrSigner(): NostrSignerState {
  const nostr = extension();
  return {
    available: Boolean(nostr?.getPublicKey && nostr.signEvent),
    connected: false
  };
}

export async function connectNostrSigner(): Promise<NostrSignerState> {
  const nostr = extension();
  if (!nostr?.getPublicKey || !nostr.signEvent) {
    return { available: false, connected: false, lastError: 'No Nostr signer extension was found.' };
  }
  try {
    const publicKey = (await nostr.getPublicKey()).toLowerCase();
    return { available: true, connected: true, publicKey };
  } catch (error) {
    return {
      available: true,
      connected: false,
      lastError: error instanceof Error ? error.message : 'Signer connection was rejected.'
    };
  }
}

export async function signWithNostrSigner(event: NostrUnsignedEvent, expectedPublicKey: string): Promise<NostrEvent> {
  const nostr = extension();
  if (!nostr?.signEvent) {
    throw new Error('No Nostr signer extension was found.');
  }
  const signed = await nostr.signEvent(event);
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
  return Boolean(extension()?.nip44?.encrypt);
}

export function signerSupportsNip44Decryption(): boolean {
  return Boolean(extension()?.nip44?.decrypt);
}

export async function encryptWithNostrSigner(recipientPublicKey: string, plaintext: string): Promise<string> {
  const encrypt = extension()?.nip44?.encrypt;
  if (!encrypt) {
    throw new Error('Nostr signer does not expose NIP-44 encryption.');
  }
  return encrypt(recipientPublicKey, plaintext);
}

export async function decryptWithNostrSigner(senderPublicKey: string, ciphertext: string): Promise<string> {
  const decrypt = extension()?.nip44?.decrypt;
  if (!decrypt) {
    throw new Error('Nostr signer does not expose NIP-44 decryption.');
  }
  return decrypt(senderPublicKey, ciphertext);
}
