import { expect } from '@playwright/test';
import { access } from 'node:fs/promises';
import sharp from 'sharp';

const PORTABLE_VISUAL_SIZE = 64;
const PORTABLE_VISUAL_MAX_MAE = 0.018;
const PORTABLE_VISUAL_MAX_RMS = 0.06;

async function expectPopupViewportFit(locator) {
  const geometry = await locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      horizontalOverflow: Math.max(0, element.scrollWidth - element.clientWidth)
    };
  });

  expect(geometry.width, `Popup has no rendered width: ${JSON.stringify(geometry)}`).toBeGreaterThan(0);
  expect(geometry.height, `Popup has no rendered height: ${JSON.stringify(geometry)}`).toBeGreaterThan(0);
  expect(geometry.left, `Popup extends past the viewport left edge: ${JSON.stringify(geometry)}`).toBeGreaterThanOrEqual(-1);
  expect(geometry.top, `Popup extends past the viewport top edge: ${JSON.stringify(geometry)}`).toBeGreaterThanOrEqual(-1);
  expect(geometry.right, `Popup extends past the viewport right edge: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.bottom, `Popup extends past the viewport bottom edge: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  expect(geometry.horizontalOverflow, `Popup has clipped horizontal content: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(2);
}

async function captureStableScreenshot(locator) {
  let previous = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await locator.screenshot({
      animations: 'disabled',
      caret: 'hide',
      scale: 'css'
    });
    if (previous?.equals(current)) return current;
    previous = current;
    await locator.page().waitForTimeout(100);
  }

  throw new Error('Popup screenshot did not settle after four captures.');
}

async function normalizedVisualPixels(image) {
  return sharp(image)
    .flatten({ background: '#000000' })
    .resize(PORTABLE_VISUAL_SIZE, PORTABLE_VISUAL_SIZE, {
      fit: 'fill',
      kernel: 'lanczos3'
    })
    .blur(1)
    .removeAlpha()
    .raw()
    .toBuffer();
}

function visualDifference(actual, expected) {
  let absoluteDifference = 0;
  let squaredDifference = 0;

  for (let index = 0; index < actual.length; index += 1) {
    const difference = Math.abs(actual[index] - expected[index]);
    absoluteDifference += difference;
    squaredDifference += difference * difference;
  }

  return {
    mae: absoluteDifference / actual.length / 255,
    rms: Math.sqrt(squaredDifference / actual.length) / 255
  };
}

export async function expectPortablePopupScreenshot(locator, name, testInfo) {
  await expectPopupViewportFit(locator);

  const useExactDarwinReference = process.platform === 'darwin'
    && process.env.PLAYWRIGHT_FORCE_PORTABLE_VISUAL !== '1';
  if (useExactDarwinReference) {
    await expect(locator).toHaveScreenshot(name);
    return;
  }

  const referencePath = testInfo.snapshotPath(name, { kind: 'screenshot' });
  await access(referencePath).catch(() => {
    throw new Error(`Reviewed popup reference is missing: ${referencePath}`);
  });

  const actualImage = await captureStableScreenshot(locator);
  const [actualMetadata, expectedMetadata, actualPixels, expectedPixels] = await Promise.all([
    sharp(actualImage).metadata(),
    sharp(referencePath).metadata(),
    normalizedVisualPixels(actualImage),
    normalizedVisualPixels(referencePath)
  ]);

  const actualWidth = actualMetadata.width || 0;
  const actualHeight = actualMetadata.height || 0;
  const expectedWidth = expectedMetadata.width || 0;
  const expectedHeight = expectedMetadata.height || 0;
  const maxWidthDelta = Math.max(2, Math.round(expectedWidth * 0.01));
  const maxHeightDelta = Math.max(12, Math.round(expectedHeight * 0.04));
  const difference = visualDifference(actualPixels, expectedPixels);
  const metrics = {
    actual: { width: actualWidth, height: actualHeight },
    expected: { width: expectedWidth, height: expectedHeight },
    allowedDimensionDelta: { width: maxWidthDelta, height: maxHeightDelta },
    perceptualDifference: difference,
    allowedPerceptualDifference: {
      mae: PORTABLE_VISUAL_MAX_MAE,
      rms: PORTABLE_VISUAL_MAX_RMS
    }
  };

  await testInfo.attach(`${name}-actual`, {
    body: actualImage,
    contentType: 'image/png'
  });
  await testInfo.attach(`${name}-reference`, {
    path: referencePath,
    contentType: 'image/png'
  });
  await testInfo.attach(`${name}-portable-metrics`, {
    body: Buffer.from(JSON.stringify(metrics, null, 2)),
    contentType: 'application/json'
  });

  expect(
    Math.abs(actualWidth - expectedWidth),
    `${name} width diverged from the reviewed reference: ${JSON.stringify(metrics)}`
  ).toBeLessThanOrEqual(maxWidthDelta);
  expect(
    Math.abs(actualHeight - expectedHeight),
    `${name} height diverged from the reviewed reference: ${JSON.stringify(metrics)}`
  ).toBeLessThanOrEqual(maxHeightDelta);
  expect(
    difference.mae,
    `${name} mean visual difference exceeded the cross-platform limit: ${JSON.stringify(metrics)}`
  ).toBeLessThanOrEqual(PORTABLE_VISUAL_MAX_MAE);
  expect(
    difference.rms,
    `${name} visual RMS difference exceeded the cross-platform limit: ${JSON.stringify(metrics)}`
  ).toBeLessThanOrEqual(PORTABLE_VISUAL_MAX_RMS);
}
