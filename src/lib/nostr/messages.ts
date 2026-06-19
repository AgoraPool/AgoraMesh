import { hexToBytes } from '@noble/hashes/utils';
import { unwrapEvent, wrapEvent, wrapManyEvents } from 'nostr-tools/nip17';
import { encrypt, getConversationKey } from 'nostr-tools/nip44';
import { finalizeEvent, generateSecretKey, getEventHash, getPublicKey, verifyEvent } from 'nostr-tools/pure';
import type { NostrEvent, NostrUnsignedEvent } from './events';
import type { RelayConfig } from '../../types/domain';

export const NOSTR_PRIVATE_MESSAGE_KIND = 14;
export const NOSTR_SEAL_KIND = 13;
export const NOSTR_GIFT_WRAP_KIND = 1059;
export const NOSTR_INTRO_MESSAGE_LIMIT = 2000;
export const NOSTR_COORDINATION_MESSAGE_LIMIT = 32000;

export interface NostrIntroContext {
  title?: string;
  id?: string;
  type?: 'listing' | 'profile' | 'mediator' | 'manual' | 'trade-room';
}

interface CreateLocalNostrIntroEventsArgs {
  senderPrivateKeyHex: string;
  recipientPublicKey: string;
  message: string;
  context?: NostrIntroContext;
  messageLimit?: number;
}

interface CreateExtensionNostrIntroEventsArgs {
  senderPublicKey: string;
  recipientPublicKey: string;
  message: string;
  context?: NostrIntroContext;
  messageLimit?: number;
  encryptWithSigner: (recipientPublicKey: string, plaintext: string) => Promise<string>;
  signWithSigner: (event: NostrUnsignedEvent) => Promise<NostrEvent>;
}

export interface UnwrappedNostrMessage {
  wrap: NostrEvent;
  rumor: NostrUnsignedEvent & { id: string; pubkey: string };
  senderPublicKey: string;
  recipientPublicKey: string;
  subject?: string;
}

export interface NostrInboxFetchResult {
  relayUrl: string;
  ok: boolean;
  events: NostrEvent[];
  newestCreatedAt: number;
  message: string;
}

export type NostrInboxLiveStatus = {
  relayUrl: string;
  ok: boolean;
  message: string;
  at: string;
};

export type NostrInboxLiveSubscription = () => void;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function randomNowSeconds(): number {
  return Math.round(nowSeconds() - Math.random() * 2 * 24 * 60 * 60);
}

function contextLabel(context: NostrIntroContext): string {
  if (context.type === 'listing') return 'Listing';
  if (context.type === 'profile') return 'Profile';
  if (context.type === 'mediator') return 'Mediator';
  if (context.type === 'trade-room') return 'Trade room';
  return 'Thread';
}

export function nostrIntroPlaintext(message: string, context?: NostrIntroContext, messageLimit = NOSTR_INTRO_MESSAGE_LIMIT): string {
  const trimmed = message.trim();
  if (!trimmed) {
    throw new Error('Message is required.');
  }
  if (trimmed.length > messageLimit) {
    throw new Error(`Message must be ${messageLimit} characters or less.`);
  }
  if (!context?.title) return trimmed;
  const contextLines = ['---', 'AgoraMesh context', `${contextLabel(context)}: ${context.title}`];
  if (context.id) contextLines.push(`Reference: ${context.id}`);
  contextLines.push('---');
  return `${trimmed}\n\n${contextLines.join('\n')}`;
}

export function createLocalNostrIntroEvents(args: CreateLocalNostrIntroEventsArgs): NostrEvent[] {
  const plaintext = nostrIntroPlaintext(args.message, args.context, args.messageLimit);
  const senderPrivateKey = hexToBytes(args.senderPrivateKeyHex);
  const senderPublicKey = getPublicKey(senderPrivateKey);
  if (senderPublicKey.toLowerCase() === args.recipientPublicKey.toLowerCase()) {
    return [wrapEvent(senderPrivateKey, { publicKey: senderPublicKey }, plaintext, args.context?.title) as NostrEvent];
  }
  return wrapManyEvents(senderPrivateKey, [{ publicKey: args.recipientPublicKey }], plaintext, args.context?.title) as NostrEvent[];
}

