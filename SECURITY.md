# Security

## Supported Version

This MVP is pre-1.0. Security fixes target the current main branch.

## Reporting

Please report security issues privately to the maintainers before public disclosure. Include reproduction steps, affected data, and whether private keys, published Nostr events, or dispute data are involved.

## Design Choices

- Private keys can be generated in-browser and encrypted with WebCrypto PBKDF2-SHA-256 plus AES-GCM.
- Existing NIP-07 Nostr accounts can be used as extension-backed identities without storing extension private keys in AgoraMesh.
- Private keys are not transmitted to relays.
- Decrypted local private keys are held in memory only and can be cleared with the lock action.
- Optional NIP-07 browser signers are externally trusted; AgoraMesh verifies the returned signer pubkey and rejects modified signed event kind, timestamp, tags, or content.
- Public Nostr events are built through explicit serialization functions.
- Public Nostr events pass through a sensitive-field publication guard before signing.
- Listing relay content can optionally be passphrase-encrypted with WebCrypto PBKDF2-SHA-256 plus AES-GCM before signing.
- Nostr relay sync imports into a review queue first; valid events require explicit user import.
- Approved synced records are stored separately from user-owned local records.
- Live relay subscriptions are opt-in and active only while the app is open.
- Dispute bundles can be exported with passphrase encryption using WebCrypto PBKDF2-SHA-256 plus AES-GCM.
- Zod validates listings, profiles, mediators, agreements, disputes, attestations, relays, and backups.
- No `dangerouslySetInnerHTML` is used.
- CSP headers are configured for Netlify, Nginx, and `index.html`.
- No third-party analytics or tracking pixels are included.
- The app has no custodial wallet or server-side admin credentials.
- Payment intents are public instructions only. The app rejects obvious seeds, secrets, private invoice memos, refund secrets, custody wording, and escrow wording.
- Community curation lists are discovery aids and do not certify identity, truth, or safety.

## Security Promises Checklist

- No custody of funds, keys, or escrow balances.
- No KYC, analytics, telemetry, or server account database.
- No automatic publish: every relay publish requires an explicit user action.
- No automatic import: fetched public events stay in review until explicitly imported.
- No private trade publishing: agreements, full disputes, evidence metadata, payment secrets, and settlement text remain local or export-only.
- No decrypted private-key persistence outside memory.
- No synced public record writes into user-owned local records.

## Release Candidate Security Gates

- Run `npm run release:rc-check` from a clean checkout.
- Verify `release/SHA256SUMS` with `npm run release:check` and `sha256sum -c SHA256SUMS`.
- Review `package-lock.json`, dependency changes, and `npm audit --audit-level=moderate` output.
- Complete the manual accessibility checklist and real-device visual QA before tagging a v1 release candidate.
- Use signed annotated tags for release candidates and attach only verified artifacts.

## User Warnings

- Pseudonymous does not mean anonymous.
- Relays can see public events you publish.
- Encrypted relay publishing hides payload content, not metadata such as event kind, author public key, timestamp, or relay choice.
- Do not post exact addresses publicly.
- Keep sensitive dispute evidence local unless you trust the recipient.
- Prefer encrypted dispute bundle export when sharing case details.
- Losing the private key means losing the identity.
