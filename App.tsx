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
import LZString from 'lz-string';

const AppContent = () => {
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(AppRoute.HOME);
  const [researchPlan, setResearchPlan] = useState<ResearchPlan | null>(null);
  const [researchContext, setResearchContext] = useState<ResearchContext | null>(null);
  const [fullTranscript, setFullTranscript] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Check for shared session link on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('session');
    const tid = params.get('template');
    const pid = params.get('payload');
    
    if (sid) {
      setSessionId(sid);
      setLoadingSession(true);
      setSessionError(null);
      
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
            setSessionError("无法加载会话数据。链接可能无效或已过期。");
        }
      }).catch(e => {
        console.error("Failed to restore session", e);
        setSessionError("加载会话时出错。请检查网络连接。");
      }).finally(() => {
        setLoadingSession(false);
      });
    } else if (tid) {
        // Handle Template Link: Load template session, create NEW session
        setLoadingSession(true);
        setSessionError(null);

        getSession(tid).then(async (data) => {
            if (data && data.plan && data.context) {
                // Create NEW session from this template
                const newId = Math.random().toString(36).substring(2, 9);
                const newSession = {
                    id: newId,
                    plan: data.plan,
                    context: data.context,
                    timestamp: Date.now()
                };

                await saveSession(newSession);
                
                // Update State
                setSessionId(newId);
                setResearchPlan(data.plan);
                setResearchContext(data.context);

                // Update URL to the new session ID so refresh works
                const newUrl = `${window.location.pathname}?session=${newId}`;
                window.history.replaceState({ path: newUrl }, '', newUrl);

                // Route
                if (data.context.method === 'voice') {
                    setCurrentRoute(AppRoute.INTERVIEW);
                } else {
                    setCurrentRoute(AppRoute.QUESTIONNAIRE);
                }
            } else {
                setSessionError("无法加载项目模板。链接可能无效。");
            }
        }).catch(e => {
            console.error("Failed to load template", e);
            setSessionError("加载模板时出错。");
        }).finally(() => {
            setLoadingSession(false);
        });
    } else if (pid) {
        setLoadingSession(true);
        setSessionError(null);
        try {
            const decompressed = LZString.decompressFromEncodedURIComponent(pid);
            if (decompressed) {
                const data = JSON.parse(decompressed);
                if (data && data.plan && data.context) {
                     const newId = Math.random().toString(36).substring(2, 9);
                     
                     // Optimistically set state
                     setSessionId(newId);
                     setResearchPlan(data.plan);
                     setResearchContext(data.context);
                     
                     // Try to save
                     const newSession = {
                        id: newId,
                        plan: data.plan,
                        context: data.context,
                        timestamp: Date.now()
                    };
                    saveSession(newSession).catch(e => console.warn("Background save failed", e));
                    
                    // Update URL
                    const newUrl = `${window.location.pathname}?session=${newId}`;
                    window.history.replaceState({ path: newUrl }, '', newUrl);
                    
                    if (data.context.method === 'voice') {
                        setCurrentRoute(AppRoute.INTERVIEW);
                    } else {
                        setCurrentRoute(AppRoute.QUESTIONNAIRE);
                    }
                } else {
                    setSessionError("无效的分享数据");
                }
            } else {
                 setSessionError("链接数据解析失败");
            }
        } catch (e) {
            console.error("Payload decode error", e);
            setSessionError("链接数据已损坏");
        } finally {
            setLoadingSession(false);
        }
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

  const handlePlanConfirmed = async (finalPlan: ResearchPlan, existingSessionId?: string) => {
    setResearchPlan(finalPlan);
    
    // If we are starting fresh (Admin flow), generate a session ID now so we can save results
    let targetId = sessionId;

    if (existingSessionId) {
        // Use the ID generated during link creation
        targetId = existingSessionId;
        setSessionId(existingSessionId);
        
        // Update URL to match this session
        const newUrl = `${window.location.pathname}?session=${existingSessionId}`;
        window.history.replaceState({ path: newUrl }, '', newUrl);
    }
    
    if (!targetId) {
        const newId = Math.random().toString(36).substring(2, 9);
        targetId = newId;
        setSessionId(newId);
    }
        
    // Persist initial draft using Storage Service
    // We add a timeout/race here so UI doesn't freeze if Cloud is unreachable
    const savePromise = saveSession({
        id: targetId,
        plan: finalPlan,
        context: researchContext!,
        timestamp: Date.now()
    });

    // 3 second timeout for initial save
    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 3000));
    
    try {
        await Promise.race([savePromise, timeoutPromise]);
    } catch (e) {
        console.warn("Initial session save timed out or failed, proceeding anyway", e);
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
            sessionId={sessionId}
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