export async function createExtensionNostrIntroEvents(args: CreateExtensionNostrIntroEventsArgs): Promise<NostrEvent[]> {
  const plaintext = nostrIntroPlaintext(args.message, args.context, args.messageLimit);
  const recipients = [...new Set([args.senderPublicKey.toLowerCase(), args.recipientPublicKey.toLowerCase()])];
  const events: NostrEvent[] = [];
  for (const recipientPublicKey of recipients) {
    const rumorTags = [['p', recipientPublicKey]];
    if (args.context?.title) rumorTags.push(['subject', args.context.title]);
    const rumor = {
      pubkey: args.senderPublicKey,
      created_at: nowSeconds(),
      kind: NOSTR_PRIVATE_MESSAGE_KIND,
      tags: rumorTags,
      content: plaintext
    };
    const rumorWithId = { ...rumor, id: getEventHash(rumor) };
    const seal = await args.signWithSigner({
      kind: NOSTR_SEAL_KIND,
      created_at: randomNowSeconds(),
      tags: [],
      content: await args.encryptWithSigner(recipientPublicKey, JSON.stringify(rumorWithId))
    });
    const giftWrapKey = generateSecretKey();
    const wrappedContent = encrypt(JSON.stringify(seal), getConversationKey(giftWrapKey, recipientPublicKey));
    events.push(
      finalizeEvent(
        {
          kind: NOSTR_GIFT_WRAP_KIND,
          created_at: randomNowSeconds(),
          tags: [['p', recipientPublicKey]],
          content: wrappedContent
        },
        giftWrapKey
      ) as NostrEvent
    );
  }
  return events;
}

function tagValue(event: Pick<NostrEvent, 'tags'> | Pick<NostrUnsignedEvent, 'tags'>, name: string): string | undefined {
  return event.tags.find((tag) => tag[0] === name)?.[1];
}

function hasTagValue(event: Pick<NostrEvent, 'tags'> | Pick<NostrUnsignedEvent, 'tags'>, name: string, value: string): boolean {
  return event.tags.some((tag) => tag[0] === name && tag[1]?.toLowerCase() === value.toLowerCase());
}

function parseNostrEventObject(value: unknown): NostrEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected Nostr event object.');
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    typeof record.pubkey !== 'string' ||
    typeof record.created_at !== 'number' ||
    typeof record.kind !== 'number' ||
    !Array.isArray(record.tags) ||
    typeof record.content !== 'string' ||
    typeof record.sig !== 'string'
  ) {
    throw new Error('Malformed Nostr event.');
  }
  return {
    id: record.id,
    pubkey: record.pubkey.toLowerCase(),
    created_at: record.created_at,
    kind: record.kind,
    tags: record.tags.filter(Array.isArray).map((tag) => tag.map(String)),
    content: record.content,
    sig: record.sig
  };
}

function parseRumor(value: unknown): UnwrappedNostrMessage['rumor'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected Nostr rumor object.');
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    typeof record.pubkey !== 'string' ||
    typeof record.created_at !== 'number' ||
    typeof record.kind !== 'number' ||
    !Array.isArray(record.tags) ||
    typeof record.content !== 'string'
  ) {
    throw new Error('Malformed Nostr rumor.');
  }
  return {
    id: record.id,
    pubkey: record.pubkey.toLowerCase(),
    created_at: record.created_at,
    kind: record.kind,
    tags: record.tags.filter(Array.isArray).map((tag) => tag.map(String)),
    content: record.content
  };
}

