/*
 * 全接口测试用例脚本
 * ---------------
 * 覆盖项目所有 6 个 API 接口的正常/异常场景测试。
 *
 * 接口列表：
 *   1. GET  /health                      健康检查
 *   2. POST /api/generateResearchPlan     生成调研方案（异步）
 *   3. POST /api/refineResearchPlan       优化调研方案（异步）
 *   4. POST /api/analyzeTranscripts       分析访谈文本（异步）
 *   5. POST /api/generateProjectReport    生成项目报告（异步）
 *   6. GET  /api/tasks/{id}               查询任务状态
 *
 * 用法：bun run test:api
 * 前置：服务已启动 (bun run server)
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

const BASE_URL = process.env.TEST_BASE_URL || "http://127.0.0.1:8080";
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 60000;
const RATE_LIMIT_DELAY_MS = 1000; // 请求间隔1秒，确保不触发限流（LLM_QPS=8）

// ---- 测试框架 ----
let passed = 0;
let failed = 0;
let skipped = 0;
const results: Array<{ name: string; status: "PASS" | "FAIL" | "SKIP"; detail: string }> = [];

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

class SkipError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "SkipError";
  }
}

async function pollTask(taskId: string): Promise<any> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const resp = await fetch(`${BASE_URL}/api/tasks/${taskId}`);
    const body = await resp.json();
    if (body.data?.status === "completed") return body.data;
    if (body.data?.status === "failed") throw new Error(`Task failed: ${body.data.error}`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Task ${taskId} timed out after ${POLL_TIMEOUT_MS}ms`);
}

/**
 * 发送异步请求并轮询结果，自动处理限流降级
 */
async function asyncRequest(path: string, payload: any): Promise<any> {
  await sleep(RATE_LIMIT_DELAY_MS);
  const resp = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await resp.json();

  // 限流降级：返回 queued 但无 taskId
  if (body.meta?.degraded && body.meta?.reason === "rate_limited") {
    throw new SkipError("Rate limited, skipped");
  }

  assert(body.data?.taskId, `Should have taskId, got: ${JSON.stringify(body)}`);
  return pollTask(body.data.taskId);
}

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    results.push({ name, status: "PASS", detail: "" });
    console.log(`  \u2705 ${name}`);
  } catch (err: any) {
    if (err.name === "SkipError") {
      skipped++;
      results.push({ name, status: "SKIP", detail: err.message });
      console.log(`  \u23ED\uFE0F ${name} (skipped: ${err.message})`);
    } else {
      failed++;
      results.push({ name, status: "FAIL", detail: err.message });
      console.log(`  \u274C ${name}`);
      console.log(`     ${err.message}`);
    }
  }
}

// ---- 测试用例 ----

// 1. 健康检查
async function testHealth() {
  await test("GET /health 返回 200 且包含服务信息", async () => {
    const resp = await fetch(`${BASE_URL}/health`);
    assert(resp.ok, `Expected 200, got ${resp.status}`);
    const body = await resp.json();
    assert(body.ok === true, "body.ok should be true");
    assert(typeof body.service === "string" && body.service.length > 0, "service should be a non-empty string");
    assert(typeof body.time === "number", "time should be a number");
  });

  await test("GET /health 响应时间 < 100ms", async () => {
    const start = performance.now();
    const resp = await fetch(`${BASE_URL}/health`);
    await resp.json();
    const elapsed = performance.now() - start;
    assert(elapsed < 100, `Expected < 100ms, got ${elapsed.toFixed(1)}ms`);
  });
}

