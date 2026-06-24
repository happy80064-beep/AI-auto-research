# AI-auto-research

AI 商业调研自动化工具，核心链路为：调研目标定义 -> DeepSeek 生成调研方案 -> 分发访谈/问卷 -> AI 分析转录 -> 生成洞察报告。

## 本地运行

**Prerequisites:** Bun

1. 安装依赖：
   `bun install`
2. 复制 `.env.example` 为 `.env.local`，配置 `DEEPSEEK_API_KEY`。
3. 启动前端开发环境：
   `bun run dev`
4. 构建生产产物：
   `bun run build`
5. 启动 Bun 后端服务：
   `bun run server`

## 核心环境变量

- `DEEPSEEK_API_KEY`: DeepSeek API Key，必填。
- `DEEPSEEK_BASE_URL`: DeepSeek Chat Completion base URL，默认 `https://api.deepseek.com`。
- `DEEPSEEK_MODEL`: 默认 `deepseek-chat`。
- `CACHE_TTL_MS`: LLM 内存/Firestore 缓存 TTL，默认 5 分钟。
- `LLM_MAX_CONCURRENCY`: LLM 并发池上限。
- `RATE_LIMIT_QPS` / `LLM_RATE_LIMIT_QPS`: 普通接口与 LLM 接口限流阈值。

## 钉钉机器人告警

当接口发生错误时（DeepSeek 调用失败、API 500、异步任务失败、SSE 流错误），系统会自动向钉钉群发送告警消息，并 @指定负责人，方便及时响应。

### 配置步骤

1. 在钉钉群中添加自定义机器人：群设置 → 智能群助手 → 添加机器人 → 自定义。
2. 安全设置选择一种（推荐"加签"）：
   - **加签**：记录 Secret，填入 `AGENT_GATEWAY_DINGTALK_SECRET`。
   - **关键词**：设置一个关键词（如 `告警`），填入 `AGENT_GATEWAY_DINGTALK_KEYWORD`。
3. 复制 Webhook 地址，填入 `AGENT_GATEWAY_DINGTALK_WEBHOOK_URL`。
4. 在 `.env` 中配置相关变量（参考 `.env.example`）。

### 钉钉相关环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `AGENT_GATEWAY_ALERT_ENABLED` | 是否启用告警 | false |
| `AGENT_GATEWAY_DINGTALK_WEBHOOK_URL` | 钉钉机器人 Webhook 地址 | （空） |
| `AGENT_GATEWAY_DINGTALK_SECRET` | 加签密钥 | （空，不签名） |
| `AGENT_GATEWAY_DINGTALK_AT_MOBILES` | @提醒手机号，逗号分隔 | （空） |
| `AGENT_GATEWAY_DINGTALK_IS_AT_ALL` | 是否 @所有人 | false |
| `AGENT_GATEWAY_ALERT_MIN_STATUS_CODE` | 最小告警状态码 | 500 |
| `AGENT_GATEWAY_ALERT_RATE_LIMIT_SECONDS` | 去重窗口（秒） | 60 |
| `AGENT_GATEWAY_DINGTALK_KEYWORD` | 关键词安全模式关键词 | （空） |
| `AGENT_GATEWAY_DINGTALK_SERVICE_NAME` | 服务名称 | AI-auto-research |
| `AGENT_GATEWAY_DINGTALK_ENV` | 环境标识 | 取 NODE_ENV |

### 告警触发场景

- **DeepSeek API 错误**：上游 LLM 返回 >= 500 状态码（429 等低于阈值的错误不告警）。
- **接口 500 错误**：路由处理器抛出未捕获异常。
- **异步任务失败**：`generateResearchPlan` / `generateProjectReport` 的后台任务执行失败。
- **SSE 流错误**：流式响应过程中发生异常。

### 特性

- **状态码过滤**：仅 >= `AGENT_GATEWAY_ALERT_MIN_STATUS_CODE` 的 HTTP 错误才告警。
- **@提醒**：支持 @指定手机号或 @所有人，确保负责人及时收到通知。
- **异步非阻塞**：告警发送不影响主请求流程。
- **去重**：相同错误在 `AGENT_GATEWAY_ALERT_RATE_LIMIT_SECONDS` 秒内仅通知一次。
- **硬限流**：每分钟最多 18 条，避免刷屏（钉钉硬限制 20 条/分钟）。

### 测试告警

```bash
# 配置好 .env 后运行测试脚本
bun run test:dingtalk
```
