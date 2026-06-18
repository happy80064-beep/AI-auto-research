import React, { Suspense, lazy, useEffect, useState } from 'react';
import { AppRoute, ResearchContext, ResearchPlan } from './types';
import { analyzeTranscripts } from './services/geminiService';
import { getSession, saveSession } from './services/storage';
import { LanguageProvider } from './contexts/LanguageContext';
import LZString from 'lz-string';

const Home = lazy(() => import('./pages/Home').then((module) => ({ default: module.Home })));
const Setup = lazy(() => import('./pages/Setup').then((module) => ({ default: module.Setup })));
const PlanReview = lazy(() => import('./pages/PlanReview').then((module) => ({ default: module.PlanReview })));
const Interview = lazy(() => import('./pages/Interview').then((module) => ({ default: module.Interview })));
const Questionnaire = lazy(() => import('./pages/Questionnaire').then((module) => ({ default: module.Questionnaire })));
const Dashboard = lazy(() => import('./pages/Dashboard').then((module) => ({ default: module.Dashboard })));
const GlobalDashboard = lazy(() => import('./pages/GlobalDashboard').then((module) => ({ default: module.GlobalDashboard })));
const ThankYou = lazy(() => import('./pages/ThankYou').then((module) => ({ default: module.ThankYou })));

const RouteLoader = () => (
  <div className="min-h-screen bg-ios-bg flex items-center justify-center">
    <div className="w-10 h-10 border-4 border-ios-blue border-t-transparent rounded-full animate-spin" />
  </div>
);

const createSessionId = () => Math.random().toString(36).substring(2, 9);

