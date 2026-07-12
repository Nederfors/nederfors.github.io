import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const MIME_TYPES = Object.freeze({
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8'
});

const COMPRESSIBLE_TYPES = [
  'application/javascript',
  'application/json',
  'application/manifest+json',
  'application/xml',
  'image/svg+xml',
  'text/'
];

const MIN_GZIP_BYTES = 256;
const SERVER_ID_PATH = '/.well-known/symbapedia-perf-server';

function contentType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function isCompressible(type) {
  return COMPRESSIBLE_TYPES.some(prefix => type.startsWith(prefix));
}

function cacheControl(urlPath) {
  if (urlPath === '/index.html' || urlPath === '/webapp.html' || urlPath === '/sw.js') {
    return 'no-store';
  }
  if (/^\/assets\/.*-[A-Za-z0-9_-]{8,}\.[^/]+$/.test(urlPath)) {
    return 'public, max-age=31536000, immutable';
  }
  return 'public, max-age=0, must-revalidate';
}

async function walkFiles(rootDir, currentDir = rootDir, entries = []) {
  const children = await readdir(currentDir, { withFileTypes: true });
  for (const child of children) {
    const absolutePath = path.join(currentDir, child.name);
    if (child.isDirectory()) {
      await walkFiles(rootDir, absolutePath, entries);
    } else if (child.isFile()) {
      entries.push(absolutePath);
    }
  }
  return entries;
}

export async function computeDistBuildId(rootDir) {
  const hash = createHash('sha256');
  let filesFound = 0;
  for (const relativePath of ['index.html', 'webapp.html', 'data/offline-manifest.json']) {
    try {
      const value = await readFile(path.join(rootDir, relativePath));
      hash.update(relativePath);
      hash.update('\0');
      hash.update(value);
      hash.update('\0');
      filesFound += 1;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  if (!filesFound) {
    throw new Error(`No built entry files found under ${rootDir}`);
  }
  return hash.digest('hex').slice(0, 16);
}

async function indexDist(rootDir) {
  const absoluteRoot = path.resolve(rootDir);
  const files = new Map();
  for (const absolutePath of await walkFiles(absoluteRoot)) {
    const fileStat = await stat(absolutePath);
    const relativePath = path.relative(absoluteRoot, absolutePath).split(path.sep).join('/');
    const urlPath = `/${relativePath}`;
    const type = contentType(absolutePath);
    const baseEtag = `\"${fileStat.size.toString(16)}-${Math.trunc(fileStat.mtimeMs).toString(16)}\"`;
    let gzipBody = null;
    if (fileStat.size >= MIN_GZIP_BYTES && isCompressible(type)) {
      const rawBody = await readFile(absolutePath);
      const compressed = gzipSync(rawBody, { level: 6 });
      if (compressed.length < rawBody.length) gzipBody = compressed;
    }
    files.set(urlPath, {
      absolutePath,
      baseEtag,
      gzipBody,
      size: fileStat.size,
      type,
      urlPath
    });
  }
  return files;
}

function parseByteRange(headerValue, size) {
  if (!headerValue || !headerValue.startsWith('bytes=')) return null;
  const value = headerValue.slice('bytes='.length).trim();
  if (!value || value.includes(',')) return { ignored: true };
  const match = /^(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return { unsatisfiable: true };

  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return { unsatisfiable: true };
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end) {
      return { unsatisfiable: true };
    }
    end = Math.min(end, size - 1);
  }

  if (size <= 0 || start >= size) return { unsatisfiable: true };
  return { start, end };
}

function acceptsGzip(request) {
  const encodings = new Map();
  String(request.headers['accept-encoding'] || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
    .forEach(value => {
      const [rawName, ...parameters] = value.split(';').map(part => part.trim());
      const name = rawName.toLowerCase();
      let quality = 1;
      const qualityParameter = parameters.find(parameter => /^q\s*=/i.test(parameter));
      if (qualityParameter) {
        const parsed = Number(qualityParameter.split('=')[1]);
        quality = Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0;
      }
      encodings.set(name, quality);
    });
  if (encodings.has('gzip')) return encodings.get('gzip') > 0;
  return (encodings.get('*') || 0) > 0;
}

function sendJson(response, statusCode, value, extraHeaders = {}) {
  const body = Buffer.from(`${JSON.stringify(value)}\n`);
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Length': body.length,
    'Content-Type': 'application/json; charset=utf-8',
    ...extraHeaders
  });
  response.end(body);
}

function requestPath(request) {
  const parsed = new URL(request.url || '/', 'http://localhost');
  return { parsed, pathname: decodeURIComponent(parsed.pathname) };
}

