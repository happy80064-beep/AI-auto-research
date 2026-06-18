# AutoResearch

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
