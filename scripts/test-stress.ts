/*
 * 100,000 并发压力测试脚本
 * -----------------------
 * 对项目所有接口进行 100,000 请求级别的压力测试。
 * 所有 LLM 接口使用异步模式（默认行为），验证：
 *   - 异步任务创建的吞吐量
 *   - 任务队列的承载能力
 *   - 限流降级机制
 *   - /health 在高压下的稳定性
 *
 * 用法：bun run test:stress
 * 前置：服务已启动 (bun run server)
 *
 * 参数：
 *   --requests  总请求数（默认 100000）
 *   --concurrency 并发数（默认 5000）
 *   --endpoint  仅测试单个接口（可选：health, generateResearchPlan, refineResearchPlan, analyzeTranscripts, generateProjectReport, tasks）
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

// ---- 加载 .env ----
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

// ---- 参数解析 ----
const args = new Map<string, string>();
for (let i = 2; i < Bun.argv.length; i += 1) {
  const arg = Bun.argv[i];
  if (!arg.startsWith("--")) continue;
  const key = arg.slice(2);
  const next = Bun.argv[i + 1];
  if (next && !next.startsWith("--")) {
    args.set(key, next);
    i += 1;
  } else {
    args.set(key, "true");
  }
}

const BASE_URL = process.env.TEST_BASE_URL || "http://127.0.0.1:8080";
const TOTAL_REQUESTS = Number(args.get("requests") || 100000);
const CONCURRENCY = Number(args.get("concurrency") || 5000);
const SINGLE_ENDPOINT = args.get("endpoint") || "";

// ---- 接口定义 ----
interface EndpointDef {
  name: string;
  method: "GET" | "POST";
  path: string;
  body?: string;
  weight: number; // 请求分配权重
  expectedStatus: number[]; // 可接受的成功状态码
}

const PAYLOAD_RESEARCH_PLAN = JSON.stringify({
  data: {
    objectType: "SaaS产品",
    industry: "企业服务",
    demographics: "25-40岁",
    userPersona: "IT决策者",
    objectives: "了解需求",
    method: "voice",
    questionCount: 3,
  },
});

const PAYLOAD_ANALYZE = JSON.stringify({
  data: { transcripts: "这是一段测试文本，用于压力测试。" },
});

const PAYLOAD_REPORT = JSON.stringify({
  data: {
    projectTitle: "压测项目",
    sessions: [
      {
        id: "s1",
        transcript: "测试文本",
        analysis: { sentiment: [], keywords: [], themes: [], summary: "测试" },
      },
    ],
  },
});

const ENDPOINTS: EndpointDef[] = [
  { name: "health", method: "GET", path: "/health", weight: 30, expectedStatus: [200] },
  { name: "generateResearchPlan", method: "POST", path: "/api/generateResearchPlan", body: PAYLOAD_RESEARCH_PLAN, weight: 20, expectedStatus: [200, 202] },
  { name: "analyzeTranscripts", method: "POST", path: "/api/analyzeTranscripts", body: PAYLOAD_ANALYZE, weight: 20, expectedStatus: [200, 202] },
  { name: "generateProjectReport", method: "POST", path: "/api/generateProjectReport", body: PAYLOAD_REPORT, weight: 10, expectedStatus: [200, 202] },
  { name: "tasks", method: "GET", path: "/api/tasks/stress-test-nonexistent", weight: 20, expectedStatus: [404] },
];

// ---- 统计 ----
interface Sample {
  endpoint: string;
  ok: boolean;
  status: number;
  durationMs: number;
}

const samples: Sample[] = [];
const endpointStats: Record<string, { total: number; success: number; failed: number; statuses: Record<number, number>; latencies: number[] }> = {};

function initEndpointStats(name: string) {
  if (!endpointStats[name]) {
    endpointStats[name] = { total: 0, success: 0, failed: 0, statuses: {}, latencies: [] };
  }
}

ENDPOINTS.forEach((ep) => initEndpointStats(ep.name));

// ---- 请求分配 ----
function selectEndpoint(): EndpointDef {
  if (SINGLE_ENDPOINT) {
    const found = ENDPOINTS.find((e) => e.name === SINGLE_ENDPOINT);
    if (found) return found;
  }
  const totalWeight = ENDPOINTS.reduce((sum, ep) => sum + ep.weight, 0);
  let rand = Math.random() * totalWeight;
  for (const ep of ENDPOINTS) {
    rand -= ep.weight;
    if (rand <= 0) return ep;
  }
  return ENDPOINTS[0];
}

// ---- 单次请求 ----
async function runOne(): Promise<Sample> {
  const ep = selectEndpoint();
  const started = performance.now();
  try {
    const response = await fetch(`${BASE_URL}${ep.path}`, {
      method: ep.method,
      headers: ep.body ? { "Content-Type": "application/json" } : undefined,
      body: ep.method === "POST" ? ep.body : undefined,
    });
    await response.arrayBuffer();
    const durationMs = performance.now() - started;
    const ok = ep.expectedStatus.includes(response.status);
    return { endpoint: ep.name, ok, status: response.status, durationMs };
  } catch {
    return {
      endpoint: ep.name,
      ok: false,
      status: 0,
      durationMs: performance.now() - started,
    };
  }
}

// ---- 百分位计算 ----
function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

// ---- 压测主逻辑 ----
async function runStressTest() {
  console.log("\n========================================");
  console.log("  100,000 并发压力测试");
  console.log("========================================");
  console.log(`  Target:      ${BASE_URL}`);
  console.log(`  Requests:    ${TOTAL_REQUESTS.toLocaleString()}`);
  console.log(`  Concurrency: ${CONCURRENCY.toLocaleString()}`);
  if (SINGLE_ENDPOINT) {
    console.log(`  Endpoint:    ${SINGLE_ENDPOINT} (single mode)`);
  } else {
    console.log(`  Endpoints:   ${ENDPOINTS.map((e) => `${e.name}(${e.weight}%)`).join(", ")}`);
  }
  console.log("");

  // 前置健康检查
  try {
    const resp = await fetch(`${BASE_URL}/health`);
    if (!resp.ok) throw new Error(`Health check failed: ${resp.status}`);
    console.log("  Pre-check: Service is running.\n");
  } catch {
    console.error("  Pre-check: Service is NOT running. Start with: bun run server\n");
    process.exit(1);
  }

  const testStart = performance.now();
  let launched = 0;
  let lastReport = 0;

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, TOTAL_REQUESTS) },
    async () => {
      while (launched < TOTAL_REQUESTS) {
        launched += 1;
        const sample = await runOne();
        samples.push(sample);

        // 更新统计
        const stats = endpointStats[sample.endpoint];
        stats.total += 1;
        stats.latencies.push(sample.durationMs);
        stats.statuses[sample.status] = (stats.statuses[sample.status] || 0) + 1;
        if (sample.ok) {
          stats.success += 1;
        } else {
          stats.failed += 1;
        }

        // 进度报告（每 10000 请求）
        const progress = samples.length;
        if (progress - lastReport >= 10000) {
          lastReport = progress;
          const elapsed = ((performance.now() - testStart) / 1000).toFixed(1);
          const pct = ((progress / TOTAL_REQUESTS) * 100).toFixed(1);
          const rps = (progress / ((performance.now() - testStart) / 1000)).toFixed(0);
          console.log(`  Progress: ${progress.toLocaleString()}/${TOTAL_REQUESTS.toLocaleString()} (${pct}%) | ${elapsed}s | ${rps} rps`);
        }
      }
    }
  );

  await Promise.all(workers);
  const totalMs = performance.now() - testStart;

  // ---- 汇总报告 ----
  console.log("\n========================================");
  console.log("  压力测试结果汇总");
  console.log("========================================\n");

  const allLatencies = samples.map((s) => s.durationMs).sort((a, b) => a - b);
  const totalSuccess = samples.filter((s) => s.ok).length;
  const totalFailed = samples.length - totalSuccess;

  console.log("Overall:");
  console.log(`  Total Requests:  ${samples.length.toLocaleString()}`);
  console.log(`  Success:         ${totalSuccess.toLocaleString()}`);
  console.log(`  Failed:          ${totalFailed.toLocaleString()}`);
  console.log(`  Error Rate:      ${((totalFailed / samples.length) * 100).toFixed(2)}%`);
  console.log(`  Total Time:      ${(totalMs / 1000).toFixed(2)}s`);
  console.log(`  RPS:             ${(samples.length / (totalMs / 1000)).toFixed(0)}`);
  console.log(`  Latency (ms):    min=${(allLatencies[0] || 0).toFixed(1)} p50=${percentile(allLatencies, 50).toFixed(1)} p90=${percentile(allLatencies, 90).toFixed(1)} p95=${percentile(allLatencies, 95).toFixed(1)} p99=${percentile(allLatencies, 99).toFixed(1)} max=${(allLatencies[allLatencies.length - 1] || 0).toFixed(1)}`);
  console.log("");

  console.log("Per-Endpoint:");
  console.log("  Endpoint                | Total    | Success  | Failed   | Error%  | P50(ms)  | P95(ms)  | P99(ms)  | Status Codes");
  console.log("  ------------------------|----------|----------|----------|---------|----------|----------|----------|------------------");

  for (const ep of ENDPOINTS) {
    const stats = endpointStats[ep.name];
    if (stats.total === 0) continue;
    const errRate = ((stats.failed / stats.total) * 100).toFixed(2);
    const p50 = percentile(stats.latencies, 50).toFixed(1);
    const p95 = percentile(stats.latencies, 95).toFixed(1);
    const p99 = percentile(stats.latencies, 99).toFixed(1);
    const statusStr = Object.entries(stats.statuses)
      .map(([code, count]) => `${code}:${count}`)
      .join(", ");
    console.log(
      `  ${ep.name.padEnd(24)}| ${String(stats.total).padStart(8)} | ${String(stats.success).padStart(8)} | ${String(stats.failed).padStart(8)} | ${errRate.padStart(6)}% | ${p50.padStart(8)} | ${p95.padStart(8)} | ${p99.padStart(8)} | ${statusStr}`
    );
  }

  // ---- JSON 输出（供报告使用）----
  const report = {
    summary: {
      totalRequests: samples.length,
      success: totalSuccess,
      failed: totalFailed,
      errorRate: `${((totalFailed / samples.length) * 100).toFixed(2)}%`,
      totalSeconds: Number((totalMs / 1000).toFixed(2)),
      rps: Number((samples.length / (totalMs / 1000)).toFixed(0)),
      latencyMs: {
        min: Number((allLatencies[0] || 0).toFixed(1)),
        p50: Number(percentile(allLatencies, 50).toFixed(1)),
        p90: Number(percentile(allLatencies, 90).toFixed(1)),
        p95: Number(percentile(allLatencies, 95).toFixed(1)),
        p99: Number(percentile(allLatencies, 99).toFixed(1)),
        max: Number((allLatencies[allLatencies.length - 1] || 0).toFixed(1)),
      },
    },
    endpoints: ENDPOINTS.map((ep) => {
      const stats = endpointStats[ep.name];
      return {
        name: ep.name,
        method: ep.method,
        path: ep.path,
        total: stats.total,
        success: stats.success,
        failed: stats.failed,
        errorRate: `${((stats.failed / Math.max(stats.total, 1)) * 100).toFixed(2)}%`,
        latencyMs: {
          p50: Number(percentile(stats.latencies, 50).toFixed(1)),
          p95: Number(percentile(stats.latencies, 95).toFixed(1)),
          p99: Number(percentile(stats.latencies, 99).toFixed(1)),
        },
        statusCounts: stats.statuses,
      };
    }),
  };

  console.log("\n--- JSON Report ---");
  console.log(JSON.stringify(report, null, 2));

  // 写入报告文件
  const reportPath = resolve(process.cwd(), "docs", "stress-test-100k-report.json");
  const { writeFileSync } = await import("fs");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport saved to: ${reportPath}`);
}

runStressTest().catch((err) => {
  console.error("Stress test error:", err);
  process.exit(1);
});
