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
    const avg = scenario?.avgMs != null ? `${scenario.avgMs.toFixed(1)} ms` : 'n/a';
    const median = scenario?.medianMs != null ? `${scenario.medianMs.toFixed(1)} ms` : 'n/a';
    lines.push(`- ${name}: avg ${avg}, median ${median}`);
  });

  lines.push('', '## Web Vitals');

  (summary.scenarios.vitals.firstLoad || []).forEach((metric) => {
    const avg = metric?.avgMs != null ? metric.avgMs.toFixed(2) : 'n/a';
    const median = metric?.medianMs != null ? metric.medianMs.toFixed(2) : 'n/a';
    lines.push(`- ${metric.name}: avg ${avg}, median ${median}`);
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
