import path from 'node:path';
import { chromium } from '@playwright/test';
import {
  createRunDir,
  writeJson,
  writeText
} from './perf-common.mjs';

const DEFAULT_BASE_URL = 'https://nederfors.github.io/';
const BASE_URL = process.env.PERF_BASE_URL || DEFAULT_BASE_URL;

function joinUrl(base, suffix) {
  return new URL(suffix, base.endsWith('/') ? base : `${base}/`).toString();
}

function summarizeResponses(responses) {
  const byType = {};
  let transferBytes = 0;
  responses.forEach(item => {
    byType[item.resourceType] = (byType[item.resourceType] || 0) + 1;
    transferBytes += item.transferBytes || 0;
  });
  return {
    count: responses.length,
    transferBytes,
    byType
  };
}

function renderMarkdown(summary) {
  const lines = [
    '# Online Perf',
    '',
    `Generated: ${summary.generatedAt}`,
    `Base URL: ${summary.baseUrl}`,
    `Run dir: ${summary.runDir}`,
    '',
    '## Network',
    `- Requests: ${summary.network.count}`,
    `- Header/body transfer estimate: ${summary.network.transferBytes} bytes`,
    `- By type: ${JSON.stringify(summary.network.byType)}`,
    '',
    '## Runtime',
    `- Long tasks: ${summary.longTasks.count}`,
    `- Long-task total: ${summary.longTasks.totalDurationMs.toFixed(1)} ms`,
    `- Service-worker caches: ${summary.serviceWorker.caches.length}`,
    `- Service-worker cached responses: ${summary.serviceWorker.entries}`,
    `- Service-worker cached bytes: ${summary.serviceWorker.bytes}`,
    '',
    '## App Perf',
    `- Recorded scenarios: ${summary.appPerf.scenarioCount}`,
    `- Recorded vitals: ${summary.appPerf.vitalCount}`
  ];
  return `${lines.join('\n')}\n`;
}

async function collectServiceWorkerCache(page) {
  return page.evaluate(async () => {
    if (!('caches' in window)) {
      return { caches: [], entries: 0, bytes: 0 };
    }
    const names = await caches.keys();
    let entries = 0;
    let bytes = 0;
    for (const name of names) {
      const cache = await caches.open(name);
      const requests = await cache.keys();
      entries += requests.length;
      for (const request of requests) {
        const response = await cache.match(request);
        if (!response) continue;
        const blob = await response.clone().blob().catch(() => null);
        bytes += blob?.size || 0;
      }
    }
    return { caches: names, entries, bytes };
  });
}

const runDir = await createRunDir('online');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  serviceWorkers: 'allow',
  viewport: { width: 1366, height: 768 }
});
const page = await context.newPage();
const responses = [];

page.on('response', response => {
  const request = response.request();
  const headers = response.headers();
  const contentLength = Number(headers['content-length'] || 0);
  responses.push({
    url: response.url(),
    status: response.status(),
    resourceType: request.resourceType(),
    transferBytes: Number.isFinite(contentLength) ? contentLength : 0
  });
});

await page.addInitScript(() => {
  window.__symbaroumLongTasks = [];
  try {
    const observer = new window.PerformanceObserver(list => {
      list.getEntries().forEach(entry => {
        window.__symbaroumLongTasks.push({
          name: entry.name,
          startTime: entry.startTime,
          duration: entry.duration
        });
      });
    });
    observer.observe({ type: 'longtask', buffered: true });
  } catch {}
});

const startedAt = Date.now();
await page.goto(joinUrl(BASE_URL, '#/index'), { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted), null, { timeout: 30000 });
await page.waitForTimeout(2500);
await page.evaluate(() => window.symbaroumPerf?.scheduleScenarioEnd?.('online-first-load'));
await page.waitForTimeout(500);

const longTasks = await page.evaluate(() => window.__symbaroumLongTasks || []);
const appPerf = await page.evaluate(() => window.symbaroumPerf?.getSnapshot?.() || null);
const serviceWorker = await collectServiceWorkerCache(page);

const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  runDir,
  durationMs: Date.now() - startedAt,
  network: summarizeResponses(responses),
  responses,
  longTasks: {
    count: longTasks.length,
    totalDurationMs: longTasks.reduce((sum, item) => sum + Number(item.duration || 0), 0),
    entries: longTasks
  },
  serviceWorker,
  appPerf: {
    scenarioCount: appPerf?.scenarios?.length || 0,
    vitalCount: appPerf?.vitals?.length || 0,
    snapshot: appPerf
  }
};

await browser.close();

await writeJson(path.join(runDir, 'summary.json'), summary);
await writeText(path.join(runDir, 'summary.md'), renderMarkdown(summary));

console.log(JSON.stringify(summary, null, 2));
