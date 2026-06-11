# User Guide

## Create Identity

Create a display name and passphrase. AgoraMesh generates a Nostr-compatible keypair in your browser and stores the private key encrypted.

Back up your identity. Losing the private key means losing the identity.

The home screen is a minimal product overview with primary Marketplace and Create listing actions. Setup details are kept out of the landing page so the first screen stays focused.

Readiness summaries on Profile and Settings show which common steps are ready, missing, or optional. They are computed from local data only and do not contact relays.

Scroll below the first Home viewport for the detailed product and security narrative: what stays local, what can become public, how Nostr review works, signer caveats, payment limits, trade privacy, community trust, release verification, and FAQ. This information is below the fold so the first screen stays minimal.

## Public Marketplace

Use Marketplace as the main public workspace. Discover shows local and approved synced listings, Create listing saves a public-ready local record, and My listings is where you review your own records, publish readiness, and relay receipts before publishing.

Marketplace keeps the first view records-first: search, offer/request, stable listing cards, and a quiet result footer are visible by default. Open Filters for category, fulfillment, payment, region, source, trust, hidden, expired, curation, and sorting controls.

Create peaceful offers or requests with the essential fields first: title, type, category, description, region, and contact. Images, fulfillment notes, payment preferences, tags, expiration, mediator preference, barter, and visibility stay under More listing details. New listings are public-ready by default, but saving never publishes automatically.

Discover hides expired listings by default, ranks visible and active records first, deduplicates repeated public records, shows a result count, and loads large result sets in chunks. Use the Filters disclosure to keep busy relays manageable without crowding the default view.

Marketplace hides longer explanatory copy behind Sync and discovery. Cards use the same scan-friendly layout in Discover and My listings; open an item page for descriptions, contact, payment instructions, receipts, trade actions, and owner publish options. Public relay publishing options are collapsed on local item pages. Public listing publishing uses NIP-99 classified listing events and makes the title, description, location, price, status, images, tags, and contact metadata readable by relays.

Empty-state panels explain what to do when a view has no matching local or synced records. They are suggestions only; no data is published until you choose a publish action.

After saving a profile, listing, relay, or reviewed sync item, AgoraMesh shows action-specific feedback and a small next-step prompt. These prompts are navigation aids; they do not automate publishing, importing, or trust decisions.

Create Listing now keeps payment input to simple public payment preferences. Existing or imported payment intents may still appear on item pages as public instructions: a payment URI, address, public handle, Cashu instruction, or note. AgoraMesh does not connect wallets, execute payment, confirm settlement, hold funds, or provide escrow.

Fulfillment labels such as local pickup, shipping, delivery, digital, and other are public discovery hints. Use approximate pickup or delivery notes and keep exact private logistics in the Trade workflow or an external channel.

Seller summaries in listing details are local context from public profiles, reputation attestations, allowlists, and short keys. They do not verify legal identity or guarantee fulfillment.

Listing images are optional public media. Configure a Blossom media server in Settings before uploading. Do not upload receipts, faces, exact addresses, private documents, evidence files, or sensitive screenshots. If images are selected, AgoraMesh uploads them before saving and shows a visible error if the upload is blocked or rejected.

Payment intents should never contain wallet seeds, private keys, private invoice memos, refund secrets, private settlement details, custody wording, or escrow wording. They are public marketplace metadata once published.

Community curation lists live under Marketplace Sync and discovery. They point to visible public marketplace records with Nostr coordinates. Publishing a list is explicit, and reviewed public lists enter the synced public cache before appearing in discovery.

## Trade Workspace

Use Trade for the private side of a marketplace exchange. Start from a local listing or a synced public listing, define participant labels and public keys, payment method, fulfillment terms, deadline, refund terms, optional mediator, and evidence expectations.

Starting a trade from a synced listing only pre-fills the local agreement form. It does not import the synced listing into your local listings and does not publish agreement terms.

When two parties do not share one device, each party keeps its own local copy of the private workflow. Export or copy the agreement packet through an external channel, then each party signs the same agreement hash with their own Nostr key and shares back an acceptance receipt. Buyer and seller public keys are intended signers only until valid receipts are present. A mutually signed agreement means both configured public keys signed the same hash; it does not prove legal identity, fulfillment, escrow, or payment.

The Mediator tab lets you choose a local or reviewed public mediator and copy that selection into the agreement. Agreement hashes, human-readable text, agreement packets, and acceptance receipts are available for copying or file export, but they are not published by AgoraMesh.

