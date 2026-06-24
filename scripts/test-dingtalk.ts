/*
 * 钉钉机器人告警测试脚本
 * 用法：bun run test:dingtalk
 *
 * 需要先在 .env 中配置 AGENT_GATEWAY_DINGTALK_WEBHOOK_URL 和 AGENT_GATEWAY_DINGTALK_SECRET。
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

// 手动加载 .env
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

const notifier = require("../functions/shared/dingtalkNotifier.cjs");

console.log("=== 钉钉机器人告警测试 ===\n");

const config = notifier.getConfig();

if (!config.enabled) {
  console.error("钉钉告警未启用。请在 .env 中配置 AGENT_GATEWAY_ALERT_ENABLED=true");
  console.error("当前配置：", JSON.stringify(config, null, 2));
  process.exit(1);
}

console.log("钉钉告警已启用");
console.log("  Webhook:", config.webhookConfigured ? "已配置" : "未配置");
console.log("  加签:", config.secretConfigured ? "已配置" : "未配置");
console.log("  @手机号:", config.atMobiles.length > 0 ? config.atMobiles.join(", ") : "无");
console.log("  @所有人:", config.isAtAll);
console.log("  最小告警状态码:", config.minStatusCode);
console.log("  去重窗口:", config.rateLimitSeconds + "s");
console.log("  服务名称:", config.serviceName);
console.log("  环境:", config.envLabel);
console.log("");

// 测试 1：模拟接口 500 错误告警（>= MIN_STATUS_CODE，会触发）
console.log("[测试 1] 发送模拟接口 500 错误告警（应触发）...");
const mockError = new Error("模拟：DeepSeek API 返回 503 Service Unavailable");
mockError.stack = [
  "Error: 模拟：DeepSeek API 返回 503 Service Unavailable",
  "    at callDeepSeekJson (functions/shared/deepseekRuntime.cjs:320:15)",
  "    at async generateResearchPlan (functions/shared/deepseekRuntime.cjs:523:12)",
  "    at async createApiHandler (functions/shared/deepseekRuntime.cjs:731:20)",
].join("\n");

notifier.notifyError({
  route: "generateResearchPlan",
  method: "POST",
  status: 500,
  message: mockError.message,
  errorStack: mockError.stack,
});

// 测试 2：模拟 429 错误（< MIN_STATUS_CODE=500，不会触发告警）
console.log("[测试 2] 模拟 429 限流错误（应被状态码过滤，不触发）...");
notifier.notifyError({
  route: "deepseek-chat",
  method: "POST",
  status: 429,
  message: "Rate limit exceeded. Please retry later.",
  extra: "model=deepseek-chat, duration=1200ms",
});
console.log("  -> 已跳过（状态码 429 < 500）");

// 测试 3：模拟异步任务失败告警（无状态码，始终触发）
console.log("[测试 3] 发送模拟异步任务失败告警（应触发）...");
notifier.notifyError({
  route: "generateProjectReport",
  method: "POST",
  message: "该项目暂无有效访谈或问卷记录。",
  taskId: "test-task-" + Date.now(),
  extra: "async-task-failed",
});

// 测试 4：发送通用通知消息
console.log("[测试 4] 发送通用通知消息...");
notifier.notifyMessage(
  "服务启动通知",
  `### 服务启动通知\n\n**服务**: ${config.serviceName}\n**环境**: ${config.envLabel}\n**时间**: ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}\n\n服务已成功启动，钉钉告警通道正常。`
);

console.log("\n所有测试消息已异步发送，请检查钉钉群消息。");
console.log("注意：");
console.log("  - 状态码 < 500 的错误不会告警");
console.log("  - 相同错误在 " + config.rateLimitSeconds + "s 内仅通知一次");
console.log("  - @提醒手机号:", config.atMobiles.length > 0 ? config.atMobiles.join(", ") : "无");

// 等待异步请求完成
setTimeout(() => {
  console.log("\n测试完成。");
  process.exit(0);
}, 3000);