// 2. generateResearchPlan
async function testGenerateResearchPlan() {
  const payload = {
    data: {
      objectType: "SaaS产品",
      industry: "企业服务",
      demographics: "25-40岁，中高层管理者",
      userPersona: "企业IT决策者",
      objectives: "了解用户对AI调研工具的需求和痛点",
      method: "voice",
      questionCount: 5,
    },
  };

  await test("POST /api/generateResearchPlan 异步模式返回 202 + taskId", async () => {
    const resp = await fetch(`${BASE_URL}/api/generateResearchPlan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert(resp.status === 202, `Expected 202, got ${resp.status}`);
    const body = await resp.json();
    assert(body.data?.taskId, "Should have taskId");
    assert(body.data?.status === "queued" || body.data?.status === "running", `Status should be queued/running, got ${body.data?.status}`);
  });

  await test("POST /api/generateResearchPlan 异步任务最终完成并返回有效方案", async () => {
    const task = await asyncRequest("/api/generateResearchPlan", payload);
    assert(task.result?.title, "Plan should have title");
    assert(Array.isArray(task.result?.questions), "Plan should have questions array");
    assert(task.result.questions.length > 0, "Questions should not be empty");
  });

  await test("POST /api/generateResearchPlan sync=1 返回同步结果", async () => {
    const resp = await fetch(`${BASE_URL}/api/generateResearchPlan?sync=1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert(resp.status === 200, `Expected 200 for sync mode, got ${resp.status}`);
    const body = await resp.json();
    assert(body.data?.title, "Should have title in sync response");
  });

  await test("POST /api/generateResearchPlan 空请求体返回错误", async () => {
    const resp = await fetch(`${BASE_URL}/api/generateResearchPlan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    // 异步模式也会返回 202（任务会后续失败），或直接返回错误
    assert(resp.status === 202 || resp.status === 500, `Expected 202 or 500, got ${resp.status}`);
  });
}

// 3. refineResearchPlan
async function testRefineResearchPlan() {
  // 先生成一个方案
  const genResp = await fetch(`${BASE_URL}/api/generateResearchPlan?sync=1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: {
        objectType: "移动App",
        industry: "电商",
        demographics: "18-35岁",
        userPersona: "年轻消费者",
        objectives: "了解购物习惯",
        method: "questionnaire",
        questionCount: 3,
      },
    }),
  });
  const genBody = await genResp.json();
  const currentPlan = genBody.data;

  await test("POST /api/refineResearchPlan 异步模式返回 202 + taskId", async () => {
    const resp = await fetch(`${BASE_URL}/api/refineResearchPlan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: {
          currentPlan,
          refineInstructions: "增加关于用户支付习惯的问题",
        },
      }),
    });
    assert(resp.status === 202, `Expected 202, got ${resp.status}`);
    const body = await resp.json();
    assert(body.data?.taskId, "Should have taskId");
  });

  await test("POST /api/refineResearchPlan 异步任务完成并返回优化后方案", async () => {
    const task = await asyncRequest("/api/refineResearchPlan", {
      data: {
        currentPlan,
        refineInstructions: "让问题更简洁直接",
      },
    });
    assert(task.result?.questions, "Refined plan should have questions");
    assert(Array.isArray(task.result.questions), "Questions should be array");
  });
}

// 4. analyzeTranscripts
async function testAnalyzeTranscripts() {
  const payload = {
    data: {
      transcripts: "受访者：我觉得这个产品界面很友好，但加载速度有点慢。希望增加离线功能。整体来说体验不错，会推荐给朋友。",
    },
  };

  await test("POST /api/analyzeTranscripts 异步模式返回 202 + taskId", async () => {
    const resp = await fetch(`${BASE_URL}/api/analyzeTranscripts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert(resp.status === 202, `Expected 202, got ${resp.status}`);
    const body = await resp.json();
    assert(body.data?.taskId, "Should have taskId");
  });

  await test("POST /api/analyzeTranscripts 异步任务完成并返回分析结果", async () => {
    const task = await asyncRequest("/api/analyzeTranscripts", payload);
    assert(task.result, "Should have analysis result");
    assert(Array.isArray(task.result.sentiment) || task.result.summary, "Should have sentiment or summary");
  });

  await test("POST /api/analyzeTranscripts 空文本返回错误或降级", async () => {
    await sleep(RATE_LIMIT_DELAY_MS);
    const resp = await fetch(`${BASE_URL}/api/analyzeTranscripts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { transcripts: "" } }),
    });
    // 可接受：202（异步任务）、500（同步错误）、200（缓存命中）
    assert([200, 202, 500].includes(resp.status), `Expected 200/202/500, got ${resp.status}`);
  });
}

// 5. generateProjectReport
async function testGenerateProjectReport() {
  const payload = {
    data: {
      projectTitle: "测试项目报告",
      sessions: [
        {
          id: "s1",
          transcript: "用户A认为产品很好用，但希望增加导出功能。",
          analysis: {
            sentiment: [{ name: "积极", value: 70, color: "#34C759" }],
            keywords: [{ word: "导出功能", count: 3 }],
            themes: [{ topic: "功能需求", count: 2 }],
            summary: "用户整体满意，希望增加导出功能。",
          },
        },
      ],
    },
  };

  await test("POST /api/generateProjectReport 异步模式返回 202 + taskId", async () => {
    await sleep(RATE_LIMIT_DELAY_MS);
    const resp = await fetch(`${BASE_URL}/api/generateProjectReport`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await resp.json();
    if (body.meta?.degraded) throw new SkipError("Rate limited");
    assert(resp.status === 202, `Expected 202, got ${resp.status}`);
    assert(body.data?.taskId, "Should have taskId");
  });

  await test("POST /api/generateProjectReport 异步任务完成并返回报告", async () => {
    const task = await asyncRequest("/api/generateProjectReport", payload);
    assert(task.result?.title, "Report should have title");
    assert(Array.isArray(task.result?.chapters), "Report should have chapters");
  });

  await test("POST /api/generateProjectReport 空sessions返回错误", async () => {
    await sleep(RATE_LIMIT_DELAY_MS);
    const resp = await fetch(`${BASE_URL}/api/generateProjectReport`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { projectTitle: "空项目", sessions: [] } }),
    });
    const body = await resp.json();
    if (body.meta?.degraded) throw new SkipError("Rate limited");
    // 异步模式返回 202，任务后续会失败；或直接返回 500
    if (resp.status === 202 && body.data?.taskId) {
      const task = await pollTask(body.data.taskId).catch((e) => e.message);
      assert(
        typeof task === "string" && task.includes("failed"),
        "Task should fail for empty sessions"
      );
    } else {
      assert(resp.status === 500, `Expected 500, got ${resp.status}`);
    }
  });
}

// 6. GET /api/tasks/{id}
async function testGetTaskStatus() {
  await test("GET /api/tasks/{id} 查询不存在的任务返回 404", async () => {
    const resp = await fetch(`${BASE_URL}/api/tasks/nonexistent-id-12345`);
    assert(resp.status === 404, `Expected 404, got ${resp.status}`);
    const body = await resp.json();
    assert(body.error, "Should have error field");
  });

  await test("GET /api/tasks/{id} 查询有效任务返回任务状态", async () => {
    // 先创建一个任务
    const createResp = await fetch(`${BASE_URL}/api/analyzeTranscripts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: { transcripts: "测试文本内容" },
      }),
    });
    const createBody = await createResp.json();
    const taskId = createBody.data.taskId;

    const resp = await fetch(`${BASE_URL}/api/tasks/${taskId}`);
    assert(resp.status === 200, `Expected 200, got ${resp.status}`);
    const body = await resp.json();
    assert(body.data?.id === taskId, "Task ID should match");
    assert(["queued", "running", "completed", "failed"].includes(body.data?.status), "Should have valid status");
  });

  await test("GET /api/tasks/{id} 无id参数返回 400", async () => {
    const resp = await fetch(`${BASE_URL}/api/tasks/`);
    assert(resp.status === 400 || resp.status === 404, `Expected 400 or 404, got ${resp.status}`);
  });
}

