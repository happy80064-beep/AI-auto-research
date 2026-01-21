import React, { useState, useEffect } from 'react';
import { Home } from './pages/Home';
import { Setup } from './pages/Setup';
import { PlanReview } from './pages/PlanReview';
import { Interview } from './pages/Interview';
import { Questionnaire } from './pages/Questionnaire';
import { Dashboard } from './pages/Dashboard';
import { GlobalDashboard } from './pages/GlobalDashboard';
import { ThankYou } from './pages/ThankYou';
import { AppRoute, ResearchPlan, ResearchContext } from './types';
import { analyzeTranscripts } from './services/geminiService';
import { saveSession, getSession } from './services/storage';
import { LanguageProvider } from './contexts/LanguageContext';

const AppContent = () => {
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(AppRoute.HOME);
  const [researchPlan, setResearchPlan] = useState<ResearchPlan | null>(null);
  const [researchContext, setResearchContext] = useState<ResearchContext | null>(null);
  const [fullTranscript, setFullTranscript] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);

  // Check for shared session link on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('session');
    
    if (sid) {
      setSessionId(sid);
      setLoadingSession(true);
      
      // Use new storage service to fetch (tries Cloud first)
      getSession(sid).then(data => {
        if (data && data.plan && data.context) {
            setResearchPlan(data.plan);
            setResearchContext(data.context);
            // Decide route based on completion status
            if (data.analysis || data.transcript) {
               // If already done, maybe go to thanks or dashboard?
               // For now, let's allow retaking or just start fresh if it was just a plan
            }

            if (data.context.method === 'voice') {
                setCurrentRoute(AppRoute.INTERVIEW);
            } else {
                setCurrentRoute(AppRoute.QUESTIONNAIRE);
            }
        } else {
            console.error("Session found but invalid data");
        }
      }).catch(e => {
        console.error("Failed to restore session", e);
      }).finally(() => {
        setLoadingSession(false);
      });
    }
  }, []);

  const handleCreate = () => {
    setCurrentRoute(AppRoute.SETUP);
  };

  const handleGlobalDashboard = () => {
    setCurrentRoute(AppRoute.GLOBAL_DASHBOARD);
  };

  const handleDraftGenerated = (plan: ResearchPlan, context: ResearchContext) => {
    setResearchPlan(plan);
    setResearchContext(context);
    setCurrentRoute(AppRoute.PLAN_REVIEW);
  };

  const handlePlanConfirmed = async (finalPlan: ResearchPlan) => {
    setResearchPlan(finalPlan);
    // If we are starting fresh (Admin flow), generate a session ID now so we can save results
    if (!sessionId) {
        const newId = Math.random().toString(36).substring(2, 9);
        setSessionId(newId);
        // Persist initial draft using Storage Service
        await saveSession({
            id: newId,
            plan: finalPlan,
            context: researchContext!,
            timestamp: Date.now()
        });
    }

    if (researchContext?.method === 'voice') {
        setCurrentRoute(AppRoute.INTERVIEW);
    } else {
        setCurrentRoute(AppRoute.QUESTIONNAIRE);
    }
  };

  const handleInterviewFinished = async (transcript: string) => {
    setFullTranscript(transcript);
    
    // Auto-analyze and Save Result
    if (sessionId && researchPlan && researchContext) {
        try {
            analyzeTranscripts(transcript).then(result => {
                saveSession({
                    id: sessionId,
                    plan: researchPlan,
                    context: researchContext,
                    transcript: transcript,
                    analysis: result,
                    timestamp: Date.now()
                });
            }).catch(e => console.error("Background analysis failed", e));
            
            // Save basic data immediately
             await saveSession({
                 id: sessionId,
                 plan: researchPlan,
                 context: researchContext,
                 transcript: transcript,
                 timestamp: Date.now()
             });

        } catch (e) {
            console.error("Save failed", e);
        }
    }

    // Redirect to Thank You page
    setCurrentRoute(AppRoute.THANK_YOU);
  };

  const handleRestart = () => {
    setResearchPlan(null);
    setResearchContext(null);
    setFullTranscript("");
    setSessionId(null);
    setCurrentRoute(AppRoute.HOME);
    // Clear URL params
    window.history.replaceState({}, '', window.location.pathname);
  };

  // Only accessed via the subtle link in ThankYou page
  const handleViewReport = () => {
    setCurrentRoute(AppRoute.ANALYSIS); // Single session view
  };

  if (loadingSession) {
     return (
        <div className="min-h-screen bg-ios-bg flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-ios-blue border-t-transparent rounded-full animate-spin"></div>
                <p className="text-ios-gray font-medium">正在加载...</p>
            </div>
        </div>
     );
  }

  return (
    <div className="min-h-screen bg-ios-bg font-sans text-ios-text antialiased selection:bg-ios-blue/20 selection:text-ios-blue">
      
      {currentRoute === AppRoute.HOME && (
        <Home onCreate={handleCreate} onDashboard={handleGlobalDashboard} />
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
        <Interview 
            plan={researchPlan} 
            onFinish={handleInterviewFinished} 
        />
      )}

      {currentRoute === AppRoute.QUESTIONNAIRE && researchPlan && (
        <Questionnaire
            plan={researchPlan}
            onFinish={handleInterviewFinished}
        />
      )}

      {currentRoute === AppRoute.THANK_YOU && (
        <ThankYou 
            onRestart={handleRestart}
            onViewReport={handleViewReport}
            isShareLink={!!new URLSearchParams(window.location.search).get('session')}
        />
      )}

      {currentRoute === AppRoute.ANALYSIS && (
        <Dashboard 
            fullTranscript={fullTranscript} 
            onRestart={handleRestart} 
        />
      )}
    </div>
  );
};

const App = () => {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
};

export default App;