function validateUnwrappedMessage(wrap: NostrEvent, rumor: UnwrappedNostrMessage['rumor'], recipientPublicKey: string): UnwrappedNostrMessage {
  const normalizedRecipient = recipientPublicKey.toLowerCase();
  if (wrap.kind !== NOSTR_GIFT_WRAP_KIND) throw new Error('Expected NIP-17 gift wrap.');
  if (!verifyEvent(wrap)) throw new Error('Gift wrap signature is invalid.');
  if (!hasTagValue(wrap, 'p', normalizedRecipient)) throw new Error('Gift wrap is not addressed to this identity.');
  if (rumor.kind !== NOSTR_PRIVATE_MESSAGE_KIND) throw new Error('Expected NIP-17 private direct message rumor.');
  if (getEventHash(rumor) !== rumor.id) throw new Error('NIP-17 rumor id is invalid.');
  if (!hasTagValue(rumor, 'p', normalizedRecipient)) throw new Error('NIP-17 rumor is not addressed to this identity.');
  return {
    wrap,
    rumor,
    senderPublicKey: rumor.pubkey.toLowerCase(),
    recipientPublicKey: normalizedRecipient,
    subject: tagValue(rumor, 'subject')
  };
}

export function isNostrInboxGiftWrapForRecipient(event: NostrEvent, recipientPublicKey: string): boolean {
  return event.kind === NOSTR_GIFT_WRAP_KIND && hasTagValue(event, 'p', recipientPublicKey) && verifyEvent(event);
}

export function unwrapLocalNostrGiftWrap(wrap: NostrEvent, recipientPrivateKeyHex: string, recipientPublicKey: string): UnwrappedNostrMessage {
  const rumor = parseRumor(unwrapEvent(wrap, hexToBytes(recipientPrivateKeyHex)));
  return validateUnwrappedMessage(wrap, rumor, recipientPublicKey);
}

export async function unwrapExtensionNostrGiftWrap(
  wrap: NostrEvent,
  recipientPublicKey: string,
  decryptWithSigner: (senderPublicKey: string, ciphertext: string) => Promise<string>
): Promise<UnwrappedNostrMessage> {
  if (wrap.kind !== NOSTR_GIFT_WRAP_KIND) throw new Error('Expected NIP-17 gift wrap.');
  if (!verifyEvent(wrap)) throw new Error('Gift wrap signature is invalid.');
  if (!hasTagValue(wrap, 'p', recipientPublicKey)) throw new Error('Gift wrap is not addressed to this identity.');

  const seal = parseNostrEventObject(JSON.parse(await decryptWithSigner(wrap.pubkey, wrap.content)));
  if (seal.kind !== NOSTR_SEAL_KIND) throw new Error('Expected NIP-17 seal.');
  if (!verifyEvent(seal)) throw new Error('NIP-17 seal signature is invalid.');

  const rumor = parseRumor(JSON.parse(await decryptWithSigner(seal.pubkey, seal.content)));
  if (seal.pubkey.toLowerCase() !== rumor.pubkey.toLowerCase()) {
    throw new Error('NIP-17 seal author does not match rumor author.');
  }

  return validateUnwrappedMessage(wrap, rumor, recipientPublicKey);
}

export function nostrInboxSince(cursorSince?: number): number {
  const initialLookback = Math.floor((Date.now() - 30 * 86_400_000) / 1000);
  const overlapSeconds = 3 * 86_400;
  return cursorSince ? Math.max(0, cursorSince - overlapSeconds) : initialLookback;
}

export async function fetchNostrInboxGiftWraps(
  relays: RelayConfig[],
  recipientPublicKey: string,
  sinceByRelay: Record<string, number>
): Promise<NostrInboxFetchResult[]> {
  const enabled = relays.filter((relay) => relay.enabled);
  return Promise.all(enabled.map((relay) => fetchNostrInboxGiftWrapsFromRelay(relay.url, recipientPublicKey, sinceByRelay[relay.url])));
}

