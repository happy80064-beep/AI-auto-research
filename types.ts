
export interface ResearchContext {
  // Basic Target Info
  objectType: string; // Changed from union type to string to support custom "Other" input
  industry: string;
  demographics: string; // Age, Gender, Education, etc.
  userPersona: string; // Detailed description
  objectives: string;
  method: 'voice' | 'questionnaire';
  questionCount: number;
}

export interface Question {
  id: string;
  text: string;
  type: 'open' | 'scale' | 'choice';
  intent: string;
  // Optional labels for scale questions (e.g. ["Strongly Disagree", "Strongly Agree"])
  scaleLabels?: string[]; 
}

export interface VoiceSettings {
  gender: 'male' | 'female';
  language: 'zh' | 'en';
  tone: string; // UI Label for the tone
  voiceName: string; // API Voice Name
}

export interface ResearchPlan {
  title: string;
  // New fields for the review step
  logicOutline: string; // The strategic approach
  analysisFramework: string; // How data will be analyzed
  systemInstruction: string; // The script/persona for the AI agent
  questions: Question[];
  voiceSettings?: VoiceSettings; // Optional voice configuration
}

export interface InterviewSession {
  id: string;
  status: 'idle' | 'connecting' | 'active' | 'completed';
  transcript: TranscriptItem[];
  startTime: number;
}

export interface TranscriptItem {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface AnalysisResult {
  sentiment: {
    name: string;
    value: number;
    color: string;
  }[];
  keywords: { // New field for Heatmap
    word: string;
    count: number;
  }[];
  themes: {
    topic: string;
    count: number;
  }[];
  summary: string;
}

export interface ParticipantProfile {
  sessionIndex: number; // 1-based index corresponding to the session list
  pseudonym: string; // e.g., "张毅"
  roleAndAge: string; // e.g., "45岁"
  occupation: string; // e.g., "央企部门副总"
  tags: string[]; // e.g., ["三高风险", "技术背景"]
  brief: string; // e.g., "核心痛点是数据化健康管理..."
}

export interface ProjectReport {
  title: string;
  generatedAt: number;
  chapters: {
    title: string;
    content: string; // Markdown content
    keyTakeaways?: string[];
  }[];
  participantProfiles?: ParticipantProfile[];
}

export enum AppRoute {
  HOME = 'home', // New
  SETUP = 'setup',
  PLAN_REVIEW = 'plan_review',
  INTERVIEW = 'interview',
  QUESTIONNAIRE = 'questionnaire',
  THANK_YOU = 'thank_you',
  ANALYSIS = 'analysis',
  GLOBAL_DASHBOARD = 'global_dashboard', // New
}
