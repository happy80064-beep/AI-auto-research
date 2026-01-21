import { ResearchContext, ResearchPlan, AnalysisResult, ProjectReport } from '../types';
import { SessionData } from './storage';
import { functions } from '../src/firebaseConfig';
import { httpsCallable } from 'firebase/functions';

// Helper to check if functions are initialized
const ensureFunctions = () => {
    if (!functions) {
        throw new Error("Firebase Functions not initialized. Check your firebaseConfig.ts");
    }
};

export const generateResearchPlan = async (context: ResearchContext): Promise<ResearchPlan> => {
  ensureFunctions();
  const generateResearchPlanFn = httpsCallable<ResearchContext, ResearchPlan>(functions, 'generateResearchPlan');
  
  try {
      const result = await generateResearchPlanFn(context);
      return result.data;
  } catch (error: any) {
      console.error("Generate Plan Failed:", error);
      throw new Error(error.message || "Failed to generate research plan");
  }
};

export const refineResearchPlan = async (currentPlan: ResearchPlan, refineInstructions: string): Promise<ResearchPlan> => {
  ensureFunctions();
  const refineResearchPlanFn = httpsCallable<{currentPlan: ResearchPlan, refineInstructions: string}, ResearchPlan>(functions, 'refineResearchPlan');

  try {
      const result = await refineResearchPlanFn({ currentPlan, refineInstructions });
      return result.data;
  } catch (error: any) {
      console.error("Refine Plan Failed:", error);
      throw new Error(error.message || "Failed to refine research plan");
  }
};

export const analyzeTranscripts = async (transcripts: string): Promise<AnalysisResult> => {
  ensureFunctions();
  const analyzeTranscriptsFn = httpsCallable<{transcripts: string}, AnalysisResult>(functions, 'analyzeTranscripts');

  try {
      const result = await analyzeTranscriptsFn({ transcripts });
      return result.data;
  } catch (error: any) {
      console.error("Analysis Failed:", error);
      throw new Error(error.message || "Failed to analyze transcripts");
  }
};

export const generateProjectReport = async (projectTitle: string, sessions: SessionData[]): Promise<ProjectReport> => {
  ensureFunctions();
  const generateProjectReportFn = httpsCallable<{projectTitle: string, sessions: SessionData[]}, ProjectReport>(functions, 'generateProjectReport');

  try {
      const result = await generateProjectReportFn({ projectTitle, sessions });
      return result.data;
  } catch (error: any) {
      console.error("Report Generation Failed:", error);
      throw new Error(error.message || "Failed to generate project report");
  }
};
