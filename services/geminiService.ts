import { ResearchContext, ResearchPlan, AnalysisResult, ProjectReport } from '../types';
import { SessionData } from './storage';

// Firebase 函数 URL (用于备用直接调用)
const FIREBASE_FUNCTION_URL = 'https://us-central1-gen-lang-client-0856016385.cloudfunctions.net';

const callFunction = async <T>(name: string, data: any): Promise<T> => {
    console.log(`[GeminiService] Calling function: ${name}`);
    
    let lastError: string | null = null;

    // 策略 1: 同源代理 (适用于 Zeabur 和 Firebase Hosting)
    // Express server.js 会将 /api/* 请求代理到 Firebase Cloud Functions
    try {
        const sameOriginUrl = `/api/${name}`;
        console.log(`[GeminiService] Trying same-origin: ${sameOriginUrl}`);

        const response = await fetch(sameOriginUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data }),
        });

        if (response.ok) {
            const result = await response.json();
            console.log(`[GeminiService] Same-origin call succeeded`);
            return result.data;
        }
        
        const errorText = await response.text();
        let errorMessage = `Status ${response.status}`;
        try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.error?.message) {
                errorMessage = errorJson.error.message;
            }
        } catch (e) {
            // Response was not JSON
        }
        
        console.warn(`[GeminiService] Same-origin failed: ${errorMessage}`);
        lastError = errorMessage;

    } catch (e: any) {
        console.warn(`[GeminiService] Same-origin error: ${e.message}`);
        lastError = e.message;
    }

    // 策略 2: 直接调用 Firebase Cloud Functions (备用)
    // 注意: 这可能在某些浏览器中因 CORS 问题失败
    console.log(`[GeminiService] Trying direct Firebase call...`);
    const directUrl = `${FIREBASE_FUNCTION_URL}/${name}`;

    try {
        const response = await fetch(directUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `API call failed: ${response.status}`);
        }

        const result = await response.json();
        console.log(`[GeminiService] Direct call succeeded`);
        return result.data;
    } catch (error: any) {
        console.error(`[GeminiService] All strategies failed:`, error);
        
        // Construct a helpful error message
        let finalMessage = `无法连接到服务器。`;
        if (lastError) {
            finalMessage += ` (Server Error: ${lastError})`;
        } else {
             finalMessage += ` (Error: ${error.message})`;
        }
        
        throw new Error(finalMessage);
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
