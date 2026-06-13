# Release Notes Template

## AgoraMesh vX.Y.Z-rc.N

### Summary

Briefly describe the release-candidate purpose and the main changes since the previous release.

### Security Promises

- No custody.
- No KYC or analytics.
- Explicit publish.
- Explicit import.
- Private trade remains local/export-only.
- Decrypted local keys are memory-only.
- Synced public cache remains separate from local user-owned records.

### Known Limitations

- No escrow, custody, automatic wallet payment, wallet balance management, backend, internal chat, AI moderation, or private Nostr trade messaging.
- Public relay metadata can be correlated.
- Blossom images are public media uploads.
- Payment intents are public instructions only.
- Community curation and allowlists are filters, not certification.

### Artifacts

- `agoramesh-vX.Y.Z-dist.tar.gz`
- `SHA256SUMS`
- `release-manifest.json`

### Verification

```bash
npm run release:check
(cd release && sha256sum -c SHA256SUMS)
```

### Dependency And Lockfile Review

- Lockfile hash:
- Dependency changes:
- Audit result:

### Manual QA Results

- Accessibility checklist:
- Real-device visual QA:
- Nostr relay/review/publish smoke test:
- Private trade packet/receipt/export smoke test:
- Backup/export/import smoke test:

### Signed Tag

- Tag:
- Signature verified:

### Follow-Ups

- Private Nostr coordination protocol investigation.
- NIP-47 and NIP-57 investigations.
- Deeper moderation/spam triage.
- Relay scoring tuning.
- Conflict merge UX.
