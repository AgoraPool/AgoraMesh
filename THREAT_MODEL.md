# Threat Model

## Malicious Relay

Relays can refuse, delete, reorder, correlate, or log public events. AgoraMesh treats relays as untrusted transport and verifies signatures where possible.
Fetched events enter a review queue and require explicit import.
Approved events enter a separate synced public cache rather than local user-owned records.

## Compromised Browser

A malicious extension, compromised browser, or infected device can read user input and local storage after unlock. Users should keep browsers and extensions minimal and updated.
Optional NIP-07 signer extensions reduce local private-key handling inside AgoraMesh, but they add extension trust. A malicious signer can refuse signing, sign unexpected events, or expose keys outside AgoraMesh.
AgoraMesh verifies signer pubkey, event kind, tags, content, and signature before publishing, but this cannot protect against extension behavior outside the app.
When an existing Nostr account is used as the AgoraMesh identity, the app stores only public identity metadata. Reconnecting the same browser signer is required for signatures. Optional kind `0` metadata fetches query enabled relays for the connected public key and may reveal interest in that key to those relays.

## Phishing

Attackers may imitate AgoraMesh or request key backups. The app warns users that private keys should not be shared.

## Lost Private Key

Lost keys cannot be recovered. The app supports identity export and warns users during identity creation.

## Metadata Leakage

Regions, contact methods, relay choices, timing, and listing content can leak metadata. Users should avoid exact locations and sensitive descriptions.
Live sync can increase timing metadata leakage because relays see active subscriptions while the app is open.
Public-ready listings are easier to publish from Marketplace, but saving still does not contact relays. Users should review contact methods, relay readiness, and receipt feedback on the local listing page before publishing.
Payment intents, fulfillment labels, and listing image metadata are public listing metadata. Users should not include private invoice memos, wallet seeds, Cashu secrets, escrow/custody claims, refund secrets, exact delivery details, faces, receipts, or sensitive settlement context.
The Public Sync Wizard makes relay setup and review import easier to follow, but it still uses public relays and does not reduce relay metadata exposure.
The minimal Marketplace layout hides guidance, filters, descriptions, media, and publish options by default; users still need to open item details before publishing or starting a trade. Visual stabilization makes cards easier to scan but does not validate seller identity or listing truth.
High-volume relays can create noisy Marketplace views. Default expired-listing filtering and incremental loading reduce clutter, but users should still filter by source, trust, region, and hidden records.
Local ranking, deduplication, seller summaries, curation filters, and bulk review actions reduce noise but can still hide useful records or amplify bad community lists. Seller summaries do not verify legal identity. Users should review risky imports manually.
Accessibility and responsive-layout hardening can make risky actions easier to find, but it does not reduce the underlying public relay, signer-extension, Blossom, payment-intent, or private-trade sharing risks. Users still need to review safety notices before publishing, importing, uploading, signing, or exporting.

## Correlation Attacks

Using the same public key, contact handle, writing style, or relay set across communities can correlate identities.

## Malicious Mediator

Mediators may be biased or disclose private information. The app emphasizes voluntary selection, conflict-of-interest disclosure, and local-first dispute bundles.
The Trade workspace copies mediator choices into local agreements; it does not verify mediator identity or publish private agreement terms.
Starting Trade from a synced listing uses public data as form prefill only. Users should still verify the counterparty public keys and terms before sharing agreement packets.
Separate-device trades depend on external coordination. Agreement packets, signed acceptance receipts, and encrypted dispute bundles must be exchanged through channels chosen by the parties; AgoraMesh does not provide private message delivery or automatic private sync.
Acceptance receipts prove that a configured Nostr key signed a specific agreement hash. Manually entered public keys are not proof until a matching valid receipt exists. Receipts do not prove legal identity, fulfillment, payment, escrow, or dispute truth.
Private Nostr coordination is deferred because it needs separate protocol design for metadata, consent, replay, and key-management risks.

## Fake Reputation

Signed attestations prove authorship, not truth. Users should evaluate trust context, agreement hashes, text, tags, and known public keys.
Reputation summaries group signed public claims by subject key for easier review, but they can amplify misleading attestations if users do not inspect authors, tags, and agreement context.

## Spam Listings

Nostr relays may contain spam. The MVP supports local filtering but does not implement global moderation.
Community allowlists help filter trusted authors but do not eliminate spam or false claims.
Community curation lists can amplify spam or misleading records. They are treated as reviewable discovery aids, not certification.
Synced records can be hidden locally, but hiding does not remove relay events or prevent future events from the same author.

Blossom servers can retain, mirror, or delete uploaded images independently of AgoraMesh. Upload authorization proves control of a Nostr key for the upload request; it does not make media private or removable.

## Conflicting Public Records

An author can publish multiple public records for the same object id. AgoraMesh labels likely conflicts and duplicates but does not automatically decide which one is true.

## Community Allowlist Sharing

Shared allowlists can contain misleading labels or sensitive notes. Imported allowlists are treated as local filters, not certification.

## Sybil Attacks

Attackers can create many identities. Signed contextual attestations reduce but do not eliminate Sybil risk.

## Hostile Hosting Provider

Static hosts can serve modified JavaScript. Self-hosting, reproducible builds, checksums, and Tor/onion deployment can reduce this risk.

## XSS

The app stores user-generated plain text and does not use `dangerouslySetInnerHTML`. CSP limits script execution sources.
Publication guards reject sensitive fields before public events are signed.
Security-promise tests cover private key material, encrypted identity blobs, full agreement terms, full dispute details, evidence metadata, local filenames, private settlement text, and payment secrets.

## Supply Chain Risk

Dependencies are intentionally limited. Use `npm audit`, review lockfile changes, pin deployments, and verify release artifacts with `npm run release:check` or `sha256sum -c SHA256SUMS`.
Release candidates should also pass `npm run release:rc-check`, use signed annotated tags, and include reviewed `SHA256SUMS` plus `release-manifest.json`. These checks reduce accidental release mistakes but cannot protect users from a compromised maintainer machine, compromised static host, malicious browser extension, or users installing an unverified build.
