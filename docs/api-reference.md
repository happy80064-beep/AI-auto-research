# AI-auto-research API Reference

文档版本：v1.0  
适用系统：AI-auto-research Bun HTTP Service / Firebase Functions API  
最后更新：2026-06-18

## 1. 文档概述

### 1.1 文档目的

本文档用于说明 AI-auto-research 后端 HTTP API 的接口规范、请求参数、响应结构、错误码与调用示例，供前端开发、后端维护、外部系统对接、测试验收与运维排障使用。

### 1.2 适用范围

本文档覆盖当前源码中真实暴露的后端接口：

- 健康检查接口
- 调研方案生成接口
- 调研方案优化接口
- 转录文本分析接口
- 项目级报告生成接口
- 异步任务状态查询接口

本文档不包含前端页面路由、Firestore 客户端 SDK 读写函数、静态资源托管路径。

### 1.3 读者对象

- 前端工程师
- 后端工程师
- 测试工程师
- 外部系统对接方
- 运维与性能验收人员

### 1.4 版本说明

当前版本基于 Bun 原生 HTTP 服务与 Firebase Functions 共享业务处理逻辑编写。核心 LLM 能力基于 DeepSeek Chat Completion，模型默认值为 `deepseek-chat`。

## 2. 接口总览

### 2.1 Base URL

本地 Bun 服务：

```text
http://127.0.0.1:8080
```

同源生产部署：

```text
https://<your-domain>
```

Firebase Functions 直连备用地址：

```text
https://us-central1-gen-lang-client-0856016385.cloudfunctions.net
```

### 2.2 通信协议

- 协议：HTTP/HTTPS
- 默认请求格式：JSON
- 默认响应格式：JSON
- 流式响应格式：Server-Sent Events，`text/event-stream`

### 2.3 统一 Content-Type

普通 JSON 请求：

```http
Content-Type: application/json
```

SSE 流式请求：

```http
Content-Type: application/json
Accept: text/event-stream
```

### 2.4 CORS 约定