Disputes are opened from existing agreements. You can open a dispute from an unsigned agreement, but mutually signed receipts provide stronger evidence that both keys accepted the same terms. Evidence files are not uploaded. Use the Outcome tab to export plaintext JSON only when intentional, or prefer encrypted dispute bundles when sharing case details with another party.

## Reputation

Reputation is based on signed attestations. Treat attestations as context, not universal truth.

Use Create attestation to sign a factual public claim. You can select a saved agreement to prefill buyer, seller, mediator, and agreement hash context. Mutually signed agreements are labeled as stronger context, but AgoraMesh does not require them and does not publish private agreement terms.

Browse shows scan-friendly attestation cards with source, role, tags, signature status, short subject keys, and details behind a disclosure. Trade context groups attestations by subject key so you can compare roles, tags, trusted authors, untrusted authors, and verified signatures without treating that summary as identity verification.

## Relays

Nostr relays are optional. They can see public events you publish. The app works without relay connectivity.

Safety notices in the relay and sync screens explain metadata exposure and explicit fetch-before-cache behavior. A valid signature proves event authorship, not truth or safety. Marketplace fetch scope controls whether discovery stays with AgoraMesh-native NIP-99 listings or includes all valid NIP-99 classifieds. Expired synced listing cache rows are hidden by default; enable expired listings when you need older records.

Settings includes sync controls that summarize the public path: enable a relay, choose the Marketplace fetch scope, fetch public records explicitly, then return to Marketplace or publish your own listing. The app does not auto-fetch or auto-publish.

Settings is split into Account & signer, Relays & sync, Review queue, Public cache, Trust lists, Media servers, Backup & danger, and Diagnostics. Operational actions stay in their own sections, while relay health, fetch summaries, and publish receipts live in Diagnostics.

Profile offers two identity paths: connect an existing NIP-07 Nostr account or generate a new encrypted local identity. Extension-backed identities store only the signer public key and display name in AgoraMesh; reconnect the same signer before publishing or signing receipts. Local identities keep the existing passphrase unlock, lock, and private-key backup flow.

When you connect an existing signer, AgoraMesh checks the synced public cache for visible authored public records from the same key and restores matching profile, listing, and mediator records locally for editing. It does not query relays during sign-in; use Marketplace Fetch first if those public records are not cached yet.

After connecting an existing Nostr account, you can explicitly fetch standard Nostr profile metadata from enabled relays to prefill local profile fields. This is a relay query for your public key, not a publish action, and it does not import public cache records.

Settings also shows optional browser signer status. A NIP-07 signer can sign public events without revealing the extension private key to AgoraMesh. The signer public key must match the object author key, and local encrypted keys remain supported.

Browser signer extensions are externally trusted. AgoraMesh rejects modified signed events, changed timestamps, and mismatched author keys, but it cannot audit what an extension does outside the app.

Relay scores summarize local connection health, latency, useful event volume, and recent failures. They are hints for choosing relays, not guarantees.

Synced public records can be hidden locally. Hidden records stay in the public cache and can be shown again with the visibility filter.

If the app shows a conflict label, review the versions manually. AgoraMesh does not auto-merge public records or decide which version is true.

Community allowlists can be exported and imported as portable trust filters. Review labels and notes before sharing them.

Risky actions use explicit confirmation text. Treat plaintext dispute exports, allowlist imports, public publish, encrypted publish, and delete-all as intentional steps rather than routine saves.

## Accessibility

Use the skip link to move directly to the active page content. Navigation marks the current page for assistive technology, status messages announce important changes, and file import controls remain reachable from the keyboard.

Guided empty states, checklist actions, and safety notices are rendered as normal page content so keyboard and screen-reader users can reach the same workflow guidance.

Workspace tabs are labeled and can be switched with arrow keys. Disclosure buttons announce expanded/collapsed state and stay connected to their content for assistive technology. Before a production release, complete the manual checklist in `docs/accessibility-checklist.md`.

Release-candidate QA is documented outside the app with `docs/release-candidate-checklist.md` and `docs/qa-report-template.md`. AgoraMesh does not collect telemetry about user workflows or accessibility usage.

## Interface Rhythm

The app uses consistent spacing between forms, cards, filters, metadata, and action groups. On narrow screens, dense two-column areas collapse to one column so controls remain readable and reachable. Long keys, hashes, URLs, payment instructions, badges, and action rows are expected to wrap rather than overflow.

## Decluttered Controls

Common actions stay visible first. Advanced filters, public sync guidance, publishing choices, relay diagnostics, public cache records, allowlists, and backup tools are grouped behind disclosure buttons or settings tabs. Open the relevant section when you need power-user controls.
