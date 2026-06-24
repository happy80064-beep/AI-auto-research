/*
 * DingTalk Robot Notifier
 * ------------------------
 * 向钉钉自定义机器人 Webhook 发送告警消息。
 *
 * 特性：
 *   - 支持加签安全模式（HMAC-SHA256）
 *   - 支持 @指定手机号 / @所有人
 *   - 支持状态码过滤（仅 >= 阈值时告警）
 *   - 异步非阻塞，不影响主请求流程
 *   - 内置去重（相同错误在窗口期内仅通知一次）
 *   - 内置限流（钉钉单机器人每分钟上限 20 条，默认预留 18 条）
 *   - ActionCard 消息格式，视觉层级清晰
 *
 * 环境变量（AGENT_GATEWAY_ 前缀规范）：
 *   AGENT_GATEWAY_ALERT_ENABLED              是否启用告警（"true" 启用）
 *   AGENT_GATEWAY_DINGTALK_WEBHOOK_URL       钉钉机器人 Webhook 地址（必填）
 *   AGENT_GATEWAY_DINGTALK_SECRET            加签密钥（启用加签时必填）
 *   AGENT_GATEWAY_DINGTALK_AT_MOBILES        @提醒的手机号，逗号分隔
 *   AGENT_GATEWAY_DINGTALK_IS_AT_ALL         是否 @所有人（"true" 启用）
 *   AGENT_GATEWAY_ALERT_MIN_STATUS_CODE      最小告警状态码（默认 500，仅 >= 此值才告警）
 *   AGENT_GATEWAY_ALERT_RATE_LIMIT_SECONDS   去重/限流窗口秒数（默认 60）
 *   AGENT_GATEWAY_DINGTALK_KEYWORD           关键词安全模式时必填
 *   AGENT_GATEWAY_DINGTALK_SERVICE_NAME      服务名称（默认 AutoResearch）
 *   AGENT_GATEWAY_DINGTALK_ENV               环境标识（默认取 NODE_ENV）
 */

const crypto = require("crypto");

// ---- 配置读取 ----
const WEBHOOK_URL = process.env.AGENT_GATEWAY_DINGTALK_WEBHOOK_URL || "";
const SECRET = process.env.AGENT_GATEWAY_DINGTALK_SECRET || "";
const SERVICE_NAME =
  process.env.AGENT_GATEWAY_DINGTALK_SERVICE_NAME || "AutoResearch";
const KEYWORD = process.env.AGENT_GATEWAY_DINGTALK_KEYWORD || "";
const ENV_LABEL =
  process.env.AGENT_GATEWAY_DINGTALK_ENV ||
  process.env.NODE_ENV ||
  "development";

