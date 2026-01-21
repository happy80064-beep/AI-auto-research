import { ResearchContext, ResearchPlan, AnalysisResult, ProjectReport } from '../types';
import { SessionData } from './storage';

// Firebase 函数 URL
const FIREBASE_FUNCTION_URL = 'https://us-central1-gen-lang-client-0856016385.cloudfunctions.net';

// 使用 CORS 代理的 URL
const CORS_PROXY = 'https://cors-anywhere.herokuapp.com';

const callFunction = async <T>(name: string, data: any): Promise<T> => {
    console.log(`[GeminiService] Calling function: ${name}`);
    
    // 策略 0: Firebase Hosting Rewrites (同源代理 - 最佳方案)
    // 这需要 firebase.json 配置 rewrites 将 /api/* 转发到 Cloud Functions
    try {
        const sameOriginUrl = `/api/${name}`;
        console.log(`Trying same-origin call: ${sameOriginUrl}`);
        const response = await fetch(sameOriginUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data }),
        });
        
        if (response.ok) {
            const result = await response.json();
            return result.data;
        }
        console.warn(`Same-origin call failed with status: ${response.status}`);
    } catch (e: any) {
        console.warn(`Same-origin call failed: ${e.message}`);
    }

    // 策略 1: Zeabur 代理 (带 /api 前缀)
    const proxyUrlApi = `https://api-proxy.zeabur.app/api/${name}`;
    
    try {
        const response = await fetch(proxyUrlApi, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data }),
        });

        if (response.ok) {
            const result = await response.json();
            return result.data;
        } else if (response.status === 404) {
            console.warn(`Proxy /api path returned 404, trying without /api prefix...`);
            // 策略 2: Zeabur 代理 (无 /api 前缀)
            const proxyUrlRoot = `https://api-proxy.zeabur.app/${name}`;
            const responseRoot = await fetch(proxyUrlRoot, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data }),
            });
            
            if (responseRoot.ok) {
                const result = await responseRoot.json();
                return result.data;
            }
        }
        throw new Error(`Proxy failed: ${response.status}`);
    } catch (proxyError: any) {
        console.warn(`Proxy strategies failed (${proxyError.message}), trying direct call...`);
        
        // 策略 3: 直接调用 Cloud Functions
        const directUrl = `https://us-central1-gen-lang-client-0856016385.cloudfunctions.net/${name}`;
        try {
            const response = await fetch(directUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data }),
            });
            
            if (!response.ok) throw new Error(`Direct call failed: ${response.status}`);
            const result = await response.json();
            return result.data;
        } catch (directError: any) {
            console.warn(`Direct call failed (${directError.message}), trying cors-anywhere...`);
            
            // 策略 4: cors-anywhere 终极备选
            const corsAnywhereUrl = `https://cors-anywhere.herokuapp.com/${directUrl}`;
            try {
                 const response = await fetch(corsAnywhereUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: JSON.stringify({ data }),
                });
                
                if (!response.ok) throw new Error(`Cors-anywhere failed: ${response.status}`);
                const result = await response.json();
                return result.data;
            } catch (finalError: any) {
                console.error("All strategies failed.");
                throw new Error(`All connection methods failed. Last error: ${finalError.message}`);
            }
        }
    }
};

export const generateResearchPlan = async (context: ResearchContext): Promise<ResearchPlan> => {
  try {
      return await callFunction<ResearchPlan>('generateResearchPlan', context);
  } catch (error: any) {
      console.error("Generate Plan Failed:", error);
      throw new Error(error.message || "Failed to generate research plan");
  }
};

export const refineResearchPlan = async (currentPlan: ResearchPlan, refineInstructions: string): Promise<ResearchPlan> => {
  try {
      return await callFunction<ResearchPlan>('refineResearchPlan', { currentPlan, refineInstructions });
  } catch (error: any) {
      console.error("Refine Plan Failed:", error);
      throw new Error(error.message || "Failed to refine research plan");
  }
};

export const analyzeTranscripts = async (transcripts: string): Promise<AnalysisResult> => {
  try {
      return await callFunction<AnalysisResult>('analyzeTranscripts', { transcripts });
  } catch (error: any) {
      console.error("Analysis Failed:", error);
      throw new Error(error.message || "Failed to analyze transcripts");
  }
};

export const generateProjectReport = async (projectTitle: string, sessions: SessionData[]): Promise<ProjectReport> => {
  try {
      return await callFunction<ProjectReport>('generateProjectReport', { projectTitle, sessions });
  } catch (error: any) {
      console.error("Report Generation Failed:", error);
      throw new Error(error.message || "Failed to generate project report");
  }
};