const AppContent = () => {
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(AppRoute.HOME);
  const [researchPlan, setResearchPlan] = useState<ResearchPlan | null>(null);
  const [researchContext, setResearchContext] = useState<ResearchContext | null>(null);
  const [fullTranscript, setFullTranscript] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('session');
    const tid = params.get('template');
    const pid = params.get('payload');

    const routeLoadedSession = (plan: ResearchPlan, context: ResearchContext, id: string) => {
      setSessionId(id);
      setResearchPlan(plan);
      setResearchContext(context);
      setCurrentRoute(context.method === 'voice' ? AppRoute.INTERVIEW : AppRoute.QUESTIONNAIRE);
    };

    if (sid) {
      setLoadingSession(true);
      setSessionError(null);
      getSession(sid)
        .then((data) => {
          if (data?.plan && data.context) {
            routeLoadedSession(data.plan, data.context, data.id);
          } else {
            setSessionError('无法加载会话数据，链接可能无效或已过期。');
          }
        })
        .catch(() => setSessionError('加载会话时出错，请检查网络连接。'))
        .finally(() => setLoadingSession(false));
      return;
    }

    if (tid) {
      setLoadingSession(true);
      setSessionError(null);
      getSession(tid)
        .then(async (data) => {
          if (!data?.plan || !data.context) {
            setSessionError('无法加载项目模板，链接可能无效。');
            return;
          }

          const newId = createSessionId();
          const newSession = {
            id: newId,
            plan: data.plan,
            context: data.context,
            timestamp: Date.now(),
          };

          saveSession(newSession).catch((err) => console.warn('[App] Initial template save failed:', err));
          window.history.replaceState({ path: `${window.location.pathname}?session=${newId}` }, '', `${window.location.pathname}?session=${newId}`);
          routeLoadedSession(data.plan, data.context, newId);
        })
        .catch(() => setSessionError('加载模板时出错。'))
        .finally(() => setLoadingSession(false));
      return;
    }

    if (pid) {
      setLoadingSession(true);
      setSessionError(null);
      try {
        const decompressed = LZString.decompressFromEncodedURIComponent(pid);
        if (!decompressed) {
          setSessionError('链接数据解析失败。');
          setLoadingSession(false);
          return;
        }

        const data = JSON.parse(decompressed);
        if (!data?.plan || !data.context) {
          setSessionError('无效的分享数据。');
          setLoadingSession(false);
          return;
        }

        const newId = createSessionId();
        saveSession({
          id: newId,
          plan: data.plan,
          context: data.context,
          timestamp: Date.now(),
        }).catch((err) => console.warn('[App] Payload save failed:', err));

        window.history.replaceState({ path: `${window.location.pathname}?session=${newId}` }, '', `${window.location.pathname}?session=${newId}`);
        routeLoadedSession(data.plan, data.context, newId);
      } catch (error) {
        console.error('Payload decode error', error);
        setSessionError('链接数据已损坏。');
      } finally {
        setLoadingSession(false);
      }
    }
  }, []);

  const handleDraftGenerated = (plan: ResearchPlan, context: ResearchContext) => {
    setResearchPlan(plan);
    setResearchContext(context);
    setCurrentRoute(AppRoute.PLAN_REVIEW);
  };

  const handlePlanConfirmed = async (finalPlan: ResearchPlan, existingSessionId?: string) => {
    setResearchPlan(finalPlan);
    let targetId = sessionId;

    if (existingSessionId) {
      targetId = existingSessionId;
      setSessionId(existingSessionId);
      window.history.replaceState({ path: `${window.location.pathname}?session=${existingSessionId}` }, '', `${window.location.pathname}?session=${existingSessionId}`);
    }

    if (!targetId) {
      targetId = createSessionId();
      setSessionId(targetId);
    }

    try {
      await Promise.race([
        saveSession({
          id: targetId,
          plan: finalPlan,
          context: researchContext!,
          timestamp: Date.now(),
        }),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch (error) {
      console.warn('Initial session save timed out or failed, proceeding anyway', error);
    }

    setCurrentRoute(researchContext?.method === 'voice' ? AppRoute.INTERVIEW : AppRoute.QUESTIONNAIRE);
  };

  const handleInterviewFinished = async (transcript: string) => {
    setFullTranscript(transcript);

    if (sessionId && researchPlan && researchContext) {
      analyzeTranscripts(transcript)
        .then((result) => saveSession({
          id: sessionId,
          plan: researchPlan,
          context: researchContext,
          transcript,
          analysis: result,
          timestamp: Date.now(),
        }))
        .catch((error) => console.error('Background analysis failed', error));

      try {
        await saveSession({
          id: sessionId,
          plan: researchPlan,
          context: researchContext,
          transcript,
          timestamp: Date.now(),
        });
      } catch (error) {
        console.error('Save failed', error);
      }
    }

    setCurrentRoute(AppRoute.THANK_YOU);
  };

  const handleRestart = () => {
    setResearchPlan(null);
    setResearchContext(null);
    setFullTranscript('');
    setSessionId(null);
    setCurrentRoute(AppRoute.HOME);
    window.history.replaceState({}, '', window.location.pathname);
  };

  if (loadingSession) {
    return (
      <div className="min-h-screen bg-ios-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-ios-blue border-t-transparent rounded-full animate-spin" />
          <p className="text-ios-gray font-medium">正在加载...</p>
        </div>
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="min-h-screen bg-ios-bg flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-xl shadow-sm max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">加载失败</h3>
          <p className="text-gray-600 mb-6">{sessionError}</p>
          <button
            onClick={() => {
              setSessionError(null);
              setSessionId(null);
              setCurrentRoute(AppRoute.HOME);
              window.history.replaceState({}, '', window.location.pathname);
            }}
            className="px-4 py-2 bg-ios-blue text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<RouteLoader />}>
      <div className="min-h-screen bg-ios-bg font-sans text-ios-text antialiased selection:bg-ios-blue/20 selection:text-ios-blue">
        {currentRoute === AppRoute.HOME && (
          <Home onCreate={() => setCurrentRoute(AppRoute.SETUP)} onDashboard={() => setCurrentRoute(AppRoute.GLOBAL_DASHBOARD)} />
        )}

        {currentRoute === AppRoute.GLOBAL_DASHBOARD && (
          <GlobalDashboard onBack={() => setCurrentRoute(AppRoute.HOME)} />
        )}

        {currentRoute === AppRoute.SETUP && (
          <Setup
            onDraftGenerated={handleDraftGenerated}
            onBack={() => setCurrentRoute(AppRoute.HOME)}
            initialContext={researchContext}
          />
        )}

        {currentRoute === AppRoute.PLAN_REVIEW && researchPlan && researchContext && (
          <PlanReview
            initialPlan={researchPlan}
            context={researchContext}
            onConfirm={handlePlanConfirmed}
            onBack={() => setCurrentRoute(AppRoute.SETUP)}
            onEnterDashboard={() => setCurrentRoute(AppRoute.GLOBAL_DASHBOARD)}
          />
        )}

        {currentRoute === AppRoute.INTERVIEW && researchPlan && (
          <Interview plan={researchPlan} onFinish={handleInterviewFinished} />
        )}

        {currentRoute === AppRoute.QUESTIONNAIRE && researchPlan && (
          <Questionnaire plan={researchPlan} onFinish={handleInterviewFinished} />
        )}

        {currentRoute === AppRoute.THANK_YOU && (
          <ThankYou
            onRestart={handleRestart}
            onViewReport={() => setCurrentRoute(AppRoute.ANALYSIS)}
            isShareLink={!!new URLSearchParams(window.location.search).get('session')}
          />
        )}

        {currentRoute === AppRoute.ANALYSIS && (
          <Dashboard
            fullTranscript={fullTranscript}
            sessionId={sessionId}
            onRestart={handleRestart}
          />
        )}
      </div>
    </Suspense>
  );
};

const App = () => (
  <LanguageProvider>
    <AppContent />
  </LanguageProvider>
);

export default App;