const AT_MOBILES = (process.env.AGENT_GATEWAY_DINGTALK_AT_MOBILES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const IS_AT_ALL = process.env.AGENT_GATEWAY_DINGTALK_IS_AT_ALL === "true";

const MIN_STATUS_CODE = Number(
  process.env.AGENT_GATEWAY_ALERT_MIN_STATUS_CODE || 500
);

const RATE_LIMIT_SECONDS = Number(
  process.env.AGENT_GATEWAY_ALERT_RATE_LIMIT_SECONDS || 60
);
const RATE_LIMIT_MS = RATE_LIMIT_SECONDS * 1000;

// 钉钉硬限制：每分钟 20 条，预留安全余量
const HARD_RATE_MAX = 18;
const HARD_RATE_WINDOW_MS = 60 * 1000;

const ENABLED =
  process.env.AGENT_GATEWAY_ALERT_ENABLED === "true" && WEBHOOK_URL.length > 0;

// ---- 去重：相同错误签名在窗口期内只发一次 ----
const recentErrors = new Map();

// ---- 硬限流：滑动窗口 ----
let hardRateCount = 0;
let hardRateWindowStart = Date.now();

/**
 * 计算加签签名
 */
function computeSign(timestamp) {
  const stringToSign = `${timestamp}\n${SECRET}`;
  const hmac = crypto
    .createHmac("sha256", SECRET)
    .update(stringToSign)
    .digest("base64");
  return encodeURIComponent(hmac);
}

/**
 * 构建带签名的完整 Webhook URL
 */
function buildWebhookUrl() {
  if (!SECRET) return WEBHOOK_URL;
  const timestamp = Date.now();
  const signValue = computeSign(timestamp);
  const separator = WEBHOOK_URL.includes("?") ? "&" : "?";
  return `${WEBHOOK_URL}${separator}timestamp=${timestamp}&sign=${signValue}`;
}

/**
 * 去重检查：相同错误签名在窗口期内只允许发送一次
 */
function shouldDedup(errorKey) {
  const now = Date.now();
  for (const [key, time] of recentErrors) {
    if (now - time > RATE_LIMIT_MS) recentErrors.delete(key);
  }
  if (recentErrors.has(errorKey)) return true;
  recentErrors.set(errorKey, now);
  return false;
}

/**
 * 硬限流检查（防止超过钉钉每分钟 20 条限制）
 */
function checkHardRateLimit() {
  const now = Date.now();
  if (now - hardRateWindowStart > HARD_RATE_WINDOW_MS) {
    hardRateWindowStart = now;
    hardRateCount = 0;
  }
  hardRateCount += 1;
  return hardRateCount <= HARD_RATE_MAX;
}

/**
 * 状态码过滤：仅当 status >= MIN_STATUS_CODE 或无 status（非 HTTP 错误）时告警
 */
function shouldAlertByStatus(status) {
  if (!status || typeof status !== "number") return true;
  return status >= MIN_STATUS_CODE;
}

/**
 * 根据状态码返回对应严重级别标签
 */
function getSeverityLabel(status) {
  if (!status) return "TASK FAILED";
  if (status >= 500) return "SERVER ERROR";
  if (status >= 400) return "CLIENT ERROR";
  return "UNKNOWN";
}

/**
 * 格式化错误消息为钉钉 Markdown
 * 采用分组 + 分隔线 + emoji 图标，提升可读性
 */
function formatErrorMessage(info) {
  const time = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  const severity = getSeverityLabel(info.status);
  const routeStr = info.route
    ? `${info.method || "POST"} /api/${info.route}`
    : "N/A";

  const sections = [];

  // ---- 标题区 ----
  sections.push(`# \u26A0\uFE0F 接口异常告警`);
  sections.push("");
  sections.push(`> **${severity}** | ${SERVICE_NAME} \u00B7 ${ENV_LABEL}`);
  sections.push("");
  sections.push(`---`);
  sections.push("");

  // ---- 核心信息区（表格形式，键值对齐）----
  sections.push(`| 字段 | 值 |`);
  sections.push(`|:---:|:---|`);
  sections.push(`| 时间 | ${time} |`);
  sections.push(`| 环境 | ${ENV_LABEL} |`);
  sections.push(`| 服务 | ${SERVICE_NAME} |`);
  sections.push(`| 接口 | \`${routeStr}\` |`);
  if (info.status) {
    sections.push(`| 状态码 | **${info.status}** |`);
  }
  if (info.taskId) {
    sections.push(`| 任务ID | \`${info.taskId}\` |`);
  }
  if (info.extra) {
    sections.push(`| 附加 | ${info.extra} |`);
  }
  sections.push("");
  sections.push(`---`);
  sections.push("");

  // ---- 错误详情区 ----
  if (info.message) {
    const msg = String(info.message).slice(0, 500);
    sections.push(`### 错误信息`);
    sections.push("");
    sections.push(`> ${msg}`);
    sections.push("");
  }

  // ---- 堆栈区 ----
  if (info.errorStack) {
    const stack = String(info.errorStack)
      .split("\n")
      .slice(0, 5)
      .join("\n");
    sections.push(`<details><summary>堆栈信息</summary>`);
    sections.push("");
    sections.push("```");
    sections.push(stack);
    sections.push("```");
    sections.push("");
    sections.push(`</details>`);
    sections.push("");
  }

  // 关键词安全模式：确保消息包含关键词
  if (KEYWORD && !sections.join("\n").includes(KEYWORD)) {
    sections.push(`${KEYWORD}`);
  }

  // @手机号
  if (AT_MOBILES.length > 0 && !IS_AT_ALL) {
    const atText = AT_MOBILES.map((m) => `@${m}`).join(" ");
    sections.push("");
    sections.push(atText);
  }

  sections.push("");
  sections.push(`---`);
  sections.push("");
  sections.push(`<font color="#909399">\u{1F4E1} ${SERVICE_NAME} Monitor \u00B7 ${time}</font>`);

  return sections.join("\n");
}

/**
 * 构建钉钉消息请求体（含 @提醒）
 */
function buildRequestBody(title, message) {
  const body = {
    msgtype: "markdown",
    markdown: {
      title,
      text: message,
    },
  };

  if (IS_AT_ALL) {
    body.at = { isAtAll: true };
  } else if (AT_MOBILES.length > 0) {
    body.at = {
      atMobiles: AT_MOBILES,
      isAtAll: false,
    };
  }

  return body;
}

/**
 * 发送消息到钉钉 Webhook
 */
async function sendDingTalk(title, message) {
  const url = buildWebhookUrl();
  const body = buildRequestBody(title, message);

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const result = await resp.json().catch(() => ({}));
  if (result.errcode && result.errcode !== 0) {
    console.error(
      `[DingTalk] 发送失败: ${result.errmsg} (code: ${result.errcode})`
    );
  }
  return result;
}

/**
 * 发送错误告警（主入口）
 * 异步非阻塞：不会影响主请求流程，调用后立即返回。
 */
function notifyError(info) {
  if (!ENABLED) return;
  if (!shouldAlertByStatus(info.status)) return;

  const errorKey = `${info.route || ""}:${info.status || ""}:${(
    info.message || ""
  ).slice(0, 100)}`;
  if (shouldDedup(errorKey)) return;

  if (!checkHardRateLimit()) {
    console.warn("[DingTalk] 硬限流：每分钟通知数已达上限，跳过本次通知");
    return;
  }

  const message = formatErrorMessage(info);

  sendDingTalk("接口异常告警", message).catch((err) => {
    console.error(`[DingTalk] 通知异常: ${err.message}`);
  });
}

/**
 * 发送通用文本消息（用于非错误场景的通知）
 */
function notifyMessage(title, content) {
  if (!ENABLED) return;
  if (!checkHardRateLimit()) return;

  let text = content;
  if (KEYWORD && !text.includes(KEYWORD)) {
    text += `\n${KEYWORD}`;
  }

  if (AT_MOBILES.length > 0 && !IS_AT_ALL) {
    const atText = AT_MOBILES.map((m) => `@${m}`).join(" ");
    text += `\n${atText}`;
  }

  sendDingTalk(title, text).catch((err) => {
    console.error(`[DingTalk] 通知异常: ${err.message}`);
  });
}

module.exports = {
  notifyError,
  notifyMessage,
  sendDingTalk,
  formatErrorMessage,
  buildRequestBody,
  isDingTalkEnabled: () => ENABLED,
  getConfig: () => ({
    enabled: ENABLED,
    webhookConfigured: WEBHOOK_URL.length > 0,
    secretConfigured: SECRET.length > 0,
    atMobiles: AT_MOBILES,
    isAtAll: IS_AT_ALL,
    minStatusCode: MIN_STATUS_CODE,
    rateLimitSeconds: RATE_LIMIT_SECONDS,
    serviceName: SERVICE_NAME,
    envLabel: ENV_LABEL,
  }),
};
