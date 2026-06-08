# Privacy

AgoraMesh is local-first. IndexedDB on the user's device is the primary storage layer.

## Stored Locally

- Encrypted identity private key for generated local identities, or public signer identity metadata for extension-backed Nostr identities.
- Public profile draft.
- Listings, including public-ready listing drafts that have not necessarily been published.
- Agreements.
- Dispute cases.
- Evidence metadata.
- Nostr review queue items fetched from relays.
- Synced public cache records approved from the review queue.
- Relay health, publish receipts, sync settings, and community allowlists.
- Local hidden/visible choices for synced public records.
- Reputation attestations, including local subject summaries derived from signed public claims.
- Local community curation lists and reviewed synced curation lists.
- Relay settings.
- Local-only UI dismissal flags for guided help panels.

Decrypted local private keys are not persisted as stored data. They exist only in memory after unlock and are cleared by locking the identity or closing the session.

## Published Only By User Action

- Public profile.
- Public listing.
- Mediator profile.
- Reputation attestation.
- Dispute outcome summary, only when explicitly opted in.
- Community curation list.

Public listing events include the listing contact method, fulfillment labels or notes, public image metadata, and any payment intents you choose to add. Use encrypted relay publishing when the contact method or listing body should be shared only with people who know the passphrase.

Saving a public-ready listing in Marketplace does not publish it. Relay publishing remains an explicit action from the local listing page with publish readiness and per-relay receipt feedback.

The minimal Marketplace, item-card, item-page, and Home layouts change what is visible by default, not what is stored or published.

Accessibility and visual QA changes affect labels, focus behavior, spacing, and disclosure behavior only. They do not add telemetry, analytics, or new stored workflow state.

Release-candidate checklists, QA reports, and release notes are maintainer-authored documents. They are not generated from user telemetry and should not include private user data, private trade content, evidence metadata, private keys, or unpublished relay data.

## Public Sync

Relay sync only fetches public AgoraMesh event kinds. Review queue items and synced public cache records may reveal relay choice, timing, public keys, and public listing/profile content. Live sync is opt-in and runs only while the app is open.

The Public Sync Wizard is a local UI guide for the same public workflow: enable relays, fetch events, review imports, and return to Marketplace. It does not publish, import, or trust records automatically.

Encrypted relay-content publishing hides the event payload from relays, but relays can still observe metadata such as event kind, author public key, timestamp, relay choice, and minimal tags.

Hiding a synced record is local-only. It does not contact a relay, publish moderation metadata, or notify the event author.

Relay scores are calculated locally from relay health data. They are advisory and are not shared.

Relay fetch summaries, review filters, Marketplace ranking, duplicate hiding, curation filters, and bulk hide/reject choices are local UI and storage behavior. They do not publish moderation decisions or notify authors.

Community allowlist export intentionally shares public keys, labels, and notes from the allowlist file. Review notes before sharing if they contain sensitive context.

Community curation lists intentionally share list titles, descriptions, author public keys, and referenced public record coordinates. Seller summaries combine public cache/profile/reputation context locally. They are discovery metadata, not private trade records or identity verification.

Reputation subject summaries are computed locally from local and reviewed public attestations. They group public keys, roles, tags, and signature status for judgment context; they are not published as new records and do not verify legal identity.

Blossom media uploads are public. AgoraMesh stores HTTPS image URLs, hashes, MIME type, size, optional alt text, and the configured Blossom server URL. Local filenames are not stored in listing payloads.

Optional browser signer mode uses a NIP-07 extension to sign public events and can be used as the active AgoraMesh identity. AgoraMesh receives signed events and the extension public key, but does not store extension private keys. A malicious or compromised signer extension remains outside AgoraMesh control.

Signer responses are checked against the unsigned event. If the extension changes kind, timestamp, tags, content, or author key, AgoraMesh rejects the publish attempt.

Fetching standard Nostr profile metadata is opt-in after signer connection. It queries enabled relays for the connected public key and can reveal interest in that account to those relays.

UI preferences and help-panel dismissals are stored only in local browser storage. AgoraMesh does not send analytics or telemetry about which guidance was viewed or dismissed.

## Never Published By Design

- Private keys.
- Exact addresses.
- Private messages.
- Private dispute details.
- Evidence files.
- Local image filenames.
- Payment secrets.
- Private payment memos, wallet seeds, Cashu secrets, escrow/custody instructions, and private invoice context.
- Full agreement details unless a user exports or publishes them outside the app.
- Full trade workspace agreement text, dispute details, evidence metadata, and private settlement text.

Starting a private trade from a synced public listing pre-fills a local agreement form only. It does not copy the synced listing into user-owned local listings.

Private local workflows are per browser. If two parties use separate devices, AgoraMesh does not automatically synchronize agreement drafts, acceptance receipts, dispute notes, evidence metadata, or exported bundles between them.

Agreement packets and acceptance receipts are private copy/file artifacts. Sharing them reveals the agreement terms, agreement hash, role, signer public key, and acceptance time to whoever receives them.

Private Nostr coordination is not part of the current protocol. Private trade sharing remains copy/export based until a separate protocol and threat-model sprint defines it.

## Dispute Bundles

Plain dispute JSON export is available for transparency and self-audit. Encrypted dispute bundle export should be preferred when sharing with another party. The passphrase is not stored.

## Contact Methods

The MVP supports Matrix, SimpleX, Session, email, and custom contact fields. Email is allowed but discouraged because it is often privacy-weak.
