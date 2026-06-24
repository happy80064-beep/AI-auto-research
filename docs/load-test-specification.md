# AI-auto-research 压力测试规范与执行文档

文档版本：v1.0  
适用系统：AI-auto-research Bun HTTP Service  
最后更新：2026-06-18

## 1. 测试目标

### 1.1 测试目的

压力测试用于验证 AI-auto-research 服务在不同负载下的响应能力、稳定性和降级能力，具体目标如下：

- 验证 Bun 原生 HTTP 服务对普通接口的并发承载能力。
- 验证 LLM 接口在高并发下的限流、排队、缓存和降级机制。
- 定位服务性能拐点、瓶颈环节和外部依赖风险。
- 验证长时间运行时是否存在进程崩溃、内存泄漏或响应时间持续劣化。
- 为上线验收、容量规划和生产限流配置提供依据。

### 1.2 核心验收指标阈值

| 接口类型 | 指标 | 合格阈值 |
|---|---|---:|
| 普通接口 | 错误率 | `< 1%` |
| 普通接口 | P95 响应时长 | `< 1000 ms` |
| 普通接口 | 健康检查 QPS | 单实例 `>= 1000 QPS` |
| LLM 接口 | 高负载错误率 | `< 1%`，排队降级 `202` 不计为错误 |
| LLM 接口 | 缓存命中响应 P95 | `< 500 ms` |
| LLM 接口 | 未缓存真实生成首字节 | `< 2000 ms`，受 DeepSeek 账户与网络影响 |
| 稳定性 | 进程状态 | 无崩溃、无异常退出 |
| 稳定性 | 内存 | 长稳测试期间无持续不可回收增长 |

## 2. 测试环境

### 2.1 服务器配置要求

最低测试环境：

| 资源 | 要求 |
|---|---|
| CPU | 4 核及以上 |
| 内存 | 8 GB 及以上 |
| 运行时 | Bun 1.3.11 或兼容版本 |
| 网络 | 可访问 DeepSeek API |
| 操作系统 | Windows、Linux 或 macOS |

生产验收建议：

| 资源 | 要求 |
|---|---|
| CPU | 8 核及以上 |
| 内存 | 16 GB 及以上 |
| 网络 | 压测机与服务端分离，避免单机客户端瓶颈 |
| 监控 | CPU、内存、进程、网络、日志均可观测 |

### 2.2 服务部署方式

本地构建：

```bash
bun run build
```

启动 Bun 服务：

```bash
bun run server
```

默认服务地址：

```text
http://127.0.0.1:8080
```

### 2.3 压测工具选型

项目内置 Bun 压测脚本：

```text
scripts/load-test.ts
```

执行命令：

```bash
bun run test:load -- --url http://127.0.0.1:8080/health --requests 1000 --concurrency 1000
```

适用范围：

- 普通 HTTP 接口压测
- JSON POST 接口压测
- 限流降级验证
- 本地快速回归测试

生产级容量测试可结合 k6、wrk、autocannon 或云压测平台执行，但指标口径必须与本文档保持一致。

### 2.4 环境隔离规则

- 压测环境应与生产环境隔离。
- 不得对生产 DeepSeek 账户进行大规模无保护 LLM 生成压测。
- LLM 接口压测应区分“真实生成压测”和“限流降级压测”。
- 压测前应确认 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL` 配置正确。
- 压测期间不得同时进行构建、依赖安装或大规模数据迁移。

## 3. 性能指标定义

| 指标 | 定义 | 统计口径 |
|---|---|---|
| QPS/RPS | 每秒完成请求数 | `总请求数 / 总耗时秒数` |
| 平均响应时长 | 所有请求响应时长平均值 | 可选补充指标，主要以分位数为准 |
| P50 | 50% 请求低于该响应时长 | 对全部请求耗时排序后取第 50 百分位 |
| P95 | 95% 请求低于该响应时长 | 对全部请求耗时排序后取第 95 百分位 |
| P99 | 99% 请求低于该响应时长 | 对全部请求耗时排序后取第 99 百分位 |
| 错误率 | 失败请求占比 | `失败数 / 总请求数` |
| HTTP 状态码分布 | 各状态码数量 | 用于识别限流、降级和服务错误 |
| CPU 使用率 | 服务进程或主机 CPU 使用比例 | 压测期间峰值与均值均需记录 |
| 内存占用 | 服务进程工作集或 RSS | 记录压测前、峰值、压测后 |
| 首字节时间 | 从发起请求到收到首个响应字节 | 主要用于 SSE/LLM 流式接口 |

说明：

- `202` 在异步任务创建或限流排队降级场景下视为成功响应。
- `500`、连接失败、超时视为失败。
- LLM 接口真实生成耗时受 DeepSeek 账户、配额、网络和模型服务状态影响，需单独标注外部依赖状态。

## 4. 测试场景设计

## 4.1 基准性能测试

### 目的

验证单接口在低并发下的基础响应时长，为后续阶梯压测提供基线。

### 推荐接口

```text
GET /health
POST /api/analyzeTranscripts
```

### 推荐参数

| 参数 | 值 |
|---|---:|
| 请求数 | 100 |
| 并发数 | 1、5、10 |
| 运行轮次 | 每组至少 3 次 |

### 示例命令

```bash
bun run test:load -- --url http://127.0.0.1:8080/health --requests 100 --concurrency 10
```

## 4.2 阶梯并发测试

### 目的

逐步提升并发，定位服务性能拐点、最大承载量和错误率上升点。

### 推荐阶梯

```text
10 -> 50 -> 100 -> 500 -> 1000 -> 5000 -> 10000 -> 20000
```

### 示例命令

```bash
bun run test:load -- --url http://127.0.0.1:8080/health --requests 10000 --concurrency 1000
```

### 记录项

- 每阶梯 QPS/RPS
- P50/P95/P99
- 错误率
- 状态码分布
- CPU 与内存峰值

## 4.3 峰值流量测试

### 目的

模拟业务高峰突发流量，验证服务是否可以快速响应或优雅降级。

### 推荐参数

| 接口类型 | 请求数 | 并发数 |
|---|---:|---:|
| 普通接口 | 20000 | 20000 |
| LLM 路由 | 20000 | 20000 |

### 普通接口示例

```bash
bun run test:load -- --url http://127.0.0.1:8080/health --requests 20000 --concurrency 20000
```

### LLM 降级接口示例

```bash
bun run test:load -- \
  --url http://127.0.0.1:8080/api/analyzeTranscripts \
  --method POST \
  --requests 20000 \
  --concurrency 20000 \
  --body-file .tmp-analysis-payload.json