export async function createDistServer({
  rootDir,
  host = '127.0.0.1',
  port = 0,
  token,
  buildId = null
}) {
  if (!rootDir) throw new Error('createDistServer requires rootDir');
  if (!token) throw new Error('createDistServer requires a verification token');

  const resolvedRoot = path.resolve(rootDir);
  const resolvedBuildId = buildId || await computeDistBuildId(resolvedRoot);
  const files = await indexDist(resolvedRoot);

  const server = http.createServer((request, response) => {
    void (async () => {
      let parsedRequest;
      try {
        parsedRequest = requestPath(request);
      } catch {
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Bad request\n');
        return;
      }
      const { parsed, pathname } = parsedRequest;

      if (pathname === SERVER_ID_PATH) {
        if (parsed.searchParams.get('token') !== token) {
          sendJson(response, 403, { error: 'verification token mismatch' });
          return;
        }
        sendJson(response, 200, {
          buildId: resolvedBuildId,
          pid: process.pid,
          token
        });
        return;
      }

      if (!['GET', 'HEAD'].includes(request.method || '')) {
        response.writeHead(405, {
          Allow: 'GET, HEAD',
          'Content-Type': 'text/plain; charset=utf-8'
        });
        response.end('Method not allowed\n');
        return;
      }

      let urlPath = pathname;
      if (urlPath === '/') urlPath = '/index.html';
      else if (urlPath.endsWith('/')) urlPath += 'index.html';
      const entry = files.get(urlPath);
      if (!entry) {
        response.writeHead(404, {
          'Cache-Control': 'no-store',
          'Content-Type': 'text/plain; charset=utf-8'
        });
        response.end(request.method === 'HEAD' ? undefined : 'Not found\n');
        return;
      }

      let range = parseByteRange(request.headers.range, entry.size);
      if (range && !range.ignored && request.headers['if-range'] && request.headers['if-range'] !== entry.baseEtag) {
        range = null;
      }
      if (range?.unsatisfiable) {
        response.writeHead(416, {
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes */${entry.size}`,
          'Content-Type': entry.type
        });
        response.end();
        return;
      }

      const useRange = Boolean(range && !range.ignored);
      const useGzip = !useRange && Boolean(entry.gzipBody) && acceptsGzip(request);
      const etag = useGzip ? entry.baseEtag.replace(/\"$/, '-gzip\"') : entry.baseEtag;
      if (!useRange && request.headers['if-none-match'] === etag) {
        response.writeHead(304, {
          'Cache-Control': cacheControl(entry.urlPath),
          ETag: etag,
          Vary: 'Accept-Encoding',
          'X-Symbapedia-Build': resolvedBuildId
        });
        response.end();
        return;
      }

      const headers = {
        'Accept-Ranges': 'bytes',
        'Cache-Control': cacheControl(entry.urlPath),
        'Content-Type': entry.type,
        ETag: etag,
        Vary: 'Accept-Encoding',
        'X-Content-Type-Options': 'nosniff',
        'X-Symbapedia-Build': resolvedBuildId
      };

      if (useRange) {
        const length = range.end - range.start + 1;
        response.writeHead(206, {
          ...headers,
          'Content-Length': length,
          'Content-Range': `bytes ${range.start}-${range.end}/${entry.size}`
        });
        if (request.method === 'HEAD') {
          response.end();
          return;
        }
        const stream = createReadStream(entry.absolutePath, { start: range.start, end: range.end });
        stream.on('error', () => response.destroy());
        stream.pipe(response);
        return;
      }

      if (useGzip) {
        response.writeHead(200, {
          ...headers,
          'Content-Encoding': 'gzip',
          'Content-Length': entry.gzipBody.length
        });
        response.end(request.method === 'HEAD' ? undefined : entry.gzipBody);
        return;
      }

      response.writeHead(200, { ...headers, 'Content-Length': entry.size });
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      const stream = createReadStream(entry.absolutePath);
      stream.on('error', () => response.destroy());
      stream.pipe(response);
    })().catch(error => {
      if (response.headersSent) {
        response.destroy(error);
        return;
      }
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Internal server error\n');
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    await new Promise(resolve => server.close(resolve));
    throw new Error('Static server did not expose a TCP address');
  }

  return {
    buildId: resolvedBuildId,
    close: () => new Promise((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    }),
    files: files.size,
    host,
    port: address.port,
    server,
    token
  };
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || value == null) throw new Error(`Invalid argument: ${flag || ''}`);
    options[flag.slice(2)] = value;
  }
  return options;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const args = parseArguments(process.argv.slice(2));
  const instance = await createDistServer({
    buildId: args['build-id'] || null,
    host: args.host || '127.0.0.1',
    port: Number(args.port || 0),
    rootDir: args.root,
    token: args.token
  });
  console.log(JSON.stringify({
    buildId: instance.buildId,
    event: 'ready',
    files: instance.files,
    host: instance.host,
    pid: process.pid,
    port: instance.port,
    token: instance.token
  }));

  const shutdown = async () => {
    try { await instance.close(); } finally { process.exit(0); }
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
