import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import { launch as launchChrome } from 'chrome-launcher';
import {
  createRunDir,
  startPreviewServer,
  stopPreviewServer,
  writeJson
} from './perf-common.mjs';

export const PAGE_TARGETS = Object.freeze([
  { id: 'index', path: '/#/index', role: 'index', sentinel: '#lista[data-entry-page="index"]' },
  { id: 'character', path: '/#/character', role: 'character', sentinel: '#valda[data-entry-page="character"]' },
  { id: 'inventory', path: '/#/inventory', role: 'inventory', sentinel: '#invList[data-entry-page="inventory"]' },
  { id: 'traits', path: '/#/traits', role: 'traits', sentinel: '#traitsTabPanel[role="tabpanel"]' },
  { id: 'notes', path: '/#/notes', role: 'notes', sentinel: '#characterForm' }
]);

export const APP_READY_BUDGET_MS = 8_000;

export const MOBILE_COLD_START_PROFILE = Object.freeze({
  cpuSlowdownMultiplier: 4,
  deviceScaleFactor: 2,
  downloadKbps: 1_600,
  latencyMs: 150,
  uploadKbps: 750,
  viewport: Object.freeze({ width: 390, height: 844 })
});

export const LIGHTHOUSE_BUDGETS = Object.freeze({
  performanceScoreMinimum: 85,
  firstContentfulPaintMsMaximum: 1_800,
  largestContentfulPaintMsMaximum: 2_500,
  totalBlockingTimeMsMaximum: 300,
  cumulativeLayoutShiftMaximum: 0.1
});

