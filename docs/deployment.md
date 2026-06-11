# Deployment

## Static Hosting

```bash
npm ci
npm run release:rc-check
```

Upload `release/dist/` to any static host. Configure SPA fallback to `index.html`.
Keep `package-lock.json`, `release/release-manifest.json`, and `release/SHA256SUMS` with releases.

To verify downloaded artifacts:

```bash
sha256sum -c SHA256SUMS
```

The tarball `agoramesh-v<version>-dist.tar.gz` is created from `release/dist/` with sorted entries and fixed ownership metadata for reproducible comparison.

Release verification is part of the security model. Keep the lockfile with the release, compare `release-manifest.json` against the package version and Node/npm versions used in CI, and do not host artifacts whose checksum verification fails.

Before publishing a release candidate, complete `docs/release-candidate-checklist.md` and fill `docs/qa-report-template.md`. Maintainers should create a signed annotated tag only after the checklist passes:

```bash
git tag -s v0.30.0-rc.1 -m "AgoraMesh v0.30.0 RC 1"
git push origin v0.30.0-rc.1
```

Attach verified artifacts manually if creating a GitHub Release. AgoraMesh does not automatically publish GitHub Releases from CI.

## Netlify

`netlify.toml` is included:

```bash
npm run release:rc-check
```

Netlify publishes `dist/` and applies CSP, referrer, frame, content-type, and permissions headers. CI also uploads the generated `release/` directory as a workflow artifact.

## Docker/Nginx

```bash
docker build -t agoramesh .
docker run --rm -p 8080:8080 agoramesh
```

Open `http://localhost:8080`.

## Tor Onion Service

Build the static site or run the Docker image behind Nginx. Configure Tor with an onion service pointing to the local Nginx port:

```text
HiddenServiceDir /var/lib/tor/agoramesh/
HiddenServicePort 80 127.0.0.1:8080
```

Tor is optional. Do not rely on Tor alone for operational security.
