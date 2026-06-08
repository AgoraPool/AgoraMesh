# QA Report Template

Copy this file for each release candidate and fill it manually. Do not store user telemetry or private test data in this report.

## Release Candidate

- Version:
- Commit:
- Date:
- Tester:
- Environment:
- Build source: CI artifact / local clean checkout
- Artifact verification:
  - `npm run release:check`:
  - `sha256sum -c SHA256SUMS`:

## Automated Checks

- `npm run release:rc-check`:
- CI workflow URL:
- Audit notes:
- Lockfile/dependency review notes:

## Accessibility Review

- Checklist used: `docs/accessibility-checklist.md`
- Keyboard-only navigation:
- Screen reader smoke test:
- Focus visibility:
- File inputs:
- Destructive actions:
- Remaining accessibility issues:

## Visual QA

- Home:
- Marketplace Discover/Create/My listings:
- Listing detail pages:
- Profile:
- Mediators:
- Trade:
- Reputation:
- Settings:
- Mobile widths tested:
- Desktop widths tested:
- Overflow or spacing issues:

## Workflow Smoke Tests

- Nostr signer connect / local identity fallback:
- Relay add/fetch/review/import:
- Public listing save then explicit publish:
- NIP-99 listing publish:
- Blossom image setup/upload:
- Trade agreement packet and receipt exchange:
- Dispute encrypted/plain export:
- Reputation attestation save then explicit publish:
- Full backup export/import:

## Security Promise Spot Checks

- No automatic publish:
- No automatic import:
- Synced cache separate from local user records:
- Private trade data blocked from public serializers:
- Decrypted local key lock behavior:
- No analytics/tracking observed:

## Release Decision

- Candidate accepted / rejected:
- Blocking issues:
- Follow-up issues:
- Sign-off:
