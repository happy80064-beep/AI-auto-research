import { db } from '../src/firebaseConfig';
import { doc, setDoc, getDoc, collection, getDocs } from "firebase/firestore";
import { ResearchPlan, ResearchContext, AnalysisResult, ProjectReport } from '../types';

export interface SessionData {
  id: string;
  plan: ResearchPlan;
  context: ResearchContext;
  transcript?: string;
  analysis?: AnalysisResult;
  timestamp: number;
}

const COLLECTION_NAME = 'insightflow_sessions';
const REPORT_COLLECTION_NAME = 'insightflow_reports';

// Helper to retry Firestore operations on transient network errors
const retryOperation = async <T>(operation: () => Promise<T>, maxRetries = 3, delayMs = 1000): Promise<T> => {
    let lastError: any;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (e: any) {
            const isOffline = e?.code === 'unavailable' || e?.message?.includes('offline') || e?.message?.includes('network');
            if (isOffline && i < maxRetries - 1) {
                console.warn(`[Storage] Operation failed (attempt ${i + 1}/${maxRetries}), retrying in ${delayMs}ms...`, e);
                await new Promise(resolve => setTimeout(resolve, delayMs));
                delayMs *= 2; // Exponential backoff
                continue;
            }
            throw e;
        }
    }
    throw lastError;
};

export const saveSession = async (data: SessionData): Promise<boolean> => {
  // 1. Always save to LocalStorage for redundancy/local speed
  try {
    localStorage.setItem(`insightflow_${data.id}`, JSON.stringify(data));
  } catch (e) {
    console.error("LocalStorage save failed", e);
  }

  // 2. Save to Firestore if available
  if (db) {
    try {
      console.log(`[Storage] Starting Firestore save for ${data.id}...`);
      // Retry the setDoc operation
      await retryOperation(async () => {
          // Add a 10-second timeout specifically for the network request (increased from 4s)
          const saveTask = setDoc(doc(db, COLLECTION_NAME, data.id), data);
          const timeoutTask = new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore operation timed out')), 10000));
          await Promise.race([saveTask, timeoutTask]);
      });
      console.log(`[Storage] Firestore save complete for ${data.id}`);
      return true;
    } catch (e) {
      console.error("Firestore save failed", e);
      return false;
    }
  }
  return false;
};

export const getSession = async (id: string): Promise<SessionData | null> => {
  // 1. Try Firestore first for "Team" access (latest source of truth)
  if (db) {
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      // Retry getDoc to handle initial connection flakiness
      const docSnap = await retryOperation(() => getDoc(docRef));
      
      if (docSnap.exists()) {
        const data = docSnap.data() as SessionData;
        // Sync back to local
        localStorage.setItem(`insightflow_${id}`, JSON.stringify(data));
        return data;
      }
    } catch (e) {
      console.warn("Firestore fetch failed, trying local", e);
    }
  }

  // 2. Fallback to LocalStorage
  const local = localStorage.getItem(`insightflow_${id}`);
  if (local) {
    return JSON.parse(local) as SessionData;
  }

  return null;
};

export const getAllSessions = async (): Promise<SessionData[]> => {
  const sessions: SessionData[] = [];
  const ids = new Set<string>();

  // 1. Fetch from Firestore
  if (db) {
    try {
      const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
      querySnapshot.forEach((doc) => {
        const data = doc.data() as SessionData;
        sessions.push(data);
        ids.add(data.id);
      });
    } catch (e) {
      console.error("Firestore list failed", e);
    }
  }

  // 2. Merge with LocalStorage (if not already fetched)
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('insightflow_')) {
        const id = key.replace('insightflow_', '');
        if (!ids.has(id)) {
             try {
                const raw = localStorage.getItem(key);
                if (raw) {
                    sessions.push(JSON.parse(raw));
                }
             } catch(e) {}
        }
    }
  }

  return sessions.sort((a, b) => b.timestamp - a.timestamp);
};

// --- Project Report Storage ---

export const saveProjectReport = async (projectTitle: string, report: ProjectReport) => {
  const safeId = btoa(unescape(encodeURIComponent(projectTitle))).replace(/[^a-zA-Z0-9]/g, '');
  
  try {
    localStorage.setItem(`report_${safeId}`, JSON.stringify(report));
  } catch (e) {
    console.error("Local report save failed", e);
  }

  if (db) {
    try {
      const saveTask = setDoc(doc(db, REPORT_COLLECTION_NAME, safeId), report);
      const timeoutTask = new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore report save timed out')), 4000));
      await Promise.race([saveTask, timeoutTask]);
    } catch (e) {
      console.error("Firestore report save failed", e);
    }
  }
};

export const getProjectReport = async (projectTitle: string): Promise<ProjectReport | null> => {
  const safeId = btoa(unescape(encodeURIComponent(projectTitle))).replace(/[^a-zA-Z0-9]/g, '');

  if (db) {
    try {
      const docRef = doc(db, REPORT_COLLECTION_NAME, safeId);
      const fetchTask = getDoc(docRef);
      const timeoutTask = new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Firestore report fetch timed out')), 4000));
      
      const docSnap = await Promise.race([fetchTask, timeoutTask]);
      
      if (docSnap.exists()) {
        const data = docSnap.data() as ProjectReport;
        localStorage.setItem(`report_${safeId}`, JSON.stringify(data));
        return data;
      }
    } catch (e) {
      console.warn("Firestore report fetch failed", e);
    }
  }

  const local = localStorage.getItem(`report_${safeId}`);
  if (local) return JSON.parse(local) as ProjectReport;

  return null;
};