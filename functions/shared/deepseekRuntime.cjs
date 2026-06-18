const crypto = require("crypto");

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 5 * 60 * 1000);
const LLM_MAX_CONCURRENCY = Number(process.env.LLM_MAX_CONCURRENCY || 4);
const RATE_WINDOW_MS = Number(process.env.RATE_WINDOW_MS || 1000);
const NORMAL_QPS = Number(process.env.RATE_LIMIT_QPS || 60);
const LLM_QPS = Number(process.env.LLM_RATE_LIMIT_QPS || 8);
const TASK_TTL_MS = Number(process.env.TASK_TTL_MS || 30 * 60 * 1000);

const memoryCache = new Map();
const rateBuckets = new Map();
const tasks = new Map();
const llmQueue = [];
let activeLlmCalls = 0;
let firestoreAdmin = null;
let firestoreInitAttempted = false;

const IDENTITY_QUESTIONS = [
  { id: "id_job", text: "为了更好地了解您，请问您的职业是什么？", type: "open", intent: "身份确认-职业" },
  { id: "id_industry", text: "您目前所在的行业是？", type: "open", intent: "身份确认-行业" },
  { id: "id_age", text: "您的年龄段是？", type: "open", intent: "身份确认-年龄" },
  { id: "id_gender", text: "您的性别是？", type: "open", intent: "身份确认-性别" },
];

const DEFAULT_VOICE_SETTINGS = {
  gender: "female",
  language: "zh",
  tone: "干练女声",
  voiceName: "Zephyr",
};

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function hashInput(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function createJsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      ...headers,
    },
  });
}

function handleCors(req) {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Max-Age": "3600",
    },
  });
}

function parseDeepSeekError(error) {
  return error?.status || error?.response?.status || error?.code || error?.error?.code;
}

async function withRetry(operation, retries = 3, delay = 1000) {
  try {
    return await operation();
  } catch (error) {
    const status = parseDeepSeekError(error);
    const isRetryable = status === 429 || (typeof status === "number" && status >= 500);
    if (isRetryable && retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return withRetry(operation, retries - 1, delay * 2);
    }
    throw error;
  }
}

function getCached(cacheKey) {
  const cached = memoryCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    memoryCache.delete(cacheKey);
    return null;
  }
  return cached.value;
}

function setCached(cacheKey, value, ttl = CACHE_TTL_MS) {
  memoryCache.set(cacheKey, { value, expiresAt: Date.now() + ttl });
}

async function getFirestore() {
  if (firestoreAdmin || firestoreInitAttempted) return firestoreAdmin;
  firestoreInitAttempted = true;
  try {
    const admin = require("firebase-admin");
    if (!admin.apps?.length) admin.initializeApp();
    firestoreAdmin = admin.firestore();
  } catch {
    firestoreAdmin = null;
  }
  return firestoreAdmin;
}

async function readPersistentCache(cacheKey) {
  const db = await getFirestore();
  if (!db) return null;
  try {
    const snap = await db.collection("llm_cache").doc(cacheKey).get();
    if (!snap.exists) return null;
    const data = snap.data();
    if (data.expiresAt && data.expiresAt < Date.now()) return null;
    return data.value || null;
  } catch {
    return null;
  }
}

async function writePersistentCache(cacheKey, value, ttl = CACHE_TTL_MS) {
  const db = await getFirestore();
  if (!db) return;
  try {
    await db.collection("llm_cache").doc(cacheKey).set({
      value,
      updatedAt: Date.now(),
      expiresAt: Date.now() + ttl,
    }, { merge: true });
  } catch {
    // Persistent cache is a performance optimization; failures must not break user flow.
  }
}

function shouldRateLimit(req, isLlm) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "local";
  const key = `${isLlm ? "llm" : "http"}:${ip}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  const limit = isLlm ? LLM_QPS : NORMAL_QPS;
  if (!bucket || now - bucket.startedAt > RATE_WINDOW_MS) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

function enqueueLlm(operation) {
  return new Promise((resolve, reject) => {
    llmQueue.push({ operation, resolve, reject });
    drainLlmQueue();
  });
}

function drainLlmQueue() {
  while (activeLlmCalls < LLM_MAX_CONCURRENCY && llmQueue.length) {
    const item = llmQueue.shift();
    activeLlmCalls += 1;
    item.operation()
      .then(item.resolve)
      .catch(item.reject)
      .finally(() => {
        activeLlmCalls -= 1;
        drainLlmQueue();
      });
  }
}

function getDeepSeekConfig() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not set");
  }
  return {
    apiKey,
    baseUrl: (process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ""),
    model: process.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
  };
}

function cleanJson(text) {
  let content = String(text || "").replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const firstOpen = content.indexOf("{");
  const lastClose = content.lastIndexOf("}");
  if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
    content = content.slice(firstOpen, lastClose + 1);
  }
  return content;
}

async function callDeepSeekJson({ system, user, signal }) {
  const config = getDeepSeekConfig();
  const response = await enqueueLlm(() => withRetry(async () => {
    const resp = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: `${system}\n只输出合法 JSON，不要 Markdown。` },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
      signal,
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      const error = new Error(body || `DeepSeek request failed: ${resp.status}`);
      error.status = resp.status;
      throw error;
    }
    return resp.json();
  }));

  const content = response?.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek returned an empty response");
  return JSON.parse(cleanJson(content));
}

function validateResearchPlan(plan) {
  if (!plan || typeof plan !== "object") throw new Error("Invalid ResearchPlan");
  if (!Array.isArray(plan.questions)) throw new Error("ResearchPlan.questions must be an array");
  plan.questions = plan.questions.map((question, index) => ({
    id: String(question.id || `q_${index + 1}`),
    text: String(question.text || ""),
    type: ["open", "scale", "choice"].includes(question.type) ? question.type : "open",
    intent: String(question.intent || ""),
    ...(question.scaleLabels ? { scaleLabels: question.scaleLabels.map(String).slice(0, 5) } : {}),
  }));
  return {
    title: String(plan.title || "用户调研计划"),
    logicOutline: String(plan.logicOutline || ""),
    analysisFramework: String(plan.analysisFramework || ""),
    systemInstruction: String(plan.systemInstruction || ""),
    questions: plan.questions,
    voiceSettings: plan.voiceSettings || DEFAULT_VOICE_SETTINGS,
  };
}

function validateAnalysisResult(result) {
  if (!result || typeof result !== "object") throw new Error("Invalid AnalysisResult");
  return {
    sentiment: Array.isArray(result.sentiment) ? result.sentiment.map((item, index) => ({
      name: String(item.name || ["积极", "中性", "消极"][index] || "其他"),
      value: Number(item.value || 0),
      color: String(item.color || ["#34C759", "#007AFF", "#FF3B30"][index] || "#8E8E93"),
    })) : [],
    keywords: Array.isArray(result.keywords) ? result.keywords.map((item) => ({
      word: String(item.word || ""),
      count: Number(item.count || 1),
    })).filter((item) => item.word) : [],
    themes: Array.isArray(result.themes) ? result.themes.map((item) => ({
      topic: String(item.topic || ""),
      count: Number(item.count || 1),
    })).filter((item) => item.topic) : [],
    summary: String(result.summary || ""),
  };
}

function validateProjectReport(report, projectTitle) {
  if (!report || typeof report !== "object") throw new Error("Invalid ProjectReport");
  return {
    title: String(report.title || `${projectTitle} 调研洞察报告`),
    generatedAt: Number(report.generatedAt || Date.now()),
    chapters: Array.isArray(report.chapters) ? report.chapters.map((chapter) => ({
      title: String(chapter.title || "洞察章节"),
      content: String(chapter.content || ""),
      keyTakeaways: Array.isArray(chapter.keyTakeaways) ? chapter.keyTakeaways.map(String) : [],
    })) : [],
    participantProfiles: Array.isArray(report.participantProfiles) ? report.participantProfiles.map((profile, index) => ({
      sessionIndex: Number(profile.sessionIndex || index + 1),
      pseudonym: String(profile.pseudonym || `受访者${index + 1}`),
      roleAndAge: String(profile.roleAndAge || ""),
      occupation: String(profile.occupation || ""),
      tags: Array.isArray(profile.tags) ? profile.tags.map(String) : [],
      brief: String(profile.brief || ""),
    })) : [],
  };
}

function buildResearchPlanPrompt(data) {
  return `根据以下输入生成中文商业调研执行方案，结构必须与 JSON Schema 一致。
对象类型: ${data.objectType}
行业/场景: ${data.industry}
基础属性: ${data.demographics}
用户画像: ${data.userPersona}
调研目标: ${data.objectives}
执行方式: ${data.method === "voice" ? "AI 语音深度访谈" : "在线结构化问卷"}
题目数量: ${data.questionCount || 8}

JSON 字段:
title, logicOutline, analysisFramework, systemInstruction,
questions: [{ id, text, type(open|scale|choice), intent, scaleLabels? }]

要求:
- 问题自然、具体、可追问，避免套话。
- systemInstruction 使用中文，角色为 InsightFlow AI 访谈专家，包含开场、自我介绍、自然追问规则和结束语；结束时说“访谈结束”。
- scale 题必须给 2 个或 5 个 scaleLabels。
- 仅生成用户画像相关的问题，身份确认题由系统追加。`;
}

function buildRefinePlanPrompt(currentPlan, refineInstructions) {
  const fixedIds = new Set(IDENTITY_QUESTIONS.map((q) => q.id));
  const planForAI = {
    ...currentPlan,
    questions: (currentPlan.questions || []).filter((q) => !fixedIds.has(q.id)),
  };
  return `根据用户反馈优化调研方案，保持 JSON 字段不变。
用户反馈: ${refineInstructions}
当前方案: ${JSON.stringify(planForAI)}

要求:
- 保持问题类型只能为 open、scale、choice。
- 保留自然、生活化访谈语气。
- 不要返回身份确认题。`;
}

function buildAnalysisPrompt(transcripts) {
  return `分析以下访谈/问卷文本，输出中文 JSON。
字段:
sentiment: [{ name, value, color }]
keywords: [{ word, count }]
themes: [{ topic, count }]
summary: Markdown 字符串，包含核心洞察、痛点、机会点、建议和可引用片段。

文本:
${transcripts}`;
}

function sessionToBrief(session, index) {
  return `[Session #${index + 1}]
类型: ${session.context?.objectType || ""}
时间: ${session.timestamp ? new Date(session.timestamp).toISOString() : ""}
分析摘要: ${session.analysis?.summary || ""}
关键词: ${(session.analysis?.keywords || []).map((k) => k.word).join(", ")}
主题: ${(session.analysis?.themes || []).map((t) => t.topic).join(", ")}`;
}

function buildReportPrompt(projectTitle, sessions) {
  const content = sessions.map(sessionToBrief).join("\n\n---\n\n");
  return `基于多场调研分析生成项目级中文洞察报告。
项目名称: ${projectTitle}

材料:
${content}

JSON 字段:
title,
participantProfiles: [{ sessionIndex, pseudonym, roleAndAge, occupation, tags, brief }],
chapters: [{ title, content(Markdown), keyTakeaways }]

要求:
- 报告结构面向商业决策，包含总体发现、人群分层、关键痛点、机会建议和后续验证。
- 不堆砌原文，聚合归纳不同受访者的共同点与差异。`;
}

async function cachedJsonTask(kind, input, factory, validator, enablePersistentCache = true) {
  const cacheKey = `${kind}:${hashInput(input)}`;
  const memoryHit = getCached(cacheKey);
  if (memoryHit) return { data: memoryHit, cache: "memory" };
  if (enablePersistentCache) {
    const persistentHit = await readPersistentCache(cacheKey);
    if (persistentHit) {
      setCached(cacheKey, persistentHit);
      return { data: persistentHit, cache: "firestore" };
    }
  }

  const raw = await factory();
  const data = validator(raw);
  setCached(cacheKey, data);
  if (enablePersistentCache) await writePersistentCache(cacheKey, data);
  return { data, cache: "miss" };
}

async function getRouteCache(name, payload, enablePersistentCache = true) {
  const map = {
    generateResearchPlan: ["plan", payload],
    refineResearchPlan: ["plan-refine", payload],
    analyzeTranscripts: ["analysis", { transcripts: payload.transcripts }],
  };
  const target = map[name];
  if (!target) return null;

  const [kind, input] = target;
  const cacheKey = `${kind}:${hashInput(input)}`;
  const memoryHit = getCached(cacheKey);
  if (memoryHit) return { data: memoryHit, cache: "memory" };
  if (!enablePersistentCache) return null;

  const persistentHit = await readPersistentCache(cacheKey);
  if (!persistentHit) return null;
  setCached(cacheKey, persistentHit);
  return { data: persistentHit, cache: "firestore" };
}

async function generateResearchPlan(data, options = {}) {
  return cachedJsonTask(
    "plan",
    data,
    async () => callDeepSeekJson({
      system: "你是资深用户研究专家和商业分析师。",
      user: buildResearchPlanPrompt(data),
      signal: options.signal,
    }),
    (raw) => {
      const plan = validateResearchPlan(raw);
      plan.questions = [...IDENTITY_QUESTIONS, ...plan.questions];
      plan.voiceSettings = DEFAULT_VOICE_SETTINGS;
      return plan;
    },
    options.enablePersistentCache,
  );
}

async function refineResearchPlan(data, options = {}) {
  const fixedIds = new Set(IDENTITY_QUESTIONS.map((q) => q.id));
  const currentPlan = data.currentPlan || {};
  const fixedQuestions = (currentPlan.questions || []).filter((q) => fixedIds.has(q.id));
  return cachedJsonTask(
    "plan-refine",
    data,
    async () => callDeepSeekJson({
      system: "你是资深用户研究专家，擅长把反馈转成可执行调研方案。",
      user: buildRefinePlanPrompt(currentPlan, data.refineInstructions || ""),
      signal: options.signal,
    }),
    (raw) => {
      const refined = validateResearchPlan(raw);
      refined.questions = [...fixedQuestions, ...refined.questions];
      refined.voiceSettings = currentPlan.voiceSettings || DEFAULT_VOICE_SETTINGS;
      return refined;
    },
    options.enablePersistentCache,
  );
}

async function analyzeTranscripts(data, options = {}) {
  return cachedJsonTask(
    "analysis",
    { transcripts: data.transcripts },
    async () => callDeepSeekJson({
      system: "你是首席数据分析师，擅长从访谈中提炼可执行商业洞察。",
      user: buildAnalysisPrompt(data.transcripts || ""),
      signal: options.signal,
    }),
    validateAnalysisResult,
    options.enablePersistentCache,
  );
}

async function generateProjectReport(data, options = {}) {
  const sessions = Array.isArray(data.sessions) ? data.sessions.filter((s) => s.transcript || s.analysis) : [];
  if (!sessions.length) throw new Error("该项目暂无有效访谈或问卷记录。");

  const analyzedSessions = await Promise.all(sessions.map(async (session) => {
    if (session.analysis) return session;
    const result = await analyzeTranscripts({ transcripts: session.transcript || "" }, options);
    return { ...session, analysis: result.data };
  }));

  return cachedJsonTask(
    "project-report",
    { projectTitle: data.projectTitle, sessions: analyzedSessions.map((s) => ({ id: s.id, analysis: s.analysis, context: s.context })) },
    async () => callDeepSeekJson({
      system: "你是顶级咨询顾问，负责生成结构化商业调研报告。",
      user: buildReportPrompt(data.projectTitle || "未命名项目", analyzedSessions),
      signal: options.signal,
    }),
    (raw) => validateProjectReport(raw, data.projectTitle || "未命名项目"),
    options.enablePersistentCache,
  );
}

const routeHandlers = {
  generateResearchPlan,
  refineResearchPlan,
  analyzeTranscripts,
  generateProjectReport,
};

function createTask(kind, payload, options) {
  const id = crypto.randomUUID ? crypto.randomUUID() : hashInput({ kind, payload, at: Date.now() }).slice(0, 16);
  const task = { id, kind, status: "queued", createdAt: Date.now(), updatedAt: Date.now(), result: null, error: null };
  tasks.set(id, task);
  Promise.resolve()
    .then(async () => {
      task.status = "running";
      task.updatedAt = Date.now();
      const result = await routeHandlers[kind](payload, options);
      task.result = result.data;
      task.cache = result.cache;
      task.status = "completed";
      task.updatedAt = Date.now();
    })
    .catch((error) => {
      task.status = "failed";
      task.error = error.message || String(error);
      task.updatedAt = Date.now();
    });
  return task;
}

function cleanupTasks() {
  const now = Date.now();
  for (const [id, task] of tasks) {
    if (now - task.updatedAt > TASK_TTL_MS) tasks.delete(id);
  }
}

function sendSse(controller, event, payload) {
  controller.enqueue(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function createSseResponse(handler) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const writer = {
        enqueue(chunk) {
          controller.enqueue(encoder.encode(chunk));
        },
      };
      try {
        await handler(writer);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function readPayload(req) {
  const body = await req.json().catch(() => ({}));
  return body.data || body;
}

function createApiHandler(options = {}) {
  return async (req) => {
    cleanupTasks();
    const url = new URL(req.url);
    const name = url.pathname.replace(/^\/api\//, "");

    if (req.method === "GET" && name.startsWith("tasks/")) {
      const id = name.split("/")[1];
      const task = tasks.get(id);
      if (!task) return createJsonResponse({ error: { message: "Task not found" } }, 404);
      return createJsonResponse({ data: task });
    }

    if (req.method !== "POST") {
      return createJsonResponse({ error: { message: "Method not allowed" } }, 405);
    }

    if (!routeHandlers[name]) {
      return createJsonResponse({ error: { message: "API route not found" } }, 404);
    }

    const payload = await readPayload(req);
    const isLlm = true;
    if (shouldRateLimit(req, isLlm)) {
      const cached = await getRouteCache(name, payload, options.enablePersistentCache);
      if (cached) {
        return createJsonResponse({
          data: cached.data,
          meta: { cache: cached.cache, degraded: true, reason: "rate_limited" },
        });
      }

      return createJsonResponse({
        data: {
          status: "queued",
          message: "当前请求量较高，服务已进入排队降级状态，请稍后重试。",
          queue: { active: activeLlmCalls, waiting: llmQueue.length },
        },
        meta: { degraded: true, reason: "rate_limited" },
      }, 202);
    }
    const wantsStream = url.searchParams.get("stream") === "1" || req.headers.get("accept")?.includes("text/event-stream");
    const wantsAsync = url.searchParams.get("async") === "1" || name === "generateProjectReport";

    if (wantsAsync && name === "generateProjectReport") {
      const task = createTask(name, payload, options);
      return createJsonResponse({ data: { taskId: task.id, status: task.status } }, 202);
    }

    if (wantsStream) {
      return createSseResponse(async (controller) => {
        sendSse(controller, "status", { status: "queued", active: activeLlmCalls, waiting: llmQueue.length });
        try {
          const result = await routeHandlers[name](payload, options);
          sendSse(controller, "status", { status: "completed", cache: result.cache });
          sendSse(controller, "result", result.data);
        } catch (error) {
          sendSse(controller, "error", { message: error.message || String(error) });
        }
      });
    }

    try {
      const result = await routeHandlers[name](payload, options);
      return createJsonResponse({ data: result.data, meta: { cache: result.cache } });
    } catch (error) {
      return createJsonResponse({ error: { message: error.message || String(error) } }, 500);
    }
  };
}

function isStaticAssetRequest(pathname) {
  return pathname.includes(".") || pathname === "/";
}

function createBunStaticHandler(distDir) {
  const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
  };

  return async (req) => {
    if (typeof Bun === "undefined") return null;
    const { existsSync } = require("fs");
    const { extname, join, normalize } = require("path");
    const url = new URL(req.url);
    const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const filePath = normalize(join(distDir, requested));
    if (!filePath.startsWith(normalize(distDir)) || !existsSync(filePath)) return null;
    return new Response(Bun.file(filePath), {
      headers: {
        "Content-Type": mime[extname(filePath)] || "application/octet-stream",
      },
    });
  };
}

module.exports = {
  analyzeTranscripts,
  createApiHandler,
  createBunStaticHandler,
  createJsonResponse,
  generateProjectReport,
  generateResearchPlan,
  handleCors,
  isStaticAssetRequest,
  refineResearchPlan,
  withRetry,
};
