import path from 'node:path';
import { pathToFileURL } from 'node:url';
import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import {
  APP_ROOT,
  PREVIEW_HOST,
  PREVIEW_PORT,
  createRunDir,
  startPreviewServer,
  stopPreviewServer,
  writeJson
} from './perf-common.mjs';

const PAGE_TARGETS = [
  { id: 'index', path: '/#/index' },
  { id: 'character', path: '/#/character' },
  { id: 'inventory', path: '/#/inventory' },
  { id: 'traits', path: '/#/traits' },
  { id: 'notes', path: '/#/notes' }
];

function summarizeLhr(lhr, url) {
  const auditValue = (id) => lhr.audits?.[id]?.numericValue ?? null;
  return {
    url,
    performanceScore: Number(((lhr.categories?.performance?.score || 0) * 100).toFixed(1)),
    metrics: {
      firstContentfulPaintMs: auditValue('first-contentful-paint'),
      largestContentfulPaintMs: auditValue('largest-contentful-paint'),
      totalBlockingTimeMs: auditValue('total-blocking-time'),
      speedIndexMs: auditValue('speed-index'),
      cumulativeLayoutShift: auditValue('cumulative-layout-shift')
    }
  };
}

export async function runLighthouse({ runDir = null } = {}) {
  const resolvedRunDir = runDir || await createRunDir('lighthouse');
  const reportDir = path.join(resolvedRunDir, 'lighthouse');
  const server = await startPreviewServer({ port: PREVIEW_PORT });
  const chrome = await launch({
    chromeFlags: ['--headless=new', '--no-sandbox']
  });

  try {
    const pages = [];
    for (const target of PAGE_TARGETS) {
      const url = `http://${PREVIEW_HOST}:${PREVIEW_PORT}${target.path}`;
      const runnerResult = await lighthouse(
        url,
        {
          port: chrome.port,
          logLevel: 'error',
          output: 'json',
          onlyCategories: ['performance'],
          disableStorageReset: true
        }
      );
      const lhr = runnerResult?.lhr || null;
      if (!lhr) {
        throw new Error(`No Lighthouse result returned for ${url}`);
      }
      await writeJson(path.join(reportDir, `${target.id}.json`), lhr);
      pages.push(summarizeLhr(lhr, url));
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      reportDir,
      pages
    };
    await writeJson(path.join(reportDir, 'summary.json'), summary);
    return summary;
  } finally {
    await chrome.kill();
    await stopPreviewServer(server);
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const summary = await runLighthouse();
  console.log(JSON.stringify(summary, null, 2));
}
