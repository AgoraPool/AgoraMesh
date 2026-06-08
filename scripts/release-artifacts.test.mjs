import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildReleaseManifest,
  checksumLines,
  lockfileHash,
  sha256File,
  verifyChecksumLines,
  walkFiles
} from './release-artifacts.mjs';

const tempDirs = [];

async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'agoramesh-release-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('release artifact helpers', () => {
  it('builds a manifest with package version and lockfile hash', async () => {
    const dir = await tempDir();
    const lockfile = join(dir, 'package-lock.json');
    await writeFile(lockfile, '{"lockfileVersion":3}\n');

    const manifest = buildReleaseManifest({
      packageJson: { name: 'agoramesh', version: '0.16.0' },
      lockfileSha256: await lockfileHash(lockfile),
      generatedAt: '2026-06-01T00:00:00.000Z',
      nodeVersion: 'v22.0.0',
      npmVersion: '10.0.0',
      artifacts: ['agoramesh-v0.16.0-dist.tar.gz', 'dist/', 'SHA256SUMS']
    });

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      app: 'agoramesh',
      version: '0.16.0',
      lockfile: { path: 'package-lock.json', sha256: await sha256File(lockfile) }
    });
  });

  it('generates deterministic sorted checksum lines for a fixture directory', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'b.txt'), 'bravo\n');
    await writeFile(join(dir, 'a.txt'), 'alpha\n');
    const files = await walkFiles(dir);
    const first = await checksumLines(dir, files);
    const second = await checksumLines(dir, files);

    expect(first).toEqual(second);
    expect(first.map((line) => line.split('  ')[1])).toEqual(['a.txt', 'b.txt']);
  });

  it('fails checksum verification for missing or modified files', async () => {
    const dir = await tempDir();
    const file = join(dir, 'artifact.txt');
    await writeFile(file, 'original\n');
    const valid = await checksumLines(dir, [file]);
    await writeFile(file, 'modified\n');

    await expect(verifyChecksumLines(dir, valid)).resolves.toEqual(['artifact.txt: checksum mismatch']);
    await rm(file);
    await expect(verifyChecksumLines(dir, valid)).resolves.toEqual(['artifact.txt: missing']);
  });

  it('rejects unsafe checksum paths', async () => {
    const dir = await tempDir();
    const hash = 'a'.repeat(64);

    await expect(verifyChecksumLines(dir, [`${hash}  ../outside.txt`])).resolves.toEqual(['../outside.txt: unsafe path']);
    await expect(readFile(join(dir, 'missing')).catch(() => 'missing')).resolves.toBe('missing');
  });
});
