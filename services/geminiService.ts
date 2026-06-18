import { AnalysisResult, ProjectReport, ResearchContext, ResearchPlan } from '../types';
import { SessionData } from './storage';

const FIREBASE_FUNCTION_URL = 'https://us-central1-gen-lang-client-0856016385.cloudfunctions.net';

type ApiName = 'generateResearchPlan' | 'refineResearchPlan' | 'analyzeTranscripts' | 'generateProjectReport';
type TaskState<T> = {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  result?: T;
  error?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseSse = async <T>(response: Response): Promise<T> => {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Streaming response is not supported by this browser.');

  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = 'message';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const packets = buffer.split('\n\n');
    buffer = packets.pop() || '';

    for (const packet of packets) {
      const lines = packet.split('\n');
      const dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith('event:')) currentEvent = line.slice(6).trim();
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (!dataLines.length) continue;

      const payload = JSON.parse(dataLines.join('\n'));
      if (currentEvent === 'result') return payload as T;
      if (currentEvent === 'error') throw new Error(payload.message || 'DeepSeek request failed');
      currentEvent = 'message';
    }
  }

  throw new Error('Streaming response ended without a result.');
};

const pollTask = async <T>(taskId: string): Promise<T> => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await fetch(`/api/tasks/${taskId}`);
    if (!response.ok) throw new Error(`Task polling failed: ${response.status}`);
    const payload = await response.json();
    const task = payload.data as TaskState<T>;

    if (task.status === 'completed') return task.result as T;
    if (task.status === 'failed') throw new Error(task.error || 'Async task failed');
    await sleep(Math.min(1000 + attempt * 200, 5000));
  }
  throw new Error('Async task timed out.');
};

const postJson = async <T>(url: string, data: unknown): Promise<T> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });

  if (response.status === 202) {
    const payload = await response.json();
    return pollTask<T>(payload.data.taskId);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `API call failed: ${response.status}`);
  }

  const payload = await response.json();
  return payload.data as T;
};

const callFunction = async <T>(name: ApiName, data: unknown, stream = false): Promise<T> => {
  let lastError: string | null = null;
  const sameOriginUrl = `/api/${name}${stream ? '?stream=1' : ''}`;

  try {
    if (stream) {
      const response = await fetch(sameOriginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({ data }),
      });
      if (response.ok) return await parseSse<T>(response);
      lastError = `Status ${response.status}`;
    } else {
      return await postJson<T>(sameOriginUrl, data);
    }
  } catch (error: any) {
    lastError = error.message;
    console.warn(`[DeepSeekService] Same-origin call failed: ${error.message}`);
  }

  try {
    return await postJson<T>(`${FIREBASE_FUNCTION_URL}/${name}`, data);
  } catch (error: any) {
    const detail = lastError ? ` Server error: ${lastError}.` : '';
    throw new Error(`无法连接到 AI 服务。${detail} ${error.message || ''}`.trim());
  }
};

export const generateResearchPlan = async (context: ResearchContext): Promise<ResearchPlan> => {
  return callFunction<ResearchPlan>('generateResearchPlan', context, true);
};

export const refineResearchPlan = async (currentPlan: ResearchPlan, refineInstructions: string): Promise<ResearchPlan> => {
  return callFunction<ResearchPlan>('refineResearchPlan', { currentPlan, refineInstructions }, true);
};

export const analyzeTranscripts = async (transcripts: string): Promise<AnalysisResult> => {
  return callFunction<AnalysisResult>('analyzeTranscripts', { transcripts }, true);
};

export const generateProjectReport = async (projectTitle: string, sessions: SessionData[]): Promise<ProjectReport> => {
  return callFunction<ProjectReport>('generateProjectReport', { projectTitle, sessions });
};
