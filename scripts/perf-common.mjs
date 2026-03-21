import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

export const APP_ROOT = path.resolve(__dirname, '..');
export const PERF_ROOT = path.join(APP_ROOT, '.artifacts', 'perf');
export const PREVIEW_HOST = '127.0.0.1';
export const PREVIEW_PORT = 4177;

export function makeRunLabel() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
  return dirPath;
}

export async function createRunDir(prefix = 'baseline') {
  const dirPath = path.join(PERF_ROOT, `${makeRunLabel()}-${prefix}`);
  await ensureDir(dirPath);
  return dirPath;
}

export async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function writeText(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, value, 'utf8');
}

export async function waitForPort(port, host = PREVIEW_HOST, timeoutMs = 15_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const isOpen = await new Promise((resolve) => {
      const socket = net.createConnection({ port, host });
      socket.once('connect', () => {
        socket.end();
        resolve(true);
      });
      socket.once('error', () => {
        resolve(false);
      });
    });
    if (isOpen) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${host}:${port}`);
}

export async function startPreviewServer({ port = PREVIEW_PORT } = {}) {
  const vitePackagePath = require.resolve('vite/package.json');
  const viteBin = path.join(path.dirname(vitePackagePath), 'bin', 'vite.js');
  const child = spawn(
    'node',
    [viteBin, 'preview', '--config', './vite.config.js', '--host', PREVIEW_HOST, '--port', String(port)],
    {
      cwd: APP_ROOT,
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  let output = '';
  const collect = (chunk) => {
    output += String(chunk || '');
  };

  child.stdout.on('data', collect);
  child.stderr.on('data', collect);

  try {
    await Promise.race([
      waitForPort(port, PREVIEW_HOST),
      new Promise((_, reject) => {
        child.once('exit', (code, signal) => {
          reject(new Error(`Preview server exited before startup (code: ${code}, signal: ${signal})\n${output}`.trim()));
        });
      })
    ]);
  } catch (error) {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\n${output}`.trim());
  }

  return {
    child,
    host: PREVIEW_HOST,
    port,
    output: () => output
  };
}

export async function stopPreviewServer(server) {
  if (!server?.child || server.child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      server.child.kill('SIGKILL');
      resolve();
    }, 5_000);
    server.child.once('exit', () => {
      clearTimeout(timeoutId);
      resolve();
    });
    server.child.kill('SIGTERM');
  });
}

export function latestSummaryPath() {
  return path.join(PERF_ROOT, 'latest-summary.json');
}

export function latestSummaryMarkdownPath() {
  return path.join(PERF_ROOT, 'latest-summary.md');
}