当前服务统一返回：

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Allow-Methods: GET, POST, OPTIONS
```

### 2.5 全局响应结构

成功响应：

```json
{
  "data": {}
}
```

带元信息的成功响应：

```json
{
  "data": {},
  "meta": {
    "cache": "miss"
  }
}
```

错误响应：

```json
{
  "error": {
    "message": "Error message"
  }
}
```

限流降级响应：

```json
{
  "data": {
    "status": "queued",
    "message": "当前请求量较高，服务已进入排队降级状态，请稍后重试。",
    "queue": {
      "active": 4,
      "waiting": 12
    }
  },
  "meta": {
    "degraded": true,
    "reason": "rate_limited"
  }
}
```

### 2.6 缓存元信息

LLM 业务接口可能返回以下缓存状态：

| 字段 | 类型 | 说明 |
|---|---|---|
| `meta.cache` | string | 取值为 `memory`、`firestore`、`miss` |
| `meta.degraded` | boolean | 是否为高负载降级响应 |
| `meta.reason` | string | 降级原因，当前可见值为 `rate_limited` |

## 3. 鉴权说明

### 3.1 当前鉴权现状

当前 Bun HTTP 接口与 Firebase Functions HTTP 接口未实现业务侧用户鉴权。请求不要求携带登录态、API Token 或签名。

DeepSeek 访问密钥仅在服务端通过环境变量读取：

```text
DEEPSEEK_API_KEY
DEEPSEEK_BASE_URL
DEEPSEEK_MODEL
```

客户端不得直接持有 DeepSeek 密钥。

### 3.2 生产环境鉴权扩展建议

生产环境建议增加以下能力：

- 对管理端接口增加 Firebase Auth、JWT 或企业 SSO 鉴权。
- 对外部系统调用增加 API Key 与 HMAC 签名。
- 对高价值 LLM 接口增加调用方配额、租户级限流与审计日志。
- 将 `Authorization` Header 纳入统一鉴权中间件。
- 对 Firestore 会话读写增加用户或租户维度授权校验。

## 4. 接口明细

## 4.1 健康检查

### 接口名称

服务健康检查

### 业务功能

用于探测 Bun HTTP 服务是否存活，返回运行时、服务名、模型配置和服务器时间。

### 请求方法与路径

```http
GET /health
```

### Header 参数

无必填 Header。

| 字段名 | 类型 | 必填 | 说明 | 示例 |
|---|---|---:|---|---|
| `Accept` | string | 否 | 客户端期望响应类型 | `application/json` |

### 请求体字段

无请求体。

### 成功响应字段

| 字段名 | 类型 | 说明 |
|---|---|---|
| `ok` | boolean | 服务是否健康 |
| `service` | string | 服务名称，固定为 `AI-auto-research` |
| `runtime` | string | 运行时，当前为 `bun` |
| `model` | string | 当前模型名，默认 `deepseek-chat` |
| `time` | number | 服务端时间戳，单位毫秒 |

### 成功响应示例

```json
{
  "ok": true,
  "service": "AI-auto-research",
  "runtime": "bun",
  "model": "deepseek-chat",
  "time": 1781754307800
}
```

### 错误响应

该接口正常情况下不依赖外部服务。若服务进程不可用，客户端会收到连接失败或网关错误。

### curl 示例

```bash
curl -X GET "http://127.0.0.1:8080/health"
```

## 4.2 生成调研方案

### 接口名称

生成调研方案

### 业务功能

根据调研目标、用户画像、行业、执行方式与题目数量，调用 DeepSeek 生成 `ResearchPlan`。系统会自动追加身份确认问题，并补充默认 `voiceSettings`。

### 请求方法与路径

普通 JSON：

```http
POST /api/generateResearchPlan
```

SSE 流式：

```http
POST /api/generateResearchPlan?stream=1
```

### Header 参数

| 字段名 | 类型 | 必填 | 说明 | 示例 |
|---|---|---:|---|---|
| `Content-Type` | string | 是 | 请求体类型 | `application/json` |
| `Accept` | string | 否 | 设置为 `text/event-stream` 时启用 SSE | `text/event-stream` |

### 请求体字段

服务端兼容两种载荷形式：

```json
{
  "data": {
    "objectType": "潜在用户"
  }
}
```

或直接提交 `ResearchContext` 对象。

| 字段名 | 类型 | 必填 | 取值范围 | 示例值 | 说明 |
|---|---|---:|---|---|---|
| `data.objectType` | string | 是 | 任意非空字符串 | `潜在用户` | 调研对象类型 |
| `data.industry` | string | 是 | 任意字符串 | `SaaS 企业服务` | 行业或业务场景 |
| `data.demographics` | string | 是 | 任意字符串 | `25-35 岁，一线城市` | 基础属性 |
| `data.userPersona` | string | 是 | 任意字符串 | `关注效率和成本` | 用户画像描述 |
| `data.objectives` | string | 是 | 任意字符串 | `了解采购决策链路` | 调研目标 |
| `data.method` | string | 是 | `voice`、`questionnaire` | `questionnaire` | 执行方式 |
| `data.questionCount` | number | 是 | 正整数 | `5` | 期望题目数量 |

### 成功响应字段

| 字段名 | 类型 | 说明 |
|---|---|---|
| `data.title` | string | 调研计划标题 |
| `data.logicOutline` | string | 调研逻辑大纲 |
| `data.analysisFramework` | string | 分析体系 |
| `data.systemInstruction` | string | AI 访谈或问卷系统设定 |
| `data.questions` | Question[] | 问题列表 |
| `data.voiceSettings` | VoiceSettings | 语音设置 |
| `meta.cache` | string | 缓存命中状态，可能为 `memory`、`firestore`、`miss` |

### 成功响应示例

```json
{
  "data": {
    "title": "SaaS 企业服务采购决策调研",
    "logicOutline": "围绕需求识别、试用评估、预算审批、最终采购进行分层访谈。",
    "analysisFramework": "从采购动机、决策角色、预算敏感度、产品体验和阻碍因素进行分析。",
    "systemInstruction": "你是 InsightFlow AI 访谈专家，请自然开场并围绕采购决策逐步追问。",
    "questions": [
      {
        "id": "id_job",
        "text": "为了更好地了解您，请问您的职业是什么？",
        "type": "open",
        "intent": "身份确认-职业"
      },
      {
        "id": "q_1",
        "text": "您最近一次参与企业软件采购时，最早的需求是如何被提出的？",
        "type": "open",
        "intent": "了解需求触发场景"
      }
    ],
    "voiceSettings": {
      "gender": "female",
      "language": "zh",
      "tone": "干练女声",
      "voiceName": "Zephyr"
    }
  },
  "meta": {
    "cache": "miss"
  }
}
```

### SSE 响应事件

| event | data 说明 |
|---|---|
| `status` | 队列状态或完成状态 |
| `result` | 完整 `ResearchPlan` |
| `error` | `{ "message": string }` |

SSE 示例：

```text
event: status
data: {"status":"queued","active":0,"waiting":0}

