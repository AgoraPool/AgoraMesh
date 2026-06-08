import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');
const defaultReleaseDir = join(repoRoot, 'release');
const defaultDistDir = join(repoRoot, 'dist');

export function posixRelative(root, file) {
  return relative(root, file).split(sep).join('/');
}

export async function sha256File(file) {
  const hash = createHash('sha256');
  await new Promise((resolvePromise, rejectPromise) => {
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', rejectPromise)
      .on('end', resolvePromise);
  });
  return hash.digest('hex');
}

export async function walkFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(root, entry.name);
      if (entry.isDirectory()) return walkFiles(fullPath);
      if (entry.isFile()) return [fullPath];
      return [];
    })
  );
  return files.flat().sort((left, right) => posixRelative(root, left).localeCompare(posixRelative(root, right)));
}

export async function checksumLines(root, files) {
  const lines = [];
  const sortedFiles = [...files].sort((left, right) => posixRelative(root, left).localeCompare(posixRelative(root, right)));
  for (const file of sortedFiles) {
    lines.push(`${await sha256File(file)}  ${posixRelative(root, file)}`);
  }
  return lines;
}

export function parseChecksumLine(line) {
  const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
  if (!match) throw new Error(`Invalid checksum line: ${line}`);
  return { hash: match[1], path: match[2] };
}

export async function verifyChecksumLines(root, lines) {
  const failures = [];
  for (const line of lines.filter((entry) => entry.trim())) {
    const parsed = parseChecksumLine(line);
    if (parsed.path.includes('..') || parsed.path.startsWith('/')) {
      failures.push(`${parsed.path}: unsafe path`);
      continue;
    }
    const file = join(root, parsed.path);
    if (!existsSync(file)) {
      failures.push(`${parsed.path}: missing`);
      continue;
    }
    const actual = await sha256File(file);
    if (actual !== parsed.hash) failures.push(`${parsed.path}: checksum mismatch`);
  }
  return failures;
}

export async function lockfileHash(lockfilePath = join(repoRoot, 'package-lock.json')) {
  return createHash('sha256').update(await readFile(lockfilePath)).digest('hex');
}

export function buildReleaseManifest({ packageJson, lockfileSha256, generatedAt, nodeVersion, npmVersion, artifacts }) {
  return {
    schemaVersion: 1,
    app: packageJson.name,
    version: packageJson.version,
    generatedAt,
    nodeVersion,
    npmVersion,
    lockfile: {
      path: 'package-lock.json',
      sha256: lockfileSha256
    },
    artifacts
  };
}

async function npmVersion() {
  try {
    const { stdout } = await execFileAsync('npm', ['--version']);
    return stdout.trim();
  } catch {
    return 'unknown';
  }
}

async function createTarball(sourceDir, outputFile) {
  await mkdir(dirname(outputFile), { recursive: true });
  await execFileAsync('tar', [
    '--sort=name',
    '--mtime=@0',
    '--owner=0',
    '--group=0',
    '--numeric-owner',
    '-czf',
    outputFile,
    '-C',
    dirname(sourceDir),
    basename(sourceDir)
  ]);
}

async function generateReleaseArtifacts() {
  const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
  const version = packageJson.version;
  const releaseDist = join(defaultReleaseDir, 'dist');
  const tarballName = `agoramesh-v${version}-dist.tar.gz`;
  const tarballPath = join(defaultReleaseDir, tarballName);
  const manifestPath = join(defaultReleaseDir, 'release-manifest.json');
  const checksumPath = join(defaultReleaseDir, 'SHA256SUMS');

  if (!existsSync(defaultDistDir)) {
    throw new Error('dist/ is missing. Run npm run build before generating release artifacts.');
  }
  if (!(await stat(defaultDistDir)).isDirectory()) {
    throw new Error('dist/ exists but is not a directory.');
  }

  await rm(defaultReleaseDir, { recursive: true, force: true });
  await mkdir(defaultReleaseDir, { recursive: true });
  await cp(defaultDistDir, releaseDist, { recursive: true });
  await createTarball(releaseDist, tarballPath);

  const manifest = buildReleaseManifest({
    packageJson,
    lockfileSha256: await lockfileHash(),
    generatedAt: process.env.SOURCE_DATE_EPOCH ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString() : new Date().toISOString(),
    nodeVersion: process.version,
    npmVersion: await npmVersion(),
    artifacts: [tarballName, 'dist/', 'SHA256SUMS']
  });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const files = [...(await walkFiles(releaseDist)), tarballPath, manifestPath];
  await writeFile(checksumPath, `${(await checksumLines(defaultReleaseDir, files)).join('\n')}\n`);
}

async function checkReleaseArtifacts() {
  const checksumPath = join(defaultReleaseDir, 'SHA256SUMS');
  if (!existsSync(checksumPath)) {
    throw new Error('release/SHA256SUMS is missing. Run npm run release:artifacts first.');
  }
  const lines = (await readFile(checksumPath, 'utf8')).split(/\r?\n/);
  const failures = await verifyChecksumLines(defaultReleaseDir, lines);
  if (failures.length > 0) {
    throw new Error(`Release artifact verification failed:\n${failures.join('\n')}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const command = process.argv[2];
  try {
    if (command === 'generate') {
      await generateReleaseArtifacts();
      console.log('Release artifacts generated in release/.');
    } else if (command === 'check') {
      await checkReleaseArtifacts();
      console.log('Release artifact checksums verified.');
    } else {
      throw new Error('Usage: node scripts/release-artifacts.mjs <generate|check>');
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
