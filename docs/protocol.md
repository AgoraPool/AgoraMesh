# AgoraMesh Protocol Notes

AgoraMesh stores structured local data and can publish public objects as Nostr events. The product UI treats public Nostr discovery as the normal marketplace path, but saving local records never publishes automatically.

## Event Kinds

- `39001`: public profile.
- `30402`: public listing as a NIP-99 classified listing.
- `39003`: mediator profile.
- `39004`: reputation attestation.
- `39005`: dispute outcome attestation.
- `30004`: community curation list using NIP-51-style list tags.

App-specific events use canonical JSON content:

```json
{
  "app": "agoramesh",
  "version": 1,
  "payload": {}
}
```

## Public Objects

Public profile, listing, mediator, reputation, and dispute outcome serializers are separate from local models. Private keys, full agreement text, evidence files, private dispute details, payment secrets, settlement text, and encrypted identity material are not included.

All publication paths pass through a sensitive-field guard. Events containing private key material, encrypted identity blobs, full dispute details, evidence metadata, local filenames, payment secrets, or private agreement text are rejected before signing.

Listings publish as NIP-99 classified listing events. Title, description, location, price, status, images, tags, and contact metadata are public relay data. Passphrase-encrypted listing publication is intentionally not part of the NIP-99 marketplace path; private order or contact encryption is deferred to a later protocol sprint.

Profiles may include public Lightning metadata: `lud16`/Lightning address and `lud06`/LNURL. Listings may include public fulfillment hints, image metadata, and payment intents: method, public address or URI, and a short note. Cashu is treated as a public instruction type only, not wallet execution. Lightning LNURL/NIP-57 support signs a zap request, sends it to the seller LNURL-pay callback, and receives a BOLT11 invoice. If the buyer has explicitly connected and unlocked a NIP-47/NWC wallet, AgoraMesh can send a `pay_invoice` request to that wallet; otherwise it hands the invoice to an external wallet. Publication guards reject private or custodial wording such as seeds, private keys, Cashu secrets, private invoice memos, custody, or escrow. AgoraMesh does not hold funds, manage balances, confirm fulfillment, or provide escrow.

Listing images are public HTTPS references uploaded to user-configured Blossom servers before listing publication. The listing payload stores URL, SHA-256, MIME type, size, optional dimensions, optional alt text, Blossom server URL, and upload timestamp. It never stores local filenames.

Public events can be signed either with the local encrypted identity after unlock or with an optional NIP-07 browser signer. A NIP-07 signer can also be the active AgoraMesh identity; in that mode the local identity record stores only the public key, display name, key source, and timestamps. Signer mode is explicit, validates that the signer public key matches the object author, and never stores extension private keys.
Signer responses must preserve the unsigned event kind, timestamp, tags, and content. Modified signed events are rejected before relay publishing.

Standard Nostr `kind: 0` profile metadata is fetched only after explicit user approval. It may prefill local AgoraMesh profile fields but is not admitted into the review queue or synced public cache.

Relay URLs must use `wss://`. Plain `ws://` relays are not accepted in production because they expose and weaken relay metadata transport.

## Relay Review Queue And Public Cache

Read-only relay sync fetches supported AgoraMesh and NIP-99 event kinds and stores them as review items:

- `pending`: valid signature and importable kind.
- `imported`: user explicitly imported the item into the synced public cache.
- `rejected`: user reviewed and rejected the item.
- `invalid`: invalid signature, unsupported app version, malformed payload, or non-importable kind.

Fetched events are never auto-imported into user data.

Approved review items move into a synced public cache. This cache is separate from local user-authored records. Browse, mediator, and reputation views can show local, synced, or combined data with source labels. Cache rows keep the raw signed event so backup restore can revalidate the event signature, payload author, and kind-specific tags before restoring derived public cache records.

Manual relay fetch records local fetch summaries: per-relay elapsed time, received events, duplicates, invalid events, and failure messages. These summaries are diagnostics only and are not published.

Synced cache records include a local `hidden` flag. Hiding is private local moderation only: it does not delete relay events, does not reject future events by that author, and does not write anything into user-owned local records.

If multiple synced records share the same event kind, author public key, and payload id but have different event ids or update timestamps, the UI marks them as possible conflicts. The newest-looking record is labeled as the latest conflict version, but the app does not auto-merge or auto-trust either record.