event: result
data: {"title":"...","logicOutline":"...","analysisFramework":"...","systemInstruction":"...","questions":[],"voiceSettings":{}}
```

### 错误响应

| HTTP 状态码 | 错误信息 | 触发场景 |
|---:|---|---|
| 202 | `status=queued` | LLM 接口超过 IP 粒度限流阈值且未命中缓存 |
| 404 | `API route not found` | 路径错误 |
| 405 | `Method not allowed` | 使用非 POST 方法 |
| 500 | `DEEPSEEK_API_KEY is not set` | 服务端未配置 DeepSeek Key |
| 500 | DeepSeek 返回的错误内容 | DeepSeek 请求失败、余额不足或返回格式异常 |

### curl 示例

```bash
curl -X POST "http://127.0.0.1:8080/api/generateResearchPlan" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "objectType": "潜在用户",
      "industry": "SaaS 企业服务",
      "demographics": "25-35 岁，一线城市，参与软件采购",
      "userPersona": "关注效率和成本，倾向先试用再采购",
      "objectives": "了解企业软件采购决策链路和主要顾虑",
      "method": "questionnaire",
      "questionCount": 5
    }
  }'
```

SSE 示例：

```bash
curl -N -X POST "http://127.0.0.1:8080/api/generateResearchPlan?stream=1" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "data": {
      "objectType": "潜在用户",
      "industry": "SaaS 企业服务",
      "demographics": "25-35 岁",
      "userPersona": "关注效率和成本",
      "objectives": "了解采购决策链路",
      "method": "questionnaire",
      "questionCount": 5
    }
  }'
```

## 4.3 优化调研方案

### 接口名称

优化调研方案

### 业务功能

根据用户输入的优化指令，对当前 `ResearchPlan` 进行调整。服务端保留身份确认题和原 `voiceSettings`。

### 请求方法与路径

普通 JSON：

```http
POST /api/refineResearchPlan
```

SSE 流式：

```http
POST /api/refineResearchPlan?stream=1
```

### Header 参数

| 字段名 | 类型 | 必填 | 说明 | 示例 |
|---|---|---:|---|---|
| `Content-Type` | string | 是 | 请求体类型 | `application/json` |
| `Accept` | string | 否 | 设置为 `text/event-stream` 时启用 SSE | `text/event-stream` |

### 请求体字段

| 字段名 | 类型 | 必填 | 取值范围 | 示例值 | 说明 |
|---|---|---:|---|---|---|
| `data.currentPlan` | ResearchPlan | 是 | 合法 `ResearchPlan` | `{ "title": "..." }` | 当前调研方案 |
| `data.refineInstructions` | string | 是 | 任意字符串 | `减少问题数量，语气更专业` | 优化指令 |

### 成功响应字段

返回结构同 `ResearchPlan`。

### 成功响应示例

```json
{
  "data": {
    "title": "SaaS 企业服务采购决策调研",
    "logicOutline": "优化后聚焦需求触发、试用评估与预算审批。",
    "analysisFramework": "按决策链路、阻碍因素和价值感知分析。",
    "systemInstruction": "你是 InsightFlow AI 访谈专家，请保持专业、自然的追问。",
    "questions": [
      {
        "id": "id_job",
        "text": "为了更好地了解您，请问您的职业是什么？",
        "type": "open",
        "intent": "身份确认-职业"
      },
      {
        "id": "q_1",
        "text": "在采购企业软件时，您最关注哪些投入产出指标？",
        "type": "open",
        "intent": "识别采购评估标准"
      }
    ],
    "voiceSettings": {
      "gender": "female",
      "language": "zh",
      "tone": "干练女声",
      "voiceName": "Zephyr"
    }
  },
  "meta": {
    "cache": "miss"
  }
}
```

### 错误响应

| HTTP 状态码 | 错误信息 | 触发场景 |
|---:|---|---|
| 202 | `status=queued` | LLM 接口超过 IP 粒度限流阈值且未命中缓存 |
| 404 | `API route not found` | 路径错误 |
| 405 | `Method not allowed` | 使用非 POST 方法 |
| 500 | `Invalid ResearchPlan` | DeepSeek 返回结构无法校验为 `ResearchPlan` |
| 500 | DeepSeek 返回的错误内容 | DeepSeek 请求失败 |

### curl 示例

```bash
curl -X POST "http://127.0.0.1:8080/api/refineResearchPlan" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "currentPlan": {
        "title": "SaaS 企业服务采购决策调研",
        "logicOutline": "围绕采购决策链路展开。",
        "analysisFramework": "从需求、预算、角色、风险分析。",
        "systemInstruction": "你是 InsightFlow AI 访谈专家。",
        "questions": [
          {
            "id": "q_1",
            "text": "您如何发现企业软件采购需求？",
            "type": "open",
            "intent": "了解需求来源"
          }
        ],
        "voiceSettings": {
          "gender": "female",
          "language": "zh",
          "tone": "干练女声",
          "voiceName": "Zephyr"
        }
      },
      "refineInstructions": "减少问题数量，并让语气更适合高管访谈"
    }
  }'