const MOBILE_USER_AGENT = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function collectRuntimeErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', request => {
    errors.push(`requestfailed: ${request.method()} ${request.url()} (${request.failure()?.errorText || 'unknown error'})`);
  });
  page.on('response', response => {
    if (response.status() >= 400) {
      errors.push(`http: ${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  return errors;
}

function readinessState(target) {
  const renderedState = element => {
    if (!element?.isConnected) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none'
      && !['hidden', 'collapse'].includes(style.visibility)
      && Number.parseFloat(style.opacity || '1') > 0
      && element.getClientRects().length > 0
      && rect.width > 0
      && rect.height > 0;
  };
  const fallback = document.querySelector('#boot-fallback');
  const fallbackStyle = fallback ? window.getComputedStyle(fallback) : null;
  const fallbackHidden = Boolean(fallback
    && (fallback.hidden
      || fallbackStyle?.display === 'none'
      || fallbackStyle?.visibility === 'hidden'));
  const fallbackError = Boolean(fallback
    && (fallback.classList.contains('is-error')
      || ['alert', 'alertdialog'].includes(fallback.getAttribute('role') || '')));
  const body = document.body;
  const viewRoot = document.getElementById('view-root');
  const sentinel = document.querySelector(target.sentinel);
  const state = {
    ariaBusy: viewRoot?.getAttribute('aria-busy') ?? null,
    bodyRole: body?.dataset?.role || null,
    bodyVisible: renderedState(body),
    bootCompleted: Boolean(window.__symbaroumBootCompleted),
    fallbackError,
    fallbackHidden,
    preloadActive: document.documentElement.hasAttribute('data-preload'),
    sentinelConnected: Boolean(sentinel?.isConnected),
    sentinelRendered: renderedState(sentinel),
    viewRootRendered: renderedState(viewRoot),
    sentinelSelector: target.sentinel
  };
  return {
    ...state,
    ready: state.bootCompleted
      && state.bodyRole === target.role
      && state.ariaBusy === 'false'
      && state.bodyVisible
      && state.fallbackHidden
      && !state.fallbackError
      && !state.preloadActive
      && state.sentinelConnected
      && state.sentinelRendered
      && state.viewRootRendered
  };
}

async function safeReadinessState(page, target) {
  try {
    return await page.evaluate(readinessState, target);
  } catch {
    return {
      ariaBusy: null,
      bodyRole: null,
      bodyVisible: false,
      bootCompleted: false,
      fallbackError: false,
      fallbackHidden: false,
      preloadActive: true,
      ready: false,
      sentinelConnected: false,
      sentinelRendered: false,
      viewRootRendered: false,
      sentinelSelector: target.sentinel
    };
  }
}

async function runUnthrottledPreflight(browser, target, url) {
  const startedAt = Date.now();
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const runtimeErrors = collectRuntimeErrors(page);
  let responseStatus = null;
  let state = null;
  let failure = null;

  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    responseStatus = response?.status() ?? null;
    if (!response?.ok()) {
      throw new Error(`HTTP ${responseStatus ?? 'unknown'}`);
    }
    await page.waitForFunction(readinessState, target, { timeout: 20_000, polling: 50 });
    await page.waitForTimeout(250);
    state = await safeReadinessState(page, target);
    if (!state.ready) throw new Error(`invalid ready state: ${JSON.stringify(state)}`);
    if (runtimeErrors.length) throw new Error(runtimeErrors.join(' | '));
  } catch (error) {
    state ||= await safeReadinessState(page, target);
    failure = errorMessage(error);
  } finally {
    await context.close();
  }

  return {
    durationMs: Date.now() - startedAt,
    failure,
    id: target.id,
    passed: !failure,
    responseStatus,
    runtimeErrors,
    state,
    url
  };
}

async function applyMobileThrottling(context, page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.setBypassServiceWorker', { bypass: true });
  await cdp.send('Network.emulateNetworkConditions', {
    connectionType: 'cellular3g',
    downloadThroughput: (MOBILE_COLD_START_PROFILE.downloadKbps * 1024) / 8,
    latency: MOBILE_COLD_START_PROFILE.latencyMs,
    offline: false,
    uploadThroughput: (MOBILE_COLD_START_PROFILE.uploadKbps * 1024) / 8
  });
  await cdp.send('Emulation.setCPUThrottlingRate', {
    rate: MOBILE_COLD_START_PROFILE.cpuSlowdownMultiplier
  });
  return cdp;
}

async function runThrottledColdStart(browser, target, url) {
  const context = await browser.newContext({
    deviceScaleFactor: MOBILE_COLD_START_PROFILE.deviceScaleFactor,
    hasTouch: true,
    isMobile: true,
    serviceWorkers: 'block',
    userAgent: MOBILE_USER_AGENT,
    viewport: MOBILE_COLD_START_PROFILE.viewport
  });
  const page = await context.newPage();
  const runtimeErrors = collectRuntimeErrors(page);
  let cdp = null;
  let responseStatus = null;
  let state = null;
  let failure = null;
  let navigationStartedAt = null;
  let readyMs = null;

  try {
    cdp = await applyMobileThrottling(context, page);
    navigationStartedAt = Date.now();
    const response = await page.goto(url, { waitUntil: 'commit', timeout: APP_READY_BUDGET_MS });
    responseStatus = response?.status() ?? null;
    if (!response?.ok()) {
      throw new Error(`HTTP ${responseStatus ?? 'unknown'}`);
    }
    const remainingMs = APP_READY_BUDGET_MS - (Date.now() - navigationStartedAt);
    if (remainingMs <= 0) throw new Error(`app-ready budget exceeded before readiness polling`);
    await page.waitForFunction(readinessState, target, {
      polling: 50,
      timeout: remainingMs
    });
    state = await safeReadinessState(page, target);
    if (!state.ready) throw new Error(`invalid ready state: ${JSON.stringify(state)}`);
    readyMs = Date.now() - navigationStartedAt;
    await page.waitForTimeout(250);
    if (runtimeErrors.length) throw new Error(runtimeErrors.join(' | '));
  } catch (error) {
    state ||= await safeReadinessState(page, target);
    if (readyMs === null && navigationStartedAt !== null) {
      readyMs = Date.now() - navigationStartedAt;
    }
    failure = errorMessage(error);
  } finally {
    try { await cdp?.send('Emulation.setCPUThrottlingRate', { rate: 1 }); } catch {}
    await context.close();
  }

  if (!failure && readyMs !== null && readyMs > APP_READY_BUDGET_MS) {
    failure = `app-ready ${readyMs}ms exceeded ${APP_READY_BUDGET_MS}ms budget`;
  }
  return {
    budgetMs: APP_READY_BUDGET_MS,
    failure,
    freshContext: true,
    id: target.id,
    passed: !failure,
    readyMs,
    responseStatus,
    runtimeErrors,
    serviceWorkers: 'blocked',
    state,
    throttling: MOBILE_COLD_START_PROFILE,
    url
  };
}

function budgetResult(page) {
  const failures = [];
  const { metrics } = page;
  if (page.performanceScore < LIGHTHOUSE_BUDGETS.performanceScoreMinimum) {
    failures.push(`score ${page.performanceScore} < ${LIGHTHOUSE_BUDGETS.performanceScoreMinimum}`);
  }
  if (metrics.firstContentfulPaintMs > LIGHTHOUSE_BUDGETS.firstContentfulPaintMsMaximum) {
    failures.push(`FCP ${metrics.firstContentfulPaintMs.toFixed(1)}ms > ${LIGHTHOUSE_BUDGETS.firstContentfulPaintMsMaximum}ms`);
  }
  if (metrics.largestContentfulPaintMs > LIGHTHOUSE_BUDGETS.largestContentfulPaintMsMaximum) {
    failures.push(`LCP ${metrics.largestContentfulPaintMs.toFixed(1)}ms > ${LIGHTHOUSE_BUDGETS.largestContentfulPaintMsMaximum}ms`);
  }
  if (metrics.totalBlockingTimeMs > LIGHTHOUSE_BUDGETS.totalBlockingTimeMsMaximum) {
    failures.push(`TBT ${metrics.totalBlockingTimeMs.toFixed(1)}ms > ${LIGHTHOUSE_BUDGETS.totalBlockingTimeMsMaximum}ms`);
  }
  if (metrics.cumulativeLayoutShift > LIGHTHOUSE_BUDGETS.cumulativeLayoutShiftMaximum) {
    failures.push(`CLS ${metrics.cumulativeLayoutShift.toFixed(3)} > ${LIGHTHOUSE_BUDGETS.cumulativeLayoutShiftMaximum}`);
  }
  return { passed: failures.length === 0, failures };
}

function getLcpNode(lhr) {
  const items = lhr.audits?.['largest-contentful-paint-element']?.details?.items;
  if (!Array.isArray(items)) return null;
  const queue = [...items];
  while (queue.length) {
    const item = queue.shift();
    if (item?.node && typeof item.node === 'object') return item.node;
    if (item?.type === 'node') return item;
    if (Array.isArray(item?.items)) queue.push(...item.items);
  }
  return null;
}

export function lcpNodeInsideBootFallback(lhr) {
  const node = getLcpNode(lhr);
  if (!node) return false;
  const identity = [node.selector, node.snippet, node.nodeLabel]
    .filter(value => typeof value === 'string')
    .join(' ');
  return /#(?:boot-fallback|boot-title|boot-message|boot-retry)\b|id=["'](?:boot-fallback|boot-title|boot-message|boot-retry)["']|\bboot-fallback(?:__|\b)/i.test(identity);
}

export function summarizeLhr(lhr, url) {
  const auditValue = id => lhr.audits?.[id]?.numericValue ?? null;
  if (lhr.runtimeError) {
    const code = lhr.runtimeError.code || 'runtime-error';
    const message = lhr.runtimeError.message || 'Lighthouse runtime error';
    throw new Error(`${code} for ${url}: ${message}`);
  }
  if (lcpNodeInsideBootFallback(lhr)) {
    const selector = getLcpNode(lhr)?.selector || 'unknown boot-fallback descendant';
    throw new Error(`Lighthouse LCP is inside #boot-fallback for ${url}: ${selector}`);
  }
  if (!getLcpNode(lhr)) {
    throw new Error(`Lighthouse did not report an inspectable LCP element for ${url}`);
  }
  const rawScore = lhr.categories?.performance?.score;
  const metrics = {
    firstContentfulPaintMs: auditValue('first-contentful-paint'),
    largestContentfulPaintMs: auditValue('largest-contentful-paint'),
    totalBlockingTimeMs: auditValue('total-blocking-time'),
    speedIndexMs: auditValue('speed-index'),
    cumulativeLayoutShift: auditValue('cumulative-layout-shift')
  };
  const missing = Object.entries({ performanceScore: rawScore, ...metrics })
    .filter(([, value]) => !Number.isFinite(value))
    .map(([name]) => name);
  if (missing.length) {
    throw new Error(`Lighthouse returned null/non-numeric metrics for ${url}: ${missing.join(', ')}`);
  }
  const lcpNode = getLcpNode(lhr);
  const page = {
    lcpElement: lcpNode ? {
      nodeLabel: lcpNode.nodeLabel || null,
      selector: lcpNode.selector || null,
      snippet: lcpNode.snippet || null
    } : null,
    metrics,
    performanceScore: Number((rawScore * 100).toFixed(1)),
    url
  };
  return { ...page, budget: budgetResult(page) };
}

function lighthouseOptions(port) {
  return {
    port,
    logLevel: 'error',
    output: 'json',
    onlyCategories: ['performance'],
    disableStorageReset: false,
    formFactor: 'mobile',
    maxWaitForFcp: 30_000,
    maxWaitForLoad: 45_000,
    pauseAfterFcpMs: 2_000,
    screenEmulation: {
      deviceScaleFactor: MOBILE_COLD_START_PROFILE.deviceScaleFactor,
      disabled: false,
      height: MOBILE_COLD_START_PROFILE.viewport.height,
      mobile: true,
      width: MOBILE_COLD_START_PROFILE.viewport.width
    },
    throttling: {
      cpuSlowdownMultiplier: MOBILE_COLD_START_PROFILE.cpuSlowdownMultiplier,
      downloadThroughputKbps: 1_474.56,
      requestLatencyMs: 562.5,
      rttMs: MOBILE_COLD_START_PROFILE.latencyMs,
      throughputKbps: 1_638.4,
      uploadThroughputKbps: 675
    },
    throttlingMethod: 'simulate'
  };
}

function collectGateFailures(summary) {
  const failures = [];
  for (const check of summary.bootChecks) {
    if (!check.passed) failures.push(`unthrottled ${check.id}: ${check.failure}`);
  }
  for (const check of summary.readiness.checks) {
    if (!check.passed) failures.push(`mobile cold-start ${check.id}: ${check.failure}`);
  }
  for (const check of summary.lighthouseChecks) {
    if (!check.passed) failures.push(`Lighthouse ${check.id}: ${check.failure}`);
  }
  for (const page of summary.pages) {
    if (!page.budget.passed) failures.push(`${page.url}: ${page.budget.failures.join(', ')}`);
  }
  return failures;
}

export async function runLighthouse({ runDir = null } = {}) {
  const resolvedRunDir = runDir || await createRunDir('lighthouse');
  const reportDir = path.join(resolvedRunDir, 'lighthouse');
  let server = null;
  let bootBrowser = null;
  let chrome = null;
  const summary = {
    bootChecks: [],
    budgets: LIGHTHOUSE_BUDGETS,
    failures: [],
    generatedAt: new Date().toISOString(),
    lighthouseChecks: [],
    pages: [],
    passed: false,
    readiness: {
      budgetMs: APP_READY_BUDGET_MS,
      checks: [],
      passed: false,
      profile: MOBILE_COLD_START_PROFILE
    },
    reportDir,
    server: null
  };

  try {
    server = await startPreviewServer({ port: 0 });
    summary.server = {
      baseUrl: server.baseUrl,
      buildId: server.buildId,
      gzip: true,
      port: server.port,
      verified: true
    };
    bootBrowser = await chromium.launch({ headless: true });
    for (const target of PAGE_TARGETS) {
      const url = `${server.baseUrl}${target.path}`;
      summary.bootChecks.push(await runUnthrottledPreflight(bootBrowser, target, url));
    }
    for (const target of PAGE_TARGETS) {
      const url = `${server.baseUrl}${target.path}`;
      summary.readiness.checks.push(await runThrottledColdStart(bootBrowser, target, url));
    }
    summary.readiness.passed = summary.readiness.checks.every(check => check.passed);
    await bootBrowser.close();
    bootBrowser = null;

    const preflightFailed = summary.bootChecks.some(check => !check.passed)
      || !summary.readiness.passed;
    if (!preflightFailed) {
      chrome = await launchChrome({
        chromePath: process.env.CHROME_PATH || chromium.executablePath(),
        chromeFlags: ['--headless=new', '--no-sandbox']
      });
      for (const target of PAGE_TARGETS) {
        const url = `${server.baseUrl}${target.path}`;
        try {
          const runnerResult = await lighthouse(url, lighthouseOptions(chrome.port));
          const lhr = runnerResult?.lhr || null;
          if (!lhr) throw new Error(`No Lighthouse result returned for ${url}`);
          await writeJson(path.join(reportDir, `${target.id}.json`), lhr);
          const page = summarizeLhr(lhr, url);
          summary.pages.push(page);
          summary.lighthouseChecks.push({ id: target.id, passed: true, url });
        } catch (error) {
          summary.lighthouseChecks.push({
            failure: errorMessage(error),
            id: target.id,
            passed: false,
            url
          });
        }
      }
    }

    summary.failures = collectGateFailures(summary);
    summary.passed = summary.failures.length === 0
      && summary.pages.length === PAGE_TARGETS.length;
    await writeJson(path.join(reportDir, 'summary.json'), summary);
    if (!summary.passed) {
      throw new Error(`Performance release gate failed:\n${summary.failures.join('\n')}`);
    }
    return summary;
  } catch (error) {
    if (!summary.failures.length) {
      summary.failures = [`harness: ${errorMessage(error)}`];
    }
    summary.passed = false;
    await writeJson(path.join(reportDir, 'summary.json'), summary);
    throw error;
  } finally {
    try { await bootBrowser?.close(); } catch {}
    try { await chrome?.kill(); } catch {}
    await stopPreviewServer(server);
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const summary = await runLighthouse();
  console.log(JSON.stringify(summary, null, 2));
}
