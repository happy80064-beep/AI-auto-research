# AI-auto-research 接口响应时长与 20000 并发压力测试报告

测试日期：2026-06-18  
测试环境：本机 Windows + Bun 1.3.11  
服务地址：http://127.0.0.1:8080  
服务进程：Bun 原生 HTTP 服务  
模型配置：`DEEPSEEK_MODEL=deepseek-chat`

## 1. 测试目的

本次测试重点验证：

- Bun 服务在 20000 并发请求下的响应时长与稳定性。
- LLM 接口在高并发下的限流、排队和降级能力。
- 压测后服务是否保持健康、无进程崩溃、无明显内存异常。

## 2. 测试工具

项目新增压测脚本：

```bash
bun run test:load -- --url <url> --requests <请求数> --concurrency <并发数>
```

脚本位置：

```text
scripts/load-test.ts
```

脚本输出指标包括：成功数、失败数、错误率、总耗时、RPS、p50/p90/p95/p99/max 响应时长、HTTP 状态码分布。

## 3. 服务基础健康检查

压测前后均执行：

```bash
curl http://127.0.0.1:8080/health
```

返回：

```json
{
  "ok": true,
  "service": "AI-auto-research",
  "runtime": "bun",
  "model": "deepseek-chat"
}
```

压测后进程仍存活，工作集内存约 43.5 MB，未观察到崩溃或内存异常。

## 4. 20000 并发基础接口压测

测试接口：

```text
GET /health
```

测试命令：

```bash
bun run test:load -- --url http://127.0.0.1:8080/health --requests 20000 --concurrency 20000
```

结果：

| 指标 | 数值 |
|---|---:|
| 请求数 | 20000 |
| 并发数 | 20000 |
| 成功数 | 20000 |
| 失败数 | 0 |
| 错误率 | 0.00% |
| 总耗时 | 962.34 ms |
| RPS | 20782.74 |
| 最小响应 | 63.86 ms |
| p50 | 466.42 ms |
| p90 | 796.69 ms |
| p95 | 845.28 ms |
| p99 | 883.18 ms |
| 最大响应 | 894.28 ms |
| 状态码分布 | 200: 20000 |

结论：Bun 原生 HTTP 服务在 20000 并发基础探活场景下稳定，错误率为 0，吞吐约 2.08 万 RPS。

## 5. 20000 并发 LLM 路由压力测试

测试接口：

```text
POST /api/analyzeTranscripts
```

测试载荷：

```json
{
  "data": {
    "transcripts": "这是一段用于压力测试的短文本。"
  }
}
```

测试命令：

```bash
bun run test:load -- \
  --url http://127.0.0.1:8080/api/analyzeTranscripts \
  --method POST \
  --requests 20000 \
  --concurrency 20000 \
  --body-file .tmp-analysis-payload.json
```

结果：

| 指标 | 数值 |
|---|---:|
| 请求数 | 20000 |
| 并发数 | 20000 |
| 成功数 | 19984 |
| 失败数 | 16 |
| 错误率 | 0.08% |
| 总耗时 | 1844.99 ms |
| RPS | 10840.14 |
| 最小响应 | 93.69 ms |
| p50 | 843.75 ms |
| p90 | 1447.82 ms |
| p95 | 1522.51 ms |
| p99 | 1577.49 ms |
| 最大响应 | 1790.60 ms |
| 状态码分布 | 202: 19984, 500: 16 |

说明：

- `202` 表示高负载下接口进入排队降级状态，服务没有继续向 DeepSeek 无限制放大请求。
- `500` 来自最先进入 LLM 并发池的真实 DeepSeek 请求，DeepSeek 返回 `Insufficient Balance`，属于外部账户余额不足，不是本地服务崩溃。
- 在外部 DeepSeek 余额不足的情况下，服务整体错误率仍为 0.08%，低于 1%。

## 6. DeepSeek 真实业务调用检查

对 `POST /api/generateResearchPlan` 做单次真实调用时，服务成功连通 DeepSeek，但 DeepSeek 返回：

```text
Insufficient Balance
```

结论：`DEEPSEEK_API_KEY` 已被服务读取，外网访问已打通；当前无法完成真实推理成功样本，原因是 DeepSeek 账户余额不足。补足余额后，可复用本报告中的命令继续验证真实 LLM 首字节和端到端耗时。

## 7. 总体结论

- 基础接口 20000 并发压测通过，0 错误，服务稳定。
- LLM 路由 20000 并发压测通过稳定性目标，错误率 0.08%，未发生进程崩溃。
- 高并发下 LLM 路由可以返回 202 排队降级状态，避免大量请求直接打穿 DeepSeek API。
- 真实 DeepSeek 推理未能完成成功样本，阻塞原因是外部账户余额不足。

## 8. 后续建议

- DeepSeek 账户补足余额后，补测 10 到 50 并发真实 LLM 生成耗时，重点记录首字节、p95、缓存命中延迟。
- 生产环境建议按实际 DeepSeek 配额调整 `LLM_MAX_CONCURRENCY` 与 `LLM_RATE_LIMIT_QPS`。
- 若需要长期 20000 级并发，应将服务部署到生产规格机器，并使用专业压测工具从多台压测机发起，避免单机客户端成为瓶颈。
