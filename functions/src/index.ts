import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

admin.initializeApp();

// Helper for CORS headers
const setCorsHeaders = (res: functions.Response) => {
    res.set('Access-Control-Allow-Origin', 'https://autoresearch.zeabur.app');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Allow-Credentials', 'true');
};

// Configuration
const ORCHESTRATOR_MODEL = 'gemini-3-pro-preview';
const ANALYSIS_MODEL = 'gemini-3-pro-preview';
const REGION = 'us-central1'; // Or your preferred region

// Helper to clean potential markdown fencing
const cleanJson = (text: string) => {
  let content = text.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/```$/, '').trim();
  const firstOpen = content.indexOf('{');
  const lastClose = content.lastIndexOf('}');
  if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
    content = content.substring(firstOpen, lastClose + 1);
  }
  return content;
};

// Retry mechanism
async function withRetry<T>(operation: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const status = error?.status || error?.response?.status || error?.code || error?.error?.code;
    const isOverloaded = status === 503 || status === 429 || (error?.message && error.message.includes('overloaded'));
    
    if (isOverloaded && retries > 0) {
      console.warn(`Model overloaded. Retrying in ${delay/1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(operation, retries - 1, delay * 2);
    }
    throw error;
  }
}

// Initialize Gemini
// Note: In production, set GEMINI_API_KEY using: firebase functions:config:set gemini.key="YOUR_KEY"
// Then access it via functions.config().gemini.key
const getAiClient = () => {
    // Try getting from Firebase Config (Production)
    let apiKey = functions.config().gemini?.key;
    
    // Fallback to Environment Variable (Local/Dev)
    if (!apiKey) {
        apiKey = process.env.GEMINI_API_KEY;
    }

    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not set. Please run: firebase functions:config:set gemini.key="YOUR_KEY"');
    }
    return new GoogleGenAI({ apiKey });
};

// 1. Generate Research Plan
export const generateResearchPlan = functions.region(REGION).https.onRequest(async (req, res) => {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    try {
        const data = req.body.data || req.body; // Support both direct body and callable format
        const { objectType, industry, demographics, userPersona, objectives, method, questionCount } = data;
        const ai = getAiClient();

        const prompt = `
            角色: 资深用户研究专家 & 商业分析师。
            任务: 基于详细的调研对象画像，生成一份专业的调研执行方案。

            调研对象画像:
            - 类型: ${objectType}
            - 行业: ${industry}
            - 基础属性: ${demographics}
            - 用户画像描述: ${userPersona}
            
            调研目标: ${objectives}
            执行方式: ${method === 'voice' ? 'AI 语音深度访谈' : '在线结构化问卷'}
            题目数量: 约 ${questionCount} 题

            请输出纯 JSON 格式，不要包含 Markdown 代码块。
            JSON 结构必须严格符合以下定义：
            {
              "title": "String, 调研计划标题",
              "logicOutline": "String, 调研逻辑大纲 (包含方法论应用)",
              "analysisFramework": "String, 分析体系 (将从哪些维度进行量化或定性分析)",
              "systemInstruction": "String, AI 访谈专家(Agent)的系统指令 (包含人设、语气、开场白、致谢)",
              "questions": [
                {
                  "id": "String, unique id",
                  "text": "String, 具体问题文本",
                  "type": "String, 必须是 'open' 或 'scale' 或 'choice'",
                  "intent": "String, 该问题的调研意图",
                  "scaleLabels": ["String", "String"] // 仅当 type 为 scale 时需要，分别代表1分和5分的含义
                }
              ]
            }

            要求:
            1. **逻辑大纲**: 设计严密的调研逻辑。
            2. **分析体系**: 预先定义分析维度。
            3. **话术/系统指令**: 
               - 角色名称是“InsightFlow AI 访谈专家”。
               - 必须使用中文。
               - **关键语气要求**: 极度自然、生活化，拒绝僵硬的机械感。
               - 针对 ${objectType} 调整具体风格。
               - 包含主动开场白、自我介绍。
               - 当所有预设问题都问完，或用户明确表示不想继续时，必须说出“访谈结束”并致谢。
            4. **问题设计**: 
               - 严控题目数量在 ${questionCount || 10} 题左右。
               - 问题类型 (type) 只能是 'open', 'scale', 'choice' 之一。
               - Scale题必须定义 scaleLabels。
            
            IMPORTANT: Output ONLY valid JSON.
          `;

            const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
                model: ORCHESTRATOR_MODEL,
                contents: prompt,
                config: { responseMimeType: "application/json" }
            }));

            if (!response.text) throw new Error("No response from Gemini");
            
            const plan = JSON.parse(cleanJson(response.text));
            
            // Inject Mandatory Identity Questions (Backend side)
            const IDENTITY_QUESTIONS = [
              { id: 'id_job', text: '为了更好地了解您，请问您的职业是什么？', type: 'open', intent: '身份确认-职业' },
              { id: 'id_industry', text: '您目前所在的行业是？', type: 'open', intent: '身份确认-行业' },
              { id: 'id_age', text: '您的年龄段是？', type: 'open', intent: '身份确认-年龄' },
              { id: 'id_gender', text: '您的性别是？', type: 'open', intent: '身份确认-性别' }
            ];

            plan.questions = [...IDENTITY_QUESTIONS, ...plan.questions];
            
            // Inject default voice settings
            plan.voiceSettings = {
                gender: 'female',
                language: 'zh',
                tone: '干练女声',
                voiceName: 'Zephyr'
            };

            res.json({ data: plan }); // Return in callable format

    } catch (error: any) {
        console.error("Error generating plan:", error);
        res.status(500).json({ error: { message: error.message || 'Failed to generate plan' } });
    }
});

