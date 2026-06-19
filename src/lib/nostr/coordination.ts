import { parseBuyerRequestOfferPayload } from '../marketplace/buyerRequestOffers';
import { parseTradeRoomUpdatePayload } from '../tradeRooms';
import type { NostrContactReceipt, NostrInboxCursor, NostrMessageRecord, RelayConfig, SyncStatus, TradeRoom } from '../../types/domain';

export type NostrCoordinationPayloadSummary =
  | { kind: 'buyer-request-offer'; requestListingId: string; requestCoordinate: string; buyerPublicKey: string; sellerPublicKey: string }
  | { kind: 'trade-room-update'; roomId: string; senderPublicKey: string; state?: string; paymentState?: string; deliveryState?: string }
  | { kind: 'message' };

export type NostrCoordinationResult = {
  fetched: number;
  imported: number;
  duplicates: number;
  failed: number;
  relays: number;
  payloads: NostrCoordinationPayloadSummary[];
};

export type NostrLiveInboxState = {
  status: 'idle' | 'listening' | 'blocked' | 'paused' | 'error';
  relays: number;
  imported: number;
  duplicates: number;
  failed: number;
  lastEventAt?: string;
  message?: string;
};

export type TradeRoomCoordinationStatus =
  | 'synced'
  | 'sent'
  | 'received'
  | 'needs-fetch'
  | 'not-acknowledged'
  | 'failed'
  | 'idle';

export function summarizeNostrCoordinationPayload(plaintext: string): NostrCoordinationPayloadSummary {
  const offer = parseBuyerRequestOfferPayload(plaintext);
  if (offer) {
    return {
      kind: 'buyer-request-offer',
      requestListingId: offer.requestListingId,
      requestCoordinate: offer.requestCoordinate,
      buyerPublicKey: offer.buyerPublicKey,
      sellerPublicKey: offer.sellerPublicKey
    };
  }
  const update = parseTradeRoomUpdatePayload(plaintext);
  if (update) {
    return {
      kind: 'trade-room-update',
      roomId: update.roomId,
      senderPublicKey: update.senderPublicKey,
      state: update.state,
      paymentState: update.paymentState,
      deliveryState: update.deliveryState
    };
  }
  return { kind: 'message' };
}

export function coordinationReceiptStatus(statuses: SyncStatus[]): 'accepted' | 'partial' | 'failed' {
  const relayed = statuses.filter((status) => status.ok).length;
  if (relayed === 0) return 'failed';
  return relayed === statuses.length ? 'accepted' : 'partial';
}

export function selectNostrCoordinationRelays(relays: RelayConfig[], relayHints: string[] = []): RelayConfig[] {
  const byUrl = new Map<string, RelayConfig>();
  for (const relay of relays.filter((entry) => entry.enabled)) byUrl.set(relay.url, relay);
  for (const url of relayHints) {
    const trimmed = url.trim();
    if (!trimmed.startsWith('wss://')) continue;
    if (!byUrl.has(trimmed)) byUrl.set(trimmed, { url: trimmed, enabled: true });
  }
  return [...byUrl.values()];
}

export function deriveTradeRoomCoordinationStatus({
  room,
  receipts,
  messages,
  cursors,
  liveState
}: {
  room: TradeRoom;
  receipts: NostrContactReceipt[];
  messages: NostrMessageRecord[];
  cursors: NostrInboxCursor[];
  liveState?: NostrLiveInboxState;
}): TradeRoomCoordinationStatus {
  const roomReceipts = receipts.filter((receipt) => receipt.contextType === 'trade-room' && receipt.contextId === room.id);
  const roomMessages = messages.filter((message) => message.contextType === 'trade-room' && message.contextId === room.id);
  const incoming = roomMessages.filter((message) => message.direction === 'incoming');
  const outgoing = roomMessages.filter((message) => message.direction === 'outgoing');
  if (roomReceipts.some((receipt) => receipt.status === 'failed')) return 'failed';
  if (incoming.length > 0 && outgoing.length > 0) return 'synced';
  if (incoming.length > 0) return 'received';
  if (roomReceipts.some((receipt) => receipt.status === 'accepted' || receipt.status === 'partial') || outgoing.length > 0) return 'sent';
  if (liveState?.status === 'listening' || cursors.length > 0) return 'not-acknowledged';
  return 'needs-fetch';
}