```

## 4.4 分析转录文本

### 接口名称

转录文本分析

### 业务功能

分析访谈或问卷转录文本，输出情绪分布、关键词、主题和 Markdown 摘要。

### 请求方法与路径

普通 JSON：

```http
POST /api/analyzeTranscripts
```

SSE 流式：

```http
POST /api/analyzeTranscripts?stream=1
```

### Header 参数

| 字段名 | 类型 | 必填 | 说明 | 示例 |
|---|---|---:|---|---|
| `Content-Type` | string | 是 | 请求体类型 | `application/json` |
| `Accept` | string | 否 | 设置为 `text/event-stream` 时启用 SSE | `text/event-stream` |

### 请求体字段

| 字段名 | 类型 | 必填 | 取值范围 | 示例值 | 说明 |
|---|---|---:|---|---|---|
| `data.transcripts` | string | 是 | 任意字符串 | `用户：我主要关注成本...` | 访谈或问卷转录文本 |

### 成功响应字段

| 字段名 | 类型 | 说明 |
|---|---|---|
| `data.sentiment` | object[] | 情绪分布 |
| `data.sentiment[].name` | string | 情绪名称 |
| `data.sentiment[].value` | number | 情绪占比或权重 |
| `data.sentiment[].color` | string | 图表颜色 |
| `data.keywords` | object[] | 高频关键词 |
| `data.keywords[].word` | string | 关键词 |
| `data.keywords[].count` | number | 出现次数或权重 |
| `data.themes` | object[] | 主题分布 |
| `data.themes[].topic` | string | 主题 |
| `data.themes[].count` | number | 主题次数或权重 |
| `data.summary` | string | Markdown 摘要 |

### 成功响应示例

```json
{
  "data": {
    "sentiment": [
      {
        "name": "积极",
        "value": 45,
        "color": "#34C759"
      },
      {
        "name": "中性",
        "value": 40,
        "color": "#007AFF"
      },
      {
        "name": "消极",
        "value": 15,
        "color": "#FF3B30"
      }
    ],
    "keywords": [
      {
        "word": "成本",
        "count": 8
      }
    ],
    "themes": [
      {
        "topic": "预算审批",
        "count": 5
      }
    ],
    "summary": "### 核心洞察\n用户对成本、试用体验和审批周期高度敏感。"
  },
  "meta": {
    "cache": "miss"
  }
}
```

### 错误响应

| HTTP 状态码 | 错误信息 | 触发场景 |
|---:|---|---|
| 202 | `status=queued` | LLM 接口超过 IP 粒度限流阈值且未命中缓存 |
| 404 | `API route not found` | 路径错误 |
| 405 | `Method not allowed` | 使用非 POST 方法 |
| 500 | `Invalid AnalysisResult` | DeepSeek 返回结构无法校验为 `AnalysisResult` |
| 500 | DeepSeek 返回的错误内容 | DeepSeek 请求失败 |

### curl 示例

```bash
curl -X POST "http://127.0.0.1:8080/api/analyzeTranscripts" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "transcripts": "用户：我们采购企业软件时，最担心实施成本和后续维护成本。"
    }
  }'
