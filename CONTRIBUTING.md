# Contributing

AgoraMesh welcomes contributions that improve privacy, safety, accessibility, auditability, localization, and self-hosting.

## Ground Rules

- Keep the app peaceful and non-custodial.
- Do not add KYC, analytics, tracking pixels, or surveillance workflows.
- Do not add escrow, payment custody, or private messaging in the MVP.
- Prefer small, reviewable changes.
- Add or update tests for behavior changes.
- Keep English and Czech strings in sync.

## Local Workflow

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build
npm run release:artifacts
npm run release:check
```

## Security Changes

Security-sensitive changes should explain:

- What threat is being addressed.
- What data becomes public or remains private.
- Whether private keys, dispute details, contact methods, or evidence metadata are affected.
- How the change was tested.

## Release Changes

Release tooling changes should keep `package-lock.json` authoritative, avoid unreviewed dependency updates, and preserve `npm run release:check` as the local verification step for generated artifacts.