```

## 4.4 长稳测试

### 目的

验证服务在较长时间低压或中压运行下是否存在内存泄漏、响应时间持续劣化或进程异常。

### 推荐参数

| 参数 | 值 |
|---|---:|
| 持续时间 | 30 分钟、1 小时、4 小时 |
| 并发数 | 50、100、500 |
| 请求类型 | `/health` 与缓存命中的 LLM 接口 |

### 执行方式

当前内置脚本按请求数执行。长稳测试可通过循环方式执行：

```bash
for i in {1..60}; do
  bun run test:load -- --url http://127.0.0.1:8080/health --requests 1000 --concurrency 100
  sleep 30
done
```

Windows PowerShell 示例：

```powershell
1..60 | ForEach-Object {
  bun run test:load -- --url http://127.0.0.1:8080/health --requests 1000 --concurrency 100
  Start-Sleep -Seconds 30
}
```

## 4.5 限流降级验证

### 目的

验证高并发下 LLM 接口不会无限制放大到 DeepSeek API，并能返回缓存结果或排队降级状态。

### 预期结果

| 场景 | 预期状态 |
|---|---|
| 命中内存缓存 | `200`，`meta.cache=memory` |
| 命中 Firestore 缓存 | `200`，`meta.cache=firestore` |
| 超过 LLM QPS 且未命中缓存 | `202`，`meta.degraded=true`，`meta.reason=rate_limited` |
| DeepSeek 余额不足或外部错误 | 少量进入并发池的请求可能返回 `500` |

### 示例命令

```bash
cat > .tmp-analysis-payload.json <<'JSON'
{
  "data": {
    "transcripts": "这是一段用于压力测试的短文本。"
  }
}
JSON

bun run test:load -- \
  --url http://127.0.0.1:8080/api/analyzeTranscripts \
  --method POST \
  --requests 20000 \
  --concurrency 20000 \
  --body-file .tmp-analysis-payload.json
```

## 5. 压测脚本编写规范

### 5.1 参数规范

压测脚本应支持以下参数：

| 参数 | 必填 | 说明 |
|---|---:|---|
| `--url` | 是 | 目标 URL |
| `--requests` | 是 | 请求总数 |
| `--concurrency` | 是 | 并发数 |
| `--method` | 否 | `GET` 或 `POST`，默认 `GET` |
| `--body` | 否 | JSON 请求体字符串 |
| `--body-file` | 否 | JSON 请求体文件路径 |

### 5.2 输出规范

脚本输出必须为 JSON，至少包含：

- `url`
- `method`
- `requests`
- `concurrency`
- `success`
- `failed`
- `errorRate`
- `totalMs`
- `rps`
- `latencyMs.min`
- `latencyMs.p50`
- `latencyMs.p90`
- `latencyMs.p95`
- `latencyMs.p99`
- `latencyMs.max`
- `statusCounts`

### 5.3 可直接运行的示例脚本代码

项目已内置脚本：

```ts
type Method = "GET" | "POST";

interface Sample {
  ok: boolean;
  status: number;
  durationMs: number;
}

const started = performance.now();
const response = await fetch("http://127.0.0.1:8080/health");
await response.arrayBuffer();

