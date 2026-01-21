import { ResearchContext, ResearchPlan, AnalysisResult, ProjectReport } from '../types';
import { SessionData } from './storage';

// Firebase 函数 URL
const FIREBASE_FUNCTION_URL = 'https://us-central1-gen-lang-client-0856016385.cloudfunctions.net';

// 使用 CORS 代理的 URL
const CORS_PROXY = 'https://cors-anywhere.herokuapp.com';

const callFunction = async <T>(name: string, data: any): Promise<T> => {
    // 强制使用 Zeabur 代理，它是唯一目前证明可用的路径
    const targetUrl = `https://api-proxy.zeabur.app/api/${name}`;
    
    try {
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ data }), // Wrapper to match our backend expectation
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Function ${name} failed: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const result = await response.json();
        if (result.error) {
            throw new Error(result.error.message || "Unknown error from function");
        }
        return result.data;
    } catch (error: any) {
        // 如果代理也失败，尝试直接调用（作为最后的备选，虽然极有可能失败）
        console.warn(`Proxy call failed (${error.message}), trying direct call as fallback...`);
        const directUrl = `https://us-central1-gen-lang-client-0856016385.cloudfunctions.net/${name}`;
        
        try {
            const response = await fetch(directUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ data }),
            });
            
            if (!response.ok) throw new Error(`Direct call failed: ${response.status}`);
            const result = await response.json();
            return result.data;
        } catch (directError: any) {
            throw new Error(error.message || "Failed to call function");
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