```

## 4.5 生成项目级报告

### 接口名称

项目级报告生成

### 业务功能

根据项目标题和多场会话数据生成 `ProjectReport`。该接口在 Bun API 中默认以异步任务形式返回 `taskId`，客户端需通过任务状态接口轮询结果。

### 请求方法与路径

```http
POST /api/generateProjectReport
```

说明：该接口在当前代码中默认进入异步任务流程，即使未显式传入 `async=1`，也会返回 `202` 与任务 ID。

### Header 参数

| 字段名 | 类型 | 必填 | 说明 | 示例 |
|---|---|---:|---|---|
| `Content-Type` | string | 是 | 请求体类型 | `application/json` |

### 请求体字段

| 字段名 | 类型 | 必填 | 取值范围 | 示例值 | 说明 |
|---|---|---:|---|---|---|
| `data.projectTitle` | string | 是 | 任意字符串 | `SaaS 采购调研` | 项目标题 |
| `data.sessions` | SessionData[] | 是 | 数组 | `[]` | 会话数据。至少应包含带 `transcript` 或 `analysis` 的会话 |

### 成功响应字段

异步任务创建成功：

| 字段名 | 类型 | 说明 |
|---|---|---|
| `data.taskId` | string | 异步任务 ID |
| `data.status` | string | 初始任务状态，通常为 `queued` |

任务完成后，通过 `/api/tasks/{id}` 获取 `ProjectReport`。

### 成功响应示例

```json
{
  "data": {
    "taskId": "3c6f5b6d-1f25-4eb1-8ef8-3f049a8d7f18",
    "status": "queued"
  }
}
```

### 任务结果示例

```json
{
  "data": {
    "id": "3c6f5b6d-1f25-4eb1-8ef8-3f049a8d7f18",
    "kind": "generateProjectReport",
    "status": "completed",
    "createdAt": 1781754000000,
    "updatedAt": 1781754010000,
    "result": {
      "title": "SaaS 采购调研洞察报告",
      "generatedAt": 1781754010000,
      "chapters": [
        {
          "title": "总体发现",
          "content": "### 核心结论\n用户高度关注成本与实施风险。",
          "keyTakeaways": [
            "采购决策受预算和试用体验共同影响"
          ]
        }
      ],
      "participantProfiles": [
        {
          "sessionIndex": 1,
          "pseudonym": "受访者1",
          "roleAndAge": "企业软件采购参与者",
          "occupation": "运营经理",
          "tags": [
            "成本敏感"
          ],
          "brief": "关注实施成本与维护风险。"
        }
      ]
    },
    "error": null,
    "cache": "miss"
  }
}
```

### 错误响应

| HTTP 状态码 | 错误信息 | 触发场景 |
|---:|---|---|
| 202 | `taskId` | 异步任务已创建，不代表报告已生成完成 |
| 404 | `API route not found` | 路径错误 |
| 405 | `Method not allowed` | 使用非 POST 方法 |
| 500 | `该项目暂无有效访谈或问卷记录。` | `sessions` 中没有可分析的 `transcript` 或 `analysis` |
| 500 | DeepSeek 返回的错误内容 | DeepSeek 请求失败 |

### curl 示例

```bash
curl -X POST "http://127.0.0.1:8080/api/generateProjectReport" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "projectTitle": "SaaS 采购调研",
      "sessions": [
        {
          "id": "s_001",
          "plan": {
            "title": "SaaS 采购调研",
            "logicOutline": "围绕采购决策链路展开。",
            "analysisFramework": "按需求、预算、角色分析。",
            "systemInstruction": "你是 InsightFlow AI 访谈专家。",
            "questions": []
          },
          "context": {
            "objectType": "潜在用户",
            "industry": "SaaS 企业服务",
            "demographics": "25-35 岁",
            "userPersona": "参与软件采购",
            "objectives": "了解采购决策链路",
            "method": "questionnaire",
            "questionCount": 5
          },
          "transcript": "用户：我们采购时最关注成本、实施周期和售后支持。",
          "timestamp": 1781754000000
        }
      ]
    }
  }'
