import path from 'node:path';
import {
  createRunDir,
  latestSummaryMarkdownPath,
  latestSummaryPath,
  writeJson,
  writeText
} from './perf-common.mjs';
import { runLighthouse } from './run-lighthouse.mjs';
import { runScenarioMetrics } from './run-scenario-metrics.mjs';

function renderMarkdownSummary(summary) {
  const lines = [
    `# Perf Baseline`,
    ``,
    `Generated: ${summary.generatedAt}`,
    `Run dir: ${summary.runDir}`,
    ``,
    `## Lighthouse`
  ];

  summary.lighthouse.pages.forEach((page) => {
    lines.push(`- ${page.url}: score ${page.performanceScore}`);
  });

  lines.push('', '## Scenarios');

  Object.entries(summary.scenarios.scenarios).forEach(([name, scenario]) => {
    const duration = scenario?.duration != null ? `${scenario.duration.toFixed(1)} ms` : 'n/a';
    lines.push(`- ${name}: ${duration}`);
  });

  lines.push('', '## Web Vitals');

  (summary.scenarios.vitals.firstLoad || []).forEach((metric) => {
    lines.push(`- ${metric.name}: ${metric.value.toFixed(2)} (${metric.rating})`);
  });

  return `${lines.join('\n')}\n`;
}

const runDir = await createRunDir('baseline');
const lighthouse = await runLighthouse({ runDir });
const scenarios = await runScenarioMetrics({ runDir });

const summary = {
  generatedAt: new Date().toISOString(),
  runDir,
  lighthouse,
  scenarios
};

const markdownSummary = renderMarkdownSummary(summary);

await writeJson(path.join(runDir, 'summary.json'), summary);
await writeText(path.join(runDir, 'summary.md'), markdownSummary);
await writeJson(latestSummaryPath(), summary);
await writeText(latestSummaryMarkdownPath(), markdownSummary);

console.log(JSON.stringify(summary, null, 2));
