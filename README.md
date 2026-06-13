# AgoraMesh

AgoraMesh is an open-source MVP for local-first voluntary trade, signed trust, and consent-based dispute resolution. It is designed for peaceful agorists, mutual-aid groups, freelancers, small vendors, privacy advocates, local communities, and self-hosters.

The application avoids custodial funds, KYC, tracking, analytics, platform lock-in, and a required central database. Data is stored locally in IndexedDB. Public Nostr discovery and explicitly approved publishing are the normal marketplace path; private trade terms, disputes, evidence metadata, and keys remain local or export-only.

## Features

- Pseudonymous identity from either an existing NIP-07 Nostr account or a generated in-browser keypair.
- Private key encrypted at rest with a passphrase using WebCrypto PBKDF2 and AES-GCM.
- English and Czech localization.
- Unified Marketplace workspace for minimal records-first discovery, stabilized scan-friendly listing cards, dedicated listing pages, simplified listing creation, own listing publish readiness, relay receipts, and explicit relay publish approval.
- Search, offer/request, category, region, source, trust, hidden, expiry, and curation filters with preset-based advanced controls collapsed by default.
- Optional public listing images through user-configured Blossom media servers.
- Seller context in listing details from matching public profiles, reputation attestations, allowlists, and short public keys, without claiming identity verification.
- Trade workspace for local or reviewed public listing-backed agreements, private agreement packets, signed acceptance receipts, mediator selection, disputes, and local outcome/export handling.
- Mediator directory and mediator profile publishing.
- Local-first dispute cases with evidence metadata and JSON bundle export.
- Passphrase-encrypted dispute bundle export/import for safer case sharing.
- Trade-linked signed reputation attestations, subject summaries, and scan-friendly reputation browsing instead of global star ratings.
- Configurable Nostr relays for public profiles, listings, mediators, and attestations, with a Public Sync Wizard for relay setup, direct Marketplace fetch, optional Nostr profile metadata fetch, and returning to Marketplace.
- Public listings publish as NIP-99 classified listings. Private contact or order encryption is deferred to a later protocol sprint.
- Direct public Nostr fetch into a separate synced public cache, with advanced review diagnostics retained for unusual events.
- Relay fetch diagnostics, Marketplace ranking, and duplicate triage for busy public feeds.
- Optional live sync while the app is open.
- Relay health, per-relay publish receipts, and optional community allowlists.
- Local moderation for synced public records, conflict labels, relay quality scores, and portable community allowlist import/export.
- Accessibility foundation with skip navigation, page landmarks, live status messages, visible keyboard focus, and reduced-motion support.
- Minimal Home product page, guided first-run setup disclosure, workflow safety notices, and clearer empty states for production use.
- UI spacing and visual QA polish for denser workflows, stable listing cards, more readable forms, item pages, and better mobile rhythm.
- v1 QA hardening with labeled tablists/disclosures, keyboard-accessible workspace tabs, stronger responsive overflow handling, and a documented manual accessibility checklist.
- v1 release-candidate readiness with one RC check command, release checklist, QA report template, release notes template, and signed-tag guidance.
- Decluttered progressive disclosure for filters, public sync guidance, listing publishing, reputation details, media uploads, sync diagnostics, trust tools, backups, and private trade details.
- Workflow readiness summaries, field guidance, action-specific feedback, and next-step prompts for common flows.
- Full JSON backup import/export and local data deletion.
- Static hosting, Netlify, Docker/Nginx, and optional Tor deployment notes.

## Philosophy

AgoraMesh prioritizes:

1. Security
2. Privacy
3. Auditability
4. Usability
5. Decentralization
6. Performance
7. Visual polish

The project does not support violence, weapons, stolen goods, coercion, fraud, exploitation, doxxing, harassment, or non-consensual activity.

## Setup

```bash
npm install
npm run dev
```

## Checks

```bash
npm run build
npm run typecheck
npm run lint
npm test
npm run audit
npm run security:headers
npm run release:artifacts
npm run release:check
npm run release:rc-check
```

## Architecture

- Vite, React, TypeScript strict mode.
- Tailwind CSS v4 entrypoint plus local CSS.
- IndexedDB through Dexie.
- Zod validation at persistence and publication boundaries.
- WebCrypto for local private-key encryption.
- `nostr-tools` signing and verification primitives.
- Manual Nostr relay publish path over WebSocket for a small audit surface.
- Public Nostr serialization passes through an allowlisted publication guard.
- Synced public records are cached separately from user-owned local records.
- Synced public records can be hidden locally; hiding never deletes relay data and never writes into user-owned records.
- Live sync is opt-in and active only while the app is open.
- No backend server requirement.

## Security Promises

- No custody: AgoraMesh does not hold funds, keys, or escrow balances.
- No KYC or analytics: there is no tracking pixel, telemetry, or account database.
- Explicit publish: saving a profile, listing, mediator profile, attestation, or curation list does not contact relays.
- Explicit fetch: public Nostr records are cached only after the user presses Marketplace Fetch, with the selected NIP-99 scope.
- Private trade stays local: agreements, acceptance receipts, full disputes, evidence metadata, payment secrets, and settlement text are local or export-only.
- Memory-only decrypted keys: local private keys are decrypted only for the current browser session and can be locked again.
- Public cache separation: synced public records stay separate from user-owned local records.

## Release Artifacts

Current app version: `0.37.0`.