```

## 4.6 查询异步任务状态

### 接口名称

异步任务状态查询

### 业务功能

查询异步任务执行状态，主要用于项目级报告生成结果轮询。

### 请求方法与路径

Bun HTTP 服务：

```http
GET /api/tasks/{id}
```

Firebase Functions 备用接口：

```http
GET /getTaskStatus?id={id}
```

### Header 参数

无必填 Header。

### 路径参数

| 字段名 | 类型 | 必填 | 示例值 | 说明 |
|---|---|---:|---|---|
| `id` | string | 是 | `3c6f5b6d-1f25-4eb1-8ef8-3f049a8d7f18` | 异步任务 ID |

### 成功响应字段

| 字段名 | 类型 | 说明 |
|---|---|---|
| `data.id` | string | 任务 ID |
| `data.kind` | string | 任务类型，当前为 `generateProjectReport` |
| `data.status` | string | `queued`、`running`、`completed`、`failed` |
| `data.createdAt` | number | 创建时间戳 |
| `data.updatedAt` | number | 更新时间戳 |
| `data.result` | ProjectReport \| null | 完成后的报告结果 |
| `data.error` | string \| null | 失败原因 |
| `data.cache` | string | 缓存状态，任务完成后可能存在 |

### 成功响应示例

```json
{
  "data": {
    "id": "3c6f5b6d-1f25-4eb1-8ef8-3f049a8d7f18",
    "kind": "generateProjectReport",
    "status": "running",
    "createdAt": 1781754000000,
    "updatedAt": 1781754001000,
    "result": null,
    "error": null
  }
}
```

### 错误响应

| HTTP 状态码 | 错误信息 | 触发场景 |
|---:|---|---|
| 400 | `Missing task id` | Firebase Functions `getTaskStatus` 未传入 `id` |
| 404 | `Task not found` | 任务 ID 不存在或已超过任务 TTL 被清理 |
| 405 | `Method not allowed` | 对 `/api/tasks/{id}` 使用非 GET 方法 |

### curl 示例

```bash
curl -X GET "http://127.0.0.1:8080/api/tasks/3c6f5b6d-1f25-4eb1-8ef8-3f049a8d7f18"
```

Firebase Functions 备用示例：

```bash
curl -X GET "https://us-central1-gen-lang-client-0856016385.cloudfunctions.net/getTaskStatus?id=3c6f5b6d-1f25-4eb1-8ef8-3f049a8d7f18"
```

## 5. 核心数据结构字典

## 5.1 ResearchContext

| 字段名 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `objectType` | string | 是 | 调研对象类型 |
| `industry` | string | 是 | 行业或业务场景 |
| `demographics` | string | 是 | 年龄、性别、教育等基础属性描述 |
| `userPersona` | string | 是 | 用户画像详细描述 |
| `objectives` | string | 是 | 调研目标 |
| `method` | string | 是 | `voice` 或 `questionnaire` |
| `questionCount` | number | 是 | 题目数量 |

## 5.2 Question

| 字段名 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `id` | string | 是 | 问题唯一 ID |
| `text` | string | 是 | 问题文本 |
| `type` | string | 是 | `open`、`scale`、`choice` |
| `intent` | string | 是 | 问题研究意图 |
| `scaleLabels` | string[] | 否 | 量表题标签 |

## 5.3 VoiceSettings

| 字段名 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `gender` | string | 是 | `male` 或 `female` |
| `language` | string | 是 | `zh` 或 `en` |
| `tone` | string | 是 | UI 声音风格标签 |
| `voiceName` | string | 是 | 语音名称 |

## 5.4 ResearchPlan

| 字段名 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `title` | string | 是 | 调研计划标题 |
| `logicOutline` | string | 是 | 调研逻辑大纲 |
| `analysisFramework` | string | 是 | 分析体系 |
| `systemInstruction` | string | 是 | AI Agent 系统设定 |
| `questions` | Question[] | 是 | 问题列表 |
| `voiceSettings` | VoiceSettings | 否 | 语音配置 |

## 5.5 AnalysisResult

| 字段名 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `sentiment` | object[] | 是 | 情绪分布 |
| `sentiment[].name` | string | 是 | 情绪名称 |
| `sentiment[].value` | number | 是 | 情绪值 |
| `sentiment[].color` | string | 是 | 图表颜色 |
| `keywords` | object[] | 是 | 关键词列表 |
| `keywords[].word` | string | 是 | 关键词 |
| `keywords[].count` | number | 是 | 次数或权重 |
| `themes` | object[] | 是 | 主题列表 |
| `themes[].topic` | string | 是 | 主题名称 |
| `themes[].count` | number | 是 | 次数或权重 |
| `summary` | string | 是 | Markdown 摘要 |

## 5.6 ParticipantProfile

| 字段名 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `sessionIndex` | number | 是 | 会话序号，从 1 开始 |
| `pseudonym` | string | 是 | 受访者化名 |
| `roleAndAge` | string | 是 | 角色与年龄描述 |
| `occupation` | string | 是 | 职业 |
| `tags` | string[] | 是 | 受访者标签 |
| `brief` | string | 是 | 简要画像 |

## 5.7 ProjectReport

| 字段名 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `title` | string | 是 | 报告标题 |
| `generatedAt` | number | 是 | 生成时间戳 |
| `chapters` | object[] | 是 | 报告章节 |
| `chapters[].title` | string | 是 | 章节标题 |
| `chapters[].content` | string | 是 | Markdown 内容 |
| `chapters[].keyTakeaways` | string[] | 否 | 关键结论 |
| `participantProfiles` | ParticipantProfile[] | 否 | 参与者画像 |

## 5.8 SessionData

| 字段名 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `id` | string | 是 | 会话 ID |
| `plan` | ResearchPlan | 是 | 调研方案 |
| `context` | ResearchContext | 是 | 调研上下文 |
| `transcript` | string | 否 | 转录文本 |
| `analysis` | AnalysisResult | 否 | 分析结果 |
| `timestamp` | number | 是 | 时间戳 |

## 6. 通用错误码对照表

| HTTP 状态码 | 错误结构 | 说明 |
|---:|---|---|
| 202 | `{ "data": { "status": "queued" } }` | 请求已进入排队或异步任务已创建 |
| 204 | 空响应 | CORS 预检请求成功 |
| 400 | `{ "error": { "message": "Missing task id" } }` | 缺少必要查询参数 |
| 404 | `{ "error": { "message": "API route not found" } }` | API 路径不存在 |
| 404 | `{ "error": { "message": "Task not found" } }` | 异步任务不存在或已过期 |
| 405 | `{ "error": { "message": "Method not allowed" } }` | 请求方法不被支持 |
| 500 | `{ "error": { "message": "DEEPSEEK_API_KEY is not set" } }` | DeepSeek 密钥未配置 |
| 500 | `{ "error": { "message": "<DeepSeek error>" } }` | DeepSeek API 调用失败 |
| 500 | `{ "error": { "message": "Invalid ResearchPlan" } }` | LLM 返回结构不符合 `ResearchPlan` |
| 500 | `{ "error": { "message": "Invalid AnalysisResult" } }` | LLM 返回结构不符合 `AnalysisResult` |
| 500 | `{ "error": { "message": "Invalid ProjectReport" } }` | LLM 返回结构不符合 `ProjectReport` |

## 7. 调用注意事项

- 所有 LLM 业务接口都按 IP 粒度进行限流，阈值由 `LLM_RATE_LIMIT_QPS` 控制。
- LLM 并发池上限由 `LLM_MAX_CONCURRENCY` 控制。
- 缓存 TTL 由 `CACHE_TTL_MS` 控制，默认 5 分钟。
- 异步任务 TTL 由 `TASK_TTL_MS` 控制，默认 30 分钟。
- `generateProjectReport` 当前默认异步执行，调用方必须轮询任务结果。
- 使用 SSE 时，调用方需要解析 `event: status`、`event: result`、`event: error`。
