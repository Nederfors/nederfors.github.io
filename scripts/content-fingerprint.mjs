import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, readlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function compareNames(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function portablePath(value) {
  return value.split(path.sep).join('/');
}

async function updatePath(hash, absolutePath, relativePath) {
  const stats = await lstat(absolutePath);
  const key = portablePath(relativePath);

  if (stats.isDirectory()) {
    hash.update(`directory\0${key}\0`);
    const entries = await readdir(absolutePath);
    entries.sort(compareNames);
    for (const entry of entries) {
      await updatePath(hash, path.join(absolutePath, entry), path.join(relativePath, entry));
    }
    return;
  }

  if (stats.isSymbolicLink()) {
    hash.update(`symlink\0${key}\0${await readlink(absolutePath)}\0`);
    return;
  }

  if (!stats.isFile()) {
    throw new Error(`Unsupported fingerprint input: ${absolutePath}`);
  }

  hash.update(`file\0${key}\0${stats.size}\0`);
  hash.update(await readFile(absolutePath));
  hash.update('\0');
}

export async function fingerprintPaths(inputPaths, options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const normalizedPaths = [...new Set(inputPaths.map(inputPath => portablePath(inputPath)))]
    .sort(compareNames);
  if (!normalizedPaths.length) throw new Error('At least one path is required.');

  const hash = createHash('sha256');
  for (const inputPath of normalizedPaths) {
    await updatePath(hash, path.resolve(cwd, inputPath), inputPath);
  }
  return hash.digest('hex');
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  const inputPaths = process.argv.slice(2);
  console.log(await fingerprintPaths(inputPaths));
}
