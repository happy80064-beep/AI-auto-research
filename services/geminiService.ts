import { ResearchContext, ResearchPlan, AnalysisResult, ProjectReport } from '../types';
import { SessionData } from './storage';
// import { functions } from '../src/firebaseConfig';
// import { httpsCallable } from 'firebase/functions';

const getFunctionUrl = (name: string) => `https://api-proxy.zeabur.app/api/${name}`;

const callFunction = async <T>(name: string, data: any): Promise<T> => {
    const response = await fetch(getFunctionUrl(name), {
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