Marketplace ranking, deduplication, collapsed filters, dedicated listing pages, collapsed publish options, and seller summaries are local UI behavior. Ranking prefers visible, active, trusted, local, newer, and search-matching records. Seller summaries combine public profile, reputation, allowlist, and key context without certifying identity. Curation lists can filter discovery, but they do not certify identity, truth, or safety.

Encrypted relay-content events are signature-checked and stay in the review queue until the user provides the shared passphrase and explicitly imports them. Encrypted listing events are rejected for NIP-99 marketplace discovery. The raw event signature is rechecked at import time rather than trusting stored review flags.

## Live Sync

Live sync is optional and runs only while the app is open. It subscribes to supported AgoraMesh and NIP-99 event kinds with a relay filter containing `kinds`, `limit`, and an optional `since` timestamp based on relay health state. It does not publish private data.

## Relay Health And Publish Receipts

Relay health tracks last connection, latency, received events, published events, last error, and consecutive failures.

Publish receipts record per-relay acceptance or failure for public profiles, listings, mediator profiles, reputation attestations, dispute outcome attestations, and community curation lists.

Relay scores are local advisory values derived from relay health. They are not published and do not automatically enable or disable relays.

## Community Allowlists

Allowlists are local user-managed trusted public keys with labels and notes. They are filters and review aids only; they do not prove that a public event is true.

Community allowlists can be shared as:

```json
{
  "schemaVersion": 1,
  "kind": "community-allowlist",
  "exportedAt": "2026-05-31T00:00:00.000Z",
  "entries": [{ "publicKey": "...", "label": "Local group", "note": "" }]
}
```

Imports merge by public key and recompute local trusted flags for synced cache records. Existing local notes are preserved when a matching imported key already exists.

Community curation lists are public `kind: 30004` events with a `d` tag, a `title` tag, and `a` tags that reference NIP-99 marketplace coordinates such as `30402:<pubkey>:<listing-id>`. Fetched lists enter the same review queue as other public events. Approved lists move into a synced public list cache and are treated as discovery filters, not identity verification or trust certification.

## Security Promises

Protocol-facing security promises are intentionally narrow: no automatic relay publishing, no automatic review import, no synced public cache writes into user-owned local records, no full agreement or full dispute event kind, no custody, no automatic wallet payment, and no decrypted private-key or NWC-secret persistence outside memory. NIP-47 payment responses and NIP-57 zap receipts are payment-server/wallet attestations only; they are not escrow, delivery guarantees, identity verification, fulfillment proof, or dispute resolution.

## Encrypted Dispute Bundles

Encrypted dispute bundle exports use:

- `schemaVersion: 1`
- `kind: "encrypted-dispute-bundle"`
- `kdf: "PBKDF2-SHA-256"`
- `algorithm: "AES-GCM"`
- `salt`, `iv`, and `ciphertext` as base64 strings

The encrypted plaintext contains a versioned dispute bundle JSON object. The passphrase is never stored.

## Agreements

Agreement hashes are SHA-256 over canonical agreement terms. Hash version 2 includes listing reference, participant labels, participant public keys, exchange terms, payment, fulfillment, deadline, refund, mediator, and evidence expectations. It excludes local IDs, timestamps, hash fields, and legacy local acceptance booleans.

The agreement preview and copied agreement text include the participant labels, participant public keys, listing reference, and hash version so the displayed terms match the hash inputs.

The Trade workspace uses agreements as private local trade contracts tied to listings. Agreement packets and acceptance receipts are private copy/file artifacts. A receipt is a signed local Nostr-shaped event over an agreement hash and role, but it is not part of public relay sync and there is no public Nostr event kind for full agreements.

Acceptance receipts prove that the configured buyer or seller public key signed a specific agreement hash. They do not prove real-world identity, fulfillment, escrow, payment, or legal enforceability.

Participant public keys in an agreement are intended signers, not proof by themselves. Agreement status is derived only from verified receipts for the stable terms hash.

## Disputes

Disputes are opened from existing agreement hashes and remain local. Full dispute cases and evidence metadata are not published to relays. Only explicit public outcome summaries use the dispute outcome attestation event kind.

Public dispute outcome summaries include a signer public key and are accepted only when the signed event author matches that key. They are summaries, not proof of fulfillment, escrow, or legal resolution.

## Reputation

Reputation uses signed contextual attestations. The signature proves the reviewer key signed a statement about a subject key and agreement hash. It does not prove the statement is true.
