# Roadmap

## MVP

- Local encrypted identity.
- Local listings and browse filters.
- Agreement builder.
- Mediator profiles.
- Local dispute cases and JSON bundles.
- Signed marketplace reviews.
- Minimal Nostr publish/sync.
- English and Czech UI.
- Static and self-hosted deployment docs.

## Next

- Manual assistive-technology sign-off using the v0.25.0 accessibility checklist on production builds.
- Component architecture cleanup after security-critical and accessibility flows stabilize.
- Marketplace usability testing on the stabilized records-first Discover/Create/My listings flow, publish readiness, relay review, and trade workspace completion.
- Private Nostr coordination protocol investigation for opt-in trade sharing without publishing private agreement or dispute content.
- Real-device visual QA pass before v1.0, including mobile marketplace cards, item pages, and Create Listing.
- Usability testing for progressive disclosure defaults in Browse and Settings.
- Deeper moderation ergonomics beyond local bulk hide/reject actions, including better spam review workflows.
- Relay score tuning based on real-world relay behavior.
- Conflict resolution workflows for explicit version selection and merge notes.
- Final maintainer decision for v1.0 after release-candidate QA evidence is complete.

## Completed Hardening

- Read-only Nostr sync UI with explicit import review.
- Encrypted dispute bundle export/import.
- Stronger key backup and lock UX.
- Public/private publication guard.
- CI for typecheck, lint, tests, build, audit, and security headers.
- Full public Nostr sync cache separated from local user data.
- Optional live sync while the app is open.
- Relay health, per-relay publish receipts, and optional community allowlists.
- v0.2.0 accessibility foundation with skip link, landmarks, live status regions, focus-visible styling, reduced-motion handling, and keyboard-accessible file import controls.
- v0.3.0 sync quality with local hide/unhide moderation, synced conflict labels, relay quality scores, and portable community allowlist import/export.
- v0.4.0 release hardening with scripted release artifacts, checksums, manifest generation, CI artifact upload, and verification docs.
- v0.5.0 guided UX and copy pass with a first-run checklist, workflow safety notices, richer empty states, and localized production guidance.
- v0.6.0 UI rhythm polish with consistent card, form, filter, action, metadata, and responsive spacing.
- v0.7.0 decluttered UX with advanced filters, listing publish controls, sync diagnostics, trust tools, and backups moved behind progressive disclosure.
- v0.8.0 workflow polish with readiness summaries, field hints, clearer disabled states, action-specific feedback, risk confirmations, and next-step prompts.
- v0.9.0 guided core declutter with one primary next action on Home, Profile, and Settings while status and diagnostics stay behind disclosures.
- v0.10.0 public Nostr and trade workspace shift with public-ready listings by default, explicit relay publishing, Trade navigation, listing-backed agreements, mediator selection, dispute creation from agreements, and local outcome/export handling.
- v0.11.0 marketplace flow consolidation with Post merged into Marketplace tabs for Discover, Create listing, and My listings, plus legacy listing route compatibility.
- v0.12.0 marketplace UX follow-through with compact Marketplace guidance, simpler listing creation, per-listing publish readiness and receipts, and direct local/synced listing handoff into Trade.
- v0.13.0 marketplace clarity and public sync wizard with compact listing cards, collapsed Marketplace explanations, Trade-only local sharing notice, and guided public relay/review/import steps.
- v0.14.0 calm Marketplace and minimal Home with records-first discovery, collapsed sync guidance, quieter notes, stronger note padding, and scrollable product explanation sections.
- v0.15.0 Nostr growth completion with richer below-fold Home copy, optional NIP-07 browser signer support, public payment intents, and NIP-51-style community curation lists.
- v0.16.0 security promises and landing trust pass with stronger publication guard coverage, signer/payment/curation safety copy, a formal security promises checklist, and deeper below-fold Home documentation.
- High-volume Marketplace polish with default expired-listing filtering, result counts, filter reset, and incremental loading for busy public feeds.
- Trade consent redesign with private agreement packets, signed buyer/seller acceptance receipts, receipt-based agreement status, and unsigned-dispute warnings.
- v0.17.0 trade receipt and signing hardening with guided agreement exchange, missing-role receipt status, duplicate receipt rejection, localized import errors, and stricter NIP-07 timestamp verification.
- v0.18.0 existing Nostr account sign-in with extension-backed identities, opt-in kind 0 profile metadata prefill, local/generated identity fallback, and stricter active signer diagnostics.
- v0.19.0 Nostr reliability and Marketplace triage with signer status strips, relay fetch summaries, review filters and bulk actions, Marketplace ranking/deduplication, curation filters, and bulk synced-record hiding.
- v0.20.0 Marketplace discovery and seller trust polish with localized category chips, fulfillment/payment quick filters, Cashu payment intents, scan-first listing cards, seller context, and mobile-friendly Marketplace ergonomics.
- v0.21.0 listing pages and Blossom media with static-host-safe item routes, organized detail pages, deduplicated discovery filters, public image metadata, and user-configured media servers.
- v0.22.0 minimal Marketplace UX with a compact discovery toolbar, single Filters disclosure, thumbnail-style listing cards, collapsed item publish options, and essentials-first listing creation.
- v0.23.0 Marketplace QA and visual stabilization with shared Discover/My listings card geometry, stable mobile item cards, calmer Create Listing defaults, item page section rhythm, and updated production docs.
- v0.24.0 Reputation trust and Settings clarity with trade-linked attestation creation, subject summaries, signer-aware reputation signing, scan-friendly reputation browsing, and clearer Settings sections for account, relays, review, cache, trust, media, backup, and diagnostics.
- v0.25.0 v1 QA hardening with labeled tablists/disclosures, keyboard tab switching, responsive overflow fixes for dense cards/forms/action rows, a production accessibility checklist, and updated v1 readiness docs.
- v0.26.0 v1 release-candidate readiness with `release:rc-check`, release checklist, QA report template, release notes template, signed-tag guidance, dependency review expectations, and artifact verification docs.
- v0.27.0 Czech localization polish with more natural UI copy, consistent marketplace/trust terminology, and updated release version references.
- NIP-99 marketplace cutover with direct public fetch/cache, external NIP-99 image support, newest-wins synced listing updates, and no runtime support for the removed custom listing kind.
- Marketplace profile/media and sync UX improvements with circular avatars, Blossom avatar upload, mediator profile linkage, marketplace profile summaries, and clearer fetch scope controls.
- App navigation and Create Listing cleanup with desktop sidebar/mobile bottom navigation, collapsible rail, NIP-99-focused listing fields, and removal of payment/fulfillment controls from Create/Edit.
- v0.28.0 sidebar, scope, and signer-restore polish with aligned collapsed desktop navigation, Marketplace display/fetch scope switching, extension sign-in restoration of authored cached profile/listing/mediator records, and updated release version references.
- v0.29.0 minimal agorist UI foundation with corrected app icon loading, SVG sidebar brand mark alignment, flatter brutalist surfaces, reduced card/pill styling, and calmer Home/Marketplace/Create/Profile presentation.
- v0.30.0 marketplace UX polish with a linked-delta decentralization icon, centered collapsed sidebar rail, quieter Browse filter hierarchy, ordered listing image gallery editing, and clearer handling of external NIP-99 listing images.
- v0.31.0 marketplace flow polish with one public listing discovery panel, simple listing image flipper, mesh monogram app icon, and calmer single-page Create/Edit Listing flow.
- v0.32.0 Browse and Settings cleanup with preset-based Marketplace filters, grouped curation/maintenance controls, and review queue diagnostics hidden from primary Settings navigation.
- v0.33.0 Nostr contact and encrypted intro messaging with Nostr contact methods, explicit outbound NIP-17/NIP-44 messages, and plaintext-free contact receipts.
- v0.34.0 Nostr threaded inbox with explicit NIP-17 gift-wrap fetch, NIP-44 decrypt support, encrypted local message cache, lightweight threads, replies, and Inbox primary navigation.
- v0.35.0 Lightning LNURL and NIP-57 payment handoff with public seller payment metadata, signed zap requests, external BOLT11 invoice handoff, explicit zap receipt checks, and metadata-only local payment attempts.
- v0.36.0 NWC Lightning execution with encrypted local NIP-47 wallet connections, explicit wallet unlock/test/disconnect controls, `pay_invoice` handoff after LNURL invoice generation, paid/failed metadata updates, duplicate-payment guardrails, and no wallet-secret backups.
- v0.37.0 seller trust and reputation reviews with scored `39004` attestations, listing/agreement context, verified newest-wins aggregation, post-trade review prompts, trusted-reviewer cues, and clearer seller summaries.
- v0.38.0 native Inbox and marketplace reviews with a simpler DM layout, hidden protocol diagnostics, seller/listing-first reviews, optional agreement context, and direct Review seller actions.
- v0.39.0 operator support zap badges with build-configured LNURL support payments, validated public NIP-57 receipt caching, profile/seller/reputation/curation badge display, support filters, and no trust or allowlist mutation.
- v0.40.0 public receipt portability with explicit supporter badge refresh, seller listing zap receipt checks, improved original-sender DM reply threading, encrypted outgoing inbox continuity, and cleaner AgoraMesh NIP-99 listing publication without new fulfillment tags.
- v0.41.0 marketplace listing detail UX with price/media/seller-first pages, safe paragraph rendering, quieter secondary disclosures, reliable effective AgoraMesh-native scope labels, and minimal Browse polish.
- v0.42.0 message/payment and Inbox UX cleanup with one listing Contact and Pay panel, compact Nostr context handling, quieter Lightning wallet state, and a simpler messenger-style Inbox.
- v0.43.0 cleaner Inbox notifications with separate DM and public payment activity sections, local nav badges, one-shot app-open scans, and collapsed listing Contact and Pay actions.

## Not Planned For MVP

- Custodial escrow.
- Custodial wallet or payment processing.
- Internal chat.
- Backend database.
- Admin surveillance dashboards.
- AI moderation.
- Native mobile apps.