function fetchNostrInboxGiftWrapsFromRelay(relayUrl: string, recipientPublicKey: string, since?: number): Promise<NostrInboxFetchResult> {
  return new Promise((resolve) => {
    const socket = new WebSocket(relayUrl);
    const subscriptionId = `agoramesh-inbox-${Math.random().toString(36).slice(2)}`;
    const events: NostrEvent[] = [];
    let settled = false;
    const finish = (ok: boolean, message: string): void => {
      if (settled) return;
      settled = true;
      socket.close();
      resolve({
        relayUrl,
        ok,
        events,
        newestCreatedAt: events.reduce((max, event) => Math.max(max, event.created_at), since ?? 0),
        message
      });
    };
    const timeout = globalThis.setTimeout(() => finish(false, 'Relay timed out.'), 8000);
    socket.onopen = () => {
      socket.send(
        JSON.stringify([
          'REQ',
          subscriptionId,
          {
            kinds: [NOSTR_GIFT_WRAP_KIND],
            '#p': [recipientPublicKey],
            ...(since ? { since } : {}),
            limit: 200
          }
        ])
      );
    };
    socket.onerror = () => {
      globalThis.clearTimeout(timeout);
      finish(false, 'Relay connection failed.');
    };
    socket.onmessage = (message) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(message.data));
      } catch {
        return;
      }
      const data = Array.isArray(parsed) ? parsed : [];
      if (data[0] === 'EVENT' && data[1] === subscriptionId) {
        try {
          const event = parseNostrEventObject(data[2]);
          if (isNostrInboxGiftWrapForRecipient(event, recipientPublicKey)) {
            events.push(event);
          }
        } catch {
          // Ignore malformed relay payloads and continue collecting valid wraps.
        }
      }
      if (data[0] === 'EOSE') {
        globalThis.clearTimeout(timeout);
        finish(true, 'Fetched inbox gift wraps.');
      }
      if (data[0] === 'CLOSED' && data[1] === subscriptionId) {
        globalThis.clearTimeout(timeout);
        finish(false, String(data[2] ?? 'Relay closed subscription.'));
      }
    };
  });
}

export function subscribeToNostrInboxGiftWraps({
  relays,
  recipientPublicKey,
  sinceByRelay = {},
  onEvent,
  onStatus
}: {
  relays: RelayConfig[];
  recipientPublicKey: string;
  sinceByRelay?: Record<string, number | undefined>;
  onEvent: (event: NostrEvent, relayUrl: string) => void;
  onStatus?: (status: NostrInboxLiveStatus) => void;
}): NostrInboxLiveSubscription {
  const normalizedRecipient = recipientPublicKey.toLowerCase();
  const sockets = relays
    .filter((relay) => relay.enabled)
    .map((relay) => {
      const socket = new WebSocket(relay.url);
      const subscriptionId = `agoramesh-live-inbox-${Math.random().toString(36).slice(2)}`;
      const report = (ok: boolean, message: string): void =>
        onStatus?.({ relayUrl: relay.url, ok, message, at: new Date().toISOString() });
      socket.onopen = () => {
        socket.send(
          JSON.stringify([
            'REQ',
            subscriptionId,
            {
              kinds: [NOSTR_GIFT_WRAP_KIND],
              '#p': [normalizedRecipient],
              ...(sinceByRelay[relay.url] ? { since: sinceByRelay[relay.url] } : {}),
              limit: 200
            }
          ])
        );
        report(true, 'Live inbox connected.');
      };
      socket.onerror = () => report(false, 'Live inbox relay connection failed.');
      socket.onmessage = (message) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(message.data));
        } catch {
          return;
        }
        const data = Array.isArray(parsed) ? parsed : [];
        if (data[0] === 'EVENT' && data[1] === subscriptionId) {
          try {
            const event = parseNostrEventObject(data[2]);
            if (isNostrInboxGiftWrapForRecipient(event, normalizedRecipient)) onEvent(event, relay.url);
          } catch {
            // Live subscriptions ignore malformed relay payloads; manual fetch remains the diagnostics path.
          }
        }
        if (data[0] === 'CLOSED' && data[1] === subscriptionId) {
          report(false, String(data[2] ?? 'Live inbox subscription closed.'));
        }
      };
      return socket;
    });
  return () => sockets.forEach((socket) => socket.close());
}