const sample: Sample = {
  ok: response.ok,
  status: response.status,
  durationMs: performance.now() - started,
};

console.log(sample);
```

完整脚本以仓库中的 `scripts/load-test.ts` 为准。

## 6. 执行步骤与前置注意事项

### 6.1 前置检查

1. 安装依赖：

```bash
bun install
```

2. 构建项目：

```bash
bun run build
```

3. 配置环境变量：

```text
DEEPSEEK_API_KEY
DEEPSEEK_BASE_URL
DEEPSEEK_MODEL
CACHE_TTL_MS
LLM_MAX_CONCURRENCY
RATE_LIMIT_QPS
LLM_RATE_LIMIT_QPS
```

4. 启动服务：

```bash
bun run server
```

5. 健康检查：

```bash
curl http://127.0.0.1:8080/health
```

### 6.2 执行顺序

建议按以下顺序执行：

1. 健康检查。
2. 低并发基准测试。
3. 阶梯并发测试。
4. 峰值流量测试。
5. LLM 限流降级测试。
6. 长稳测试。
7. 压测后健康检查。
8. 汇总报告。

### 6.3 注意事项

- LLM 真实生成压测会产生 DeepSeek 调用成本，不建议直接进行 20000 次真实生成。
- 对 LLM 高并发场景，应优先验证限流与降级行为。
- 单机 20000 并发可能受到压测客户端本身限制，生产验收建议使用多台压测机。
- 压测期间应记录服务日志和外部 DeepSeek 错误信息。
- 若 DeepSeek 返回 `Insufficient Balance`，应将其标注为外部账户状态问题。

## 7. 压测报告标准模板

```markdown
# AI-auto-research 压测报告

## 1. 基本信息

- 测试日期：
- 测试人员：
- 服务版本：
- Git Commit：
- 运行时版本：
- 测试环境：
- 服务地址：
- DeepSeek 模型：

## 2. 测试结论

- 是否通过：
- 核心结论：
- 主要风险：

## 3. 环境信息

| 项目 | 配置 |
|---|---|
| CPU | |
| 内存 | |
| 操作系统 | |
| Bun 版本 | |
| 网络环境 | |
| 环境变量 | |

## 4. 测试场景与结果

| 场景 | 接口 | 请求数 | 并发数 | 成功数 | 失败数 | 错误率 | RPS | P50 | P95 | P99 | 状态码分布 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 基准测试 | | | | | | | | | | | |
| 阶梯测试 | | | | | | | | | | | |
| 峰值测试 | | | | | | | | | | | |
| 长稳测试 | | | | | | | | | | | |
| 限流降级 | | | | | | | | | | | |

## 5. 瓶颈分析

- 服务端瓶颈：
- 客户端瓶颈：
- 外部依赖瓶颈：
- 数据库瓶颈：

## 6. 优化建议

- 短期优化：
- 中期优化：
- 长期优化：

## 7. 附录

- 压测命令：
- 原始输出：
- 服务日志：
```

## 8. 性能验收标准

## 8.1 普通接口

适用接口：

```text
GET /health
GET /api/tasks/{id}
```

合格标准：

| 指标 | 标准 |
|---|---:|
| 错误率 | `< 1%` |
| P95 响应时长 | `< 1000 ms` |
| P99 响应时长 | `< 2000 ms` |
| 进程稳定性 | 无崩溃 |
| 健康检查 | 压测前后均返回 `ok=true` |

## 8.2 LLM 接口

适用接口：

```text
POST /api/generateResearchPlan
POST /api/refineResearchPlan
POST /api/analyzeTranscripts
POST /api/generateProjectReport
```

合格标准：

| 场景 | 指标 | 标准 |
|---|---|---:|
| 缓存命中 | P95 响应时长 | `< 500 ms` |
| SSE 流式生成 | 首字节时间 | `< 2000 ms` |
| 未缓存真实生成 | 错误率 | `< 1%`，外部 DeepSeek 余额或配额错误需单独标注 |
| 高并发限流 | 降级响应 | 返回 `202` 或缓存结果 |
| 高并发限流 | 服务稳定性 | 无崩溃，无内存异常 |
| 项目报告生成 | 响应模式 | 返回 `taskId`，通过任务接口轮询结果 |

## 8.3 数据库与缓存

| 指标 | 标准 |
|---|---:|
| 内存缓存命中 | 应直接返回结果 |
| Firestore 缓存命中 | 应回填内存缓存并返回结果 |
| Firestore 不可用 | 不影响主业务响应，仅降低缓存能力 |

## 8.4 不通过判定

出现以下任一情况视为不通过：

- 普通接口错误率 `>= 1%`。
- 服务进程崩溃或无法恢复。
- 压测后 `/health` 不可用。
- 高并发 LLM 请求绕过限流，持续放大到 DeepSeek API。
- 内存占用持续增长且无法回落，存在明显泄漏趋势。
