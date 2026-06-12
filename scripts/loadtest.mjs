#!/usr/bin/env node
/**
 * Read-path load test (docs/runbook.md): N concurrent loops for S seconds over
 * the feed, a slot detail, and a public profile. Prints p50/p95/p99 + errors.
 *
 *   node scripts/loadtest.mjs https://staging.example.com 200 30
 */
const [base = "http://localhost:3002", concRaw = "50", secsRaw = "15"] =
  process.argv.slice(2);
const CONCURRENCY = Number(concRaw);
const SECONDS = Number(secsRaw);

// discover one slot + one performer to hit detail pages
const feed = await (await fetch(`${base}/api/slots`)).json();
const slotId = feed.slots?.[0]?.slot?.id;
const paths = ["/", "/api/slots", slotId ? `/slots/${slotId}` : "/techs"];

const latencies = [];
let errors = 0;
const deadline = Date.now() + SECONDS * 1000;

async function loop() {
  while (Date.now() < deadline) {
    const path = paths[Math.floor(Math.random() * paths.length)];
    const t0 = performance.now();
    try {
      const res = await fetch(base + path);
      if (!res.ok) errors++;
      await res.arrayBuffer();
      latencies.push(performance.now() - t0);
    } catch {
      errors++;
    }
  }
}

console.log(`loadtest: ${CONCURRENCY} loops × ${SECONDS}s against ${base}`);
await Promise.all(Array.from({ length: CONCURRENCY }, loop));

latencies.sort((a, b) => a - b);
const pct = (p) => latencies[Math.floor((latencies.length - 1) * p)]?.toFixed(0);
console.log({
  requests: latencies.length,
  rps: Math.round(latencies.length / SECONDS),
  p50_ms: pct(0.5),
  p95_ms: pct(0.95),
  p99_ms: pct(0.99),
  errors,
  error_rate: `${((errors / Math.max(1, latencies.length + errors)) * 100).toFixed(2)}%`,
});
process.exit(errors / Math.max(1, latencies.length) > 0.001 ? 1 : 0);