// 2. Refine Research Plan
export const refineResearchPlan = functions.region(REGION).https.onRequest(async (req, res) => {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    try {
        const data = req.body.data || req.body;
        const { currentPlan, refineInstructions } = data;
        const ai = getAiClient();

            // Separate fixed questions logic (simplified for backend)
            const fixedIds = ['id_job', 'id_industry', 'id_age', 'id_gender'];
            const fixedQuestions = currentPlan.questions.filter((q: any) => fixedIds.includes(q.id));
            const dynamicQuestions = currentPlan.questions.filter((q: any) => !fixedIds.includes(q.id));

            const planForAI = { ...currentPlan, questions: dynamicQuestions };

            const prompt = `
            任务: 优化现有的调研计划。
            用户反馈/修改意见: "${refineInstructions}"
            当前计划内容 (JSON): ${JSON.stringify(planForAI)}

            请根据修改意见，重新调整逻辑大纲、分析体系、系统指令和问题列表。
            必须保持 JSON 结构与输入完全一致。
            **特别注意**: 如果修改涉及系统指令，请务必保留“自然、生活化”的语气设定。
            
            请输出纯 JSON 格式。
            IMPORTANT: Output ONLY valid JSON.
          `;

            const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
                model: ORCHESTRATOR_MODEL,
                contents: prompt,
                config: { responseMimeType: "application/json" }
            }));

            if (!response.text) throw new Error("No response from Gemini");
            const refinedPlan = JSON.parse(cleanJson(response.text));
            
            refinedPlan.questions = [...fixedQuestions, ...refinedPlan.questions];
            refinedPlan.voiceSettings = currentPlan.voiceSettings;
            
            res.json({ data: refinedPlan });

    } catch (error: any) {
        console.error("Refine Plan Failed:", error);
        res.status(500).json({ error: { message: error.message } });
    }
});

// 3. Analyze Transcripts
export const analyzeTranscripts = functions.region(REGION).https.onRequest(async (req, res) => {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    try {
        const data = req.body.data || req.body;
        const { transcripts } = data;
        const ai = getAiClient();

            const prompt = `
            作为首席数据分析师，请深入分析以下访谈/问卷记录。
            
            任务：
            1. **情感分析**: 评估情绪分布。
            2. **高频关键词提取**: 提取前20个关键实词。
            3. **深度AI分析报告**: 撰写核心洞察、痛点与建议。
            
            **重要**: 输出必须是**中文**。
            
            请输出纯 JSON 格式，结构如下：
            {
              "sentiment": [ { "name": "String", "value": Number, "color": "String" } ],
              "keywords": [ { "word": "String", "count": Number } ],
              "themes": [ { "topic": "String", "count": Number } ],
              "summary": "String (Markdown)"
            }
            
            调研内容:
            ${transcripts}
          `;

            const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
                model: ANALYSIS_MODEL,
                contents: prompt,
                config: { responseMimeType: "application/json" }
            }));

            if (!response.text) throw new Error("No analysis generated");
            const result = JSON.parse(cleanJson(response.text));
            
            res.json({ data: result });

    } catch (error: any) {
        console.error("Analysis Failed:", error);
        res.status(500).json({ error: { message: error.message } });
    }
});

// 4. Generate Project Report
export const generateProjectReport = functions.region(REGION).https.onRequest(async (req, res) => {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    try {
        const data = req.body.data || req.body;
        const { projectTitle, sessions } = data;
        const ai = getAiClient();

            const aggregatedContent = sessions
                .filter((s: any) => s.transcript)
                .map((s: any, idx: number) => `
              [Session #${idx + 1}]
              - Type: ${s.context.objectType}
              - Date: ${new Date(s.timestamp).toLocaleDateString()}
              - Transcript:
              ${s.transcript}
            `).join('\n\n------------------\n\n');

            if (!aggregatedContent) {
                throw new Error("该项目暂无有效的访谈记录。");
            }

            const prompt = `
            你是一位顶级咨询顾问。基于以下调研会话记录，生成一份项目级的深度分析报告。
            
            请生成 JSON 格式，结构如下：
            {
               "title": "String",
               "participantProfiles": [
                  {
                     "sessionIndex": Number,
                     "pseudonym": "String",
                     "roleAndAge": "String",
                     "occupation": "String",
                     "tags": ["String"],
                     "brief": "String"
                  }
               ],
               "chapters": [
                  {
                     "title": "String",
                     "content": "String (Markdown)",
                     "keyTakeaways": ["String"]
                  }
               ]
            }
            
            分析素材:
            项目名称: ${projectTitle}
            ${aggregatedContent}
          `;

            const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
                model: ORCHESTRATOR_MODEL,
                contents: prompt,
                config: { responseMimeType: "application/json" }
            }));

            if (!response.text) throw new Error("Report generation failed");
            const rawReport = JSON.parse(cleanJson(response.text));
            
            res.json({
                data: {
                    title: rawReport.title,
                    generatedAt: Date.now(),
                    chapters: rawReport.chapters,
                    participantProfiles: rawReport.participantProfiles
                }
            });

        } catch (error: any) {
            console.error("Report Generation Failed:", error);
            res.status(500).json({ error: { message: error.message } });
    }
});