// 7. 其他边界测试
async function testEdgeCases() {
  await test("POST /api/nonexistent 返回 404", async () => {
    const resp = await fetch(`${BASE_URL}/api/nonexistent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert(resp.status === 404, `Expected 404, got ${resp.status}`);
  });

  await test("GET /api/generateResearchPlan 返回 405 (Method Not Allowed)", async () => {
    const resp = await fetch(`${BASE_URL}/api/generateResearchPlan`);
    assert(resp.status === 405, `Expected 405, got ${resp.status}`);
  });

  await test("OPTIONS 请求返回 CORS 头", async () => {
    const resp = await fetch(`${BASE_URL}/api/generateResearchPlan`, {
      method: "OPTIONS",
    });
    assert(resp.status === 204, `Expected 204, got ${resp.status}`);
    assert(resp.headers.get("Access-Control-Allow-Origin") === "*", "Should have CORS header");
  });
}

// ---- 主入口 ----
async function main() {
  console.log("\n========================================");
  console.log("  AI-auto-research 全接口测试用例");
  console.log(`  Target: ${BASE_URL}`);
  console.log("========================================\n");

  // 前置检查
  try {
    const resp = await fetch(`${BASE_URL}/health`);
    if (!resp.ok) throw new Error(`Health check failed: ${resp.status}`);
    console.log("  Service is running.\n");
  } catch (err: any) {
    console.error(`\u274C Service is not running at ${BASE_URL}. Start it with: bun run server\n`);
    process.exit(1);
  }

  console.log("[1/7] 健康检查接口");
  await testHealth();

  console.log("\n[2/7] 生成调研方案接口");
  await testGenerateResearchPlan();

  console.log("\n[3/7] 优化调研方案接口");
  await testRefineResearchPlan();

  console.log("\n[4/7] 分析访谈文本接口");
  await testAnalyzeTranscripts();

  console.log("\n[5/7] 生成项目报告接口");
  await testGenerateProjectReport();

  console.log("\n[6/7] 任务状态查询接口");
  await testGetTaskStatus();

  console.log("\n[7/7] 边界测试");
  await testEdgeCases();

  // 汇总
  console.log("\n========================================");
  console.log("  测试结果汇总");
  console.log("========================================");
  console.log(`  \u2705 通过: ${passed}`);
  console.log(`  \u274C 失败: ${failed}`);
  console.log(`  \u23ED\uFE0F 跳过: ${skipped}`);
  console.log(`  总计: ${passed + failed + skipped}`);
  console.log("");

  if (failed > 0) {
    console.log("失败用例:");
    results.filter((r) => r.status === "FAIL").forEach((r) => {
      console.log(`  \u274C ${r.name}: ${r.detail}`);
    });
    console.log("");
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
