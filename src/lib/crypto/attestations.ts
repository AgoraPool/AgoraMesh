import { finalizeEvent, verifyEvent } from 'nostr-tools/pure';
import type { AttestationTag, ReputationAttestation } from '../../types/domain';
import { canonicalJson, newId } from './encoding';
import { privateKeyBytes } from './identity';

export interface AttestationDraft {
  reviewerPublicKey: string;
  subjectPublicKey: string;
  agreementHash: string;
  role: 'buyer' | 'seller' | 'mediator';
  tags: AttestationTag[];
  text: string;
}

export interface AttestationUnsignedEvent {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

export interface AttestationSignedEvent extends AttestationUnsignedEvent {
  id: string;
  pubkey: string;
  sig: string;
}

export interface PreparedAttestation {
  id: string;
  timestamp: number;
  event: AttestationUnsignedEvent;
}

function attestationContent(draft: AttestationDraft, id: string, timestamp: number): string {
  return canonicalJson({
    app: 'agoramesh',
    version: 1,
    type: 'reputation-attestation',
    id,
    reviewerPublicKey: draft.reviewerPublicKey,
    subjectPublicKey: draft.subjectPublicKey,
    agreementHash: draft.agreementHash,
    role: draft.role,
    tags: draft.tags,
    text: draft.text,
    timestamp
  });
}

export function prepareAttestationEvent(draft: AttestationDraft): PreparedAttestation {
  const timestamp = Math.floor(Date.now() / 1000);
  const id = newId('attestation');
  return {
    id,
    timestamp,
    event: {
      kind: 39004,
      created_at: timestamp,
      tags: [
        ['client', 'agoramesh'],
        ['p', draft.subjectPublicKey],
        ['agreement', draft.agreementHash]
      ],
      content: attestationContent(draft, id, timestamp)
    }
  };
}

export function attestationFromSignedEvent(draft: AttestationDraft, prepared: PreparedAttestation, event: AttestationSignedEvent): ReputationAttestation {
  if (event.pubkey.toLowerCase() !== draft.reviewerPublicKey.toLowerCase()) {
    throw new Error('Signing key does not match reviewer public key.');
  }
  if (
    event.kind !== prepared.event.kind ||
    event.created_at !== prepared.event.created_at ||
    event.content !== prepared.event.content ||
    JSON.stringify(event.tags) !== JSON.stringify(prepared.event.tags)
  ) {
    throw new Error('Signer returned a modified reputation attestation event.');
  }
  if (!verifyEvent(event)) {
    throw new Error('Signer returned an invalid reputation attestation signature.');
  }

  return {
    id: prepared.id,
    reviewerPublicKey: draft.reviewerPublicKey,
    subjectPublicKey: draft.subjectPublicKey,
    agreementHash: draft.agreementHash,
    role: draft.role,
    tags: draft.tags,
    text: draft.text,
    timestamp: prepared.timestamp,
    signature: event.sig,
    eventId: event.id
  };
}

export function createSignedAttestation(draft: AttestationDraft, privateKeyHex: string): ReputationAttestation {
  const prepared = prepareAttestationEvent(draft);
  const event = finalizeEvent(prepared.event, privateKeyBytes(privateKeyHex));
  return attestationFromSignedEvent(draft, prepared, event as AttestationSignedEvent);
}

export function verifyAttestation(attestation: ReputationAttestation): boolean {
  const draft: AttestationDraft = {
    reviewerPublicKey: attestation.reviewerPublicKey,
    subjectPublicKey: attestation.subjectPublicKey,
    agreementHash: attestation.agreementHash,
    role: attestation.role,
    tags: attestation.tags,
    text: attestation.text
  };

  return verifyEvent({
    id: attestation.eventId,
    pubkey: attestation.reviewerPublicKey,
    created_at: attestation.timestamp,
    kind: 39004,
    tags: [
      ['client', 'agoramesh'],
      ['p', attestation.subjectPublicKey],
      ['agreement', attestation.agreementHash]
    ],
    content: attestationContent(draft, attestation.id, attestation.timestamp),
    sig: attestation.signature
  });
}
