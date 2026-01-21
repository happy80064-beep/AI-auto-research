import { ResearchContext, ResearchPlan, AnalysisResult, ProjectReport } from '../types';
import { SessionData } from './storage';

// Firebase 函数 URL
const FIREBASE_FUNCTION_URL = 'https://us-central1-gen-lang-client-0856016385.cloudfunctions.net';

// 使用 CORS 代理的 URL
const CORS_PROXY = 'https://cors-anywhere.herokuapp.com';

const callFunction = async <T>(name: string, data: any): Promise<T> => {
    const targetUrl = `${FIREBASE_FUNCTION_URL}/${name}`;
    
    // 方法 1: 尝试直接调用（如果 Firebase 函数已配置 CORS）
    try {
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ data }),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        if (result.error) {
            throw new Error(result.error.message || "Unknown error");
        }
        return result.data;
    } catch (directError: any) {
        console.warn('Direct call failed, trying CORS proxy:', directError.message);
        
        // 方法 2: 使用 CORS 代理作为备选
        try {
            const proxyUrl = `${CORS_PROXY}/${targetUrl}`;
            const response = await fetch(proxyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ data }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();
            if (result.error) {
                throw new Error(result.error.message || "Unknown error");
            }
            return result.data;
        } catch (proxyError: any) {
            console.error('Both direct and proxy calls failed:', proxyError);
            throw new Error('Failed to call function: ' + proxyError.message);
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