Use the lockfile and CI workflow for release builds:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run audit
npm run security:headers
npm run release:artifacts
npm run release:check
npm run release:rc-check
```

The release output is written to `release/` and includes `dist/`, `agoramesh-v0.37.0-dist.tar.gz`, `SHA256SUMS`, and `release-manifest.json`. Do not publish builds from an unreviewed dependency tree. Verify artifacts before upload with:

```bash
npm run release:check
(cd release && sha256sum -c SHA256SUMS)
```

For release candidates, complete [the release candidate checklist](docs/release-candidate-checklist.md), fill a QA report from [the QA report template](docs/qa-report-template.md), and prepare notes from [the release notes template](docs/release-notes-template.md). Maintainers should create signed annotated tags only after automated checks, artifact verification, dependency review, accessibility sign-off, and real-device visual QA are complete.

## Limitations

- This MVP does not include escrow, custodial payment processing, moderation AI, ActivityPub, or a backend database.
- Relay sync is public-data-only and explicit fetch-before-cache.
- Public-first means public discovery and explicit public publishing, not automatic publishing or automatic trust.
- Optional browser signer support can act as the active AgoraMesh identity and sign public events without storing extension private keys in AgoraMesh.
- Listing payment intents, including Cashu instructions, are public instructions only. Lightning LNURL/NIP-57 support creates a signed zap request and BOLT11 invoice. With an unlocked NIP-47/NWC wallet connection, AgoraMesh can send `pay_invoice`; otherwise it hands the invoice to the user's external wallet. AgoraMesh does not hold funds, confirm fulfillment, or provide escrow.
- Fulfillment labels such as local pickup, shipping, delivery, digital, and other are public discovery metadata when published.
- Listing images are public Blossom uploads. AgoraMesh stores only public HTTPS image metadata and does not provide a media backend.
- Seller context is advisory and local. Signatures prove event authorship only, not legal identity or fulfillment.
- Community curation lists help public discovery but do not certify identity or trust.
- Private Nostr coordination is limited to explicit NIP-17/NIP-44 intro and reply flows. There is no live chat, inbox polling, delivery guarantee, or metadata privacy guarantee.
- Allowlists help filter trust but do not certify truth.
- Relay scores and conflict labels are advisory. They help review noisy public data but do not prove truth or safety.
- Marketplace ranking, curation filters, and duplicate hiding are local convenience tools, not moderation or certification.
- Getting-started guidance and safety notices are educational UI only; they do not verify identity, guarantee relay delivery, or replace user review.
- The v0.2.0 accessibility pass adds baseline keyboard and screen reader affordances; a full assistive-technology audit is still pending before 1.0.
- The v0.25.0 QA pass adds stronger automated coverage for navigation/disclosure semantics and responsive overflow, but manual assistive-technology and real-device visual testing are still required before a v1 release.
- The v0.26.0 release-candidate pass adds release gates and QA templates. It does not publish releases automatically and does not make this build final v1.0.
- The v0.27.0 Czech copy pass improves localization tone and consistency while preserving the existing security and privacy promises.
- The v0.28.0 polish pass improves collapsed sidebar alignment, Marketplace NIP-99 scope filtering, and signer-backed restoration of authored cached public records for local editing.
- The v0.29.0 UI pass fixes app icon loading, aligns the collapsed sidebar brand rail, and starts a restrained minimal agorist visual redesign for the main marketplace flows.
- The v0.30.0 marketplace UX pass adds the linked-delta icon, tightens collapsed sidebar alignment, simplifies Browse filters, and adds ordered multi-image listing gallery editing.
- The v0.31.0 marketplace flow pass merges public listing discovery controls, adds a simple listing image flipper, introduces a mesh monogram icon, and calms the Create Listing form.
- The v0.32.0 Browse and Settings cleanup moves advanced filtering into grouped presets and hides the old review queue under diagnostics.
- The v0.33.0 Nostr contact pass adds first-class Nostr contacts, explicit encrypted NIP-17/NIP-44 intro messages, and plaintext-free outbox receipts.
- The v0.34.0 threaded inbox pass adds explicit NIP-17 fetching, passphrase-protected readable message cache, lightweight threads, and primary Inbox navigation.
- The v0.35.0 Lightning pass adds public seller LNURL metadata, signed NIP-57 zap request creation, external invoice handoff, explicit receipt checks, and metadata-only local payment attempts.
- The v0.36.0 NWC pass adds encrypted local NIP-47 wallet connection storage, wallet testing, explicit `pay_invoice` execution, duplicate-payment guardrails, and backup exclusion for wallet secrets.
- The v0.37.0 reputation pass turns signed attestations into scored marketplace reviews with listing context, trusted-reviewer cues, seller summaries, and duplicate-review guardrails.
- A compromised browser can still steal data entered into that browser.
- Pseudonymous does not mean anonymous; public relay metadata may be correlated.

## Documentation

- [Protocol](docs/protocol.md)
- [Deployment](docs/deployment.md)
- [Accessibility checklist](docs/accessibility-checklist.md)
- [Release candidate checklist](docs/release-candidate-checklist.md)
- [QA report template](docs/qa-report-template.md)
- [Release notes template](docs/release-notes-template.md)
- [Mediator guide](docs/mediator-guide.md)
- [User guide](docs/user-guide.md)
- [Security](SECURITY.md)
- [Privacy](PRIVACY.md)
- [Threat model](THREAT_MODEL.md)
- [Roadmap](ROADMAP.md)
