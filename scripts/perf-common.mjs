import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeDistBuildId } from './serve-dist.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  const rootDir = path.join(APP_ROOT, 'dist');
  const expectedBuildId = await computeDistBuildId(rootDir);
  const token = randomBytes(24).toString('hex');
  const child = spawn(
    process.execPath,
    [
      path.join(__dirname, 'serve-dist.mjs'),
      '--root', rootDir,
      '--host', PREVIEW_HOST,
      '--port', String(port),
      '--token', token,
      '--build-id', expectedBuildId
    ],
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
    const ready = await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timed out waiting for verified preview server startup\n${output}`.trim()));
      }, 15_000);
      let stdoutBuffer = '';
      const finish = (callback, value) => {
        clearTimeout(timeoutId);
        child.stdout.off('data', inspect);
        child.off('exit', exited);
        callback(value);
      };
      const inspect = chunk => {
        stdoutBuffer += String(chunk || '');
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() || '';
        for (const line of lines) {
          try {
            const message = JSON.parse(line);
            if (message?.event === 'ready' && message.token === token) {
              finish(resolve, message);
              return;
            }
          } catch {}
        }
      };
      const exited = (code, signal) => {
        finish(reject, new Error(
          `Preview server exited before verified startup (code: ${code}, signal: ${signal})\n${output}`.trim()
        ));
      };
      child.stdout.on('data', inspect);
      child.once('exit', exited);
    });

    if (!Number.isInteger(ready.port) || ready.port <= 0 || ready.pid !== child.pid || ready.buildId !== expectedBuildId) {
      throw new Error(`Preview server announced an invalid identity: ${JSON.stringify(ready)}`);
    }

    const verificationUrl = new URL(`http://${PREVIEW_HOST}:${ready.port}/.well-known/symbapedia-perf-server`);
    verificationUrl.searchParams.set('token', token);
    const verificationController = new globalThis.AbortController();
    const verificationTimeoutId = setTimeout(() => verificationController.abort(), 5_000);
    let verificationResponse;
    try {
      verificationResponse = await fetch(verificationUrl, { signal: verificationController.signal });
    } catch (error) {
      if (verificationController.signal.aborted) {
        throw new Error('Preview identity request timed out');
      }
      throw error;
    } finally {
      clearTimeout(verificationTimeoutId);
    }
    if (!verificationResponse.ok) {
      throw new Error(`Preview identity request returned HTTP ${verificationResponse.status}`);
    }
    const identity = await verificationResponse.json();
    if (identity?.token !== token || identity?.pid !== child.pid || identity?.buildId !== expectedBuildId) {
      throw new Error(`Preview identity mismatch: ${JSON.stringify(identity)}`);
    }

    return {
      baseUrl: `http://${PREVIEW_HOST}:${ready.port}`,
      buildId: expectedBuildId,
      child,
      host: PREVIEW_HOST,
      port: ready.port,
      token,
      output: () => output
    };
  } catch (error) {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\n${output}`.trim());
  }
}

export async function stopPreviewServer(server) {
  if (!server?.child || server.child.exitCode !== null || server.child.signalCode !== null) return;
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
