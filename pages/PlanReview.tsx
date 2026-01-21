import React, { useState } from 'react';
import { ResearchPlan, ResearchContext, VoiceSettings } from '../types';
import { refineResearchPlan } from '../services/geminiService';
import { saveSession } from '../services/storage';
import { useLanguage } from '../contexts/LanguageContext';

interface PlanReviewProps {
  initialPlan: ResearchPlan;
  context: ResearchContext;
  onConfirm: (finalPlan: ResearchPlan) => void;
  onBack: () => void;
  onEnterDashboard: () => void;
}

const VOICE_OPTIONS = {
    male: [
        { label: '沉稳男声', value: 'Charon', desc: 'Deep & Steady' },
        { label: '阳光男声', value: 'Puck', desc: 'Bright & Energetic' },
        { label: '温柔男声', value: 'Fenrir', desc: 'Calm & Gentle' }
    ],
    female: [
        { label: '干练女声', value: 'Zephyr', desc: 'Professional' },
        { label: '温柔女声', value: 'Kore', desc: 'Warm & Caring' },
        { label: '甜美女声', value: 'Aoede', desc: 'Sweet & Light' }
    ]
};

export const PlanReview: React.FC<PlanReviewProps> = ({ initialPlan, context, onConfirm, onBack, onEnterDashboard }) => {
  const { t } = useLanguage();
  const [plan, setPlan] = useState<ResearchPlan>(initialPlan);
  const [optimizing, setOptimizing] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [copied, setCopied] = useState(false);

  const handleOptimize = async () => {
    if (!refineInstruction.trim()) return;
    setOptimizing(true);
    try {
      const refined = await refineResearchPlan(plan, refineInstruction);
      setPlan(refined);
      setRefineInstruction("");
    } catch (e) {
      console.error(e);
      alert("AI optimization failed. Please retry.");
    } finally {
      setOptimizing(false);
    }
  };

  const handleGenerateLink = async () => {
    const uniqueId = Math.random().toString(36).substring(2, 9);
    await saveSession({
        id: uniqueId,
        plan,
        context,
        timestamp: Date.now()
    });
    const url = new URL(window.location.href);
    url.search = ''; 
    url.searchParams.set('session', uniqueId);
    setShareLink(url.toString());
    setShowLinkModal(true);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartNow = () => {
    setShowLinkModal(false);
    onConfirm(plan);
  };

  const handleVoiceSettingChange = (updates: Partial<VoiceSettings>) => {
     if (!plan.voiceSettings) return;
     
     const newSettings = { ...plan.voiceSettings, ...updates };
     
     // Auto-select first tone if gender changes
     if (updates.gender && updates.gender !== plan.voiceSettings.gender) {
         const firstOption = VOICE_OPTIONS[updates.gender][0];
         newSettings.tone = firstOption.label;
         newSettings.voiceName = firstOption.value;
     }

     setPlan({ ...plan, voiceSettings: newSettings });
  };

  const handleToneSelect = (option: typeof VOICE_OPTIONS.male[0]) => {
      if (!plan.voiceSettings) return;
      setPlan({
          ...plan,
          voiceSettings: {
              ...plan.voiceSettings,
              tone: option.label,
              voiceName: option.value
          }
      });
  };

  return (
    <div className="h-screen bg-ios-bg flex flex-col">
       {/* Header */}
       <header className="bg-white/80 backdrop-blur-md border-b border-black/5 px-8 py-4 flex items-center justify-between z-20 shadow-sm">
         <div className="flex items-center gap-4">
            <button onClick={onBack} className="text-ios-blue hover:text-blue-600 transition-colors">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                </svg>
            </button>
            <div>
                <h1 className="text-xl font-bold text-black tracking-tight">{t('review.title')}</h1>
                <p className="text-xs text-ios-gray">{t('review.subtitle')}</p>
            </div>
         </div>
         <button 
             onClick={handleGenerateLink}
             className="bg-black text-white px-6 py-2.5 rounded-full font-bold text-sm hover:bg-gray-800 transition-colors shadow-lg active:scale-95"
         >
             {t('review.confirm')}
         </button>
       </header>

       {/* Main Content Grid */}
       <div className="flex-1 overflow-hidden p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Left Column */}
          <div className="flex flex-col gap-6 overflow-y-auto pr-2 pb-20 custom-scrollbar">
               
               {/* Voice Settings Card - Only if method is voice */}
               {context.method === 'voice' && plan.voiceSettings && (
                   <div className="bg-white rounded-3xl p-6 border border-black/5 shadow-ios">
                       <div className="flex items-center gap-3 mb-6">
                           <div className="w-8 h-8 rounded-full bg-ios-blue/10 flex items-center justify-center text-ios-blue">
                               <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                               </svg>
                           </div>
                           <h3 className="text-lg font-bold text-black">{t('review.voice_settings')}</h3>
                       </div>

                       <div className="space-y-6">
                           {/* Row 1: Gender & Language */}
                           <div className="flex gap-4">
                               <div className="flex-1">
                                   <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">{t('review.gender')}</label>
                                   <div className="flex bg-gray-100 p-1 rounded-xl">
                                       <button 
                                            onClick={() => handleVoiceSettingChange({ gender: 'male' })}
                                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${plan.voiceSettings.gender === 'male' ? 'bg-white shadow-sm text-black' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                           {t('review.male')}
                                       </button>
                                       <button 
                                            onClick={() => handleVoiceSettingChange({ gender: 'female' })}
                                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${plan.voiceSettings.gender === 'female' ? 'bg-white shadow-sm text-black' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                           {t('review.female')}
                                       </button>
                                   </div>
                               </div>
                               <div className="flex-1">
                                   <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">{t('review.lang')}</label>
                                   <div className="flex bg-gray-100 p-1 rounded-xl">
                                       <button 
                                            onClick={() => handleVoiceSettingChange({ language: 'zh' })}
                                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${plan.voiceSettings.language === 'zh' ? 'bg-white shadow-sm text-black' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                           {t('review.zh')}
                                       </button>
                                       <button 
                                            onClick={() => handleVoiceSettingChange({ language: 'en' })}
                                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${plan.voiceSettings.language === 'en' ? 'bg-white shadow-sm text-black' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                           {t('review.en')}
                                       </button>
                                   </div>
                               </div>
                           </div>

                           {/* Row 2: Tone Selection */}
                           <div>
                               <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">{t('review.tone')}</label>
                               <div className="grid grid-cols-3 gap-2">
                                   {VOICE_OPTIONS[plan.voiceSettings.gender].map((opt) => (
                                       <button
                                           key={opt.value}
                                           onClick={() => handleToneSelect(opt)}
                                           className={`p-3 rounded-xl border text-left transition-all ${
                                               plan.voiceSettings?.voiceName === opt.value
                                               ? 'bg-ios-blue/5 border-ios-blue ring-1 ring-ios-blue/20'
                                               : 'bg-white border-gray-200 hover:border-gray-300'
                                           }`}
                                       >
                                           <div className={`text-sm font-bold mb-0.5 ${plan.voiceSettings?.voiceName === opt.value ? 'text-ios-blue' : 'text-black'}`}>
                                               {opt.label}
                                           </div>
                                           <div className="text-[10px] text-gray-400 font-medium">
                                               {opt.desc}
                                           </div>
                                       </button>
                                   ))}
                               </div>
                           </div>
                       </div>
                   </div>
               )}

               {/* Logic Card */}
               <div className="bg-white rounded-3xl p-6 border border-black/5 shadow-ios">
                   <div className="flex items-center gap-3 mb-4">
                       <div className="w-8 h-8 rounded-full bg-ios-yellow/10 flex items-center justify-center text-ios-yellow">
                           <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                       </div>
                       <h3 className="text-lg font-bold text-black">{t('review.logic')}</h3>
                   </div>
                   <textarea
                       className="w-full bg-ios-input rounded-xl p-4 text-black text-sm leading-relaxed outline-none focus:ring-2 focus:ring-ios-yellow/50 h-48 resize-none"
                       value={plan.logicOutline}
                       onChange={(e) => setPlan({...plan, logicOutline: e.target.value})}
                   />
               </div>

               {/* Analysis Card */}
               <div className="bg-white rounded-3xl p-6 border border-black/5 shadow-ios">
                   <div className="flex items-center gap-3 mb-4">
                       <div className="w-8 h-8 rounded-full bg-ios-green/10 flex items-center justify-center text-ios-green">
                           <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                       </div>
                       <h3 className="text-lg font-bold text-black">{t('review.analysis')}</h3>
                   </div>
                   <textarea
                       className="w-full bg-ios-input rounded-xl p-4 text-black text-sm leading-relaxed outline-none focus:ring-2 focus:ring-ios-green/50 h-48 resize-none"
                       value={plan.analysisFramework}
                       onChange={(e) => setPlan({...plan, analysisFramework: e.target.value})}
                   />
               </div>

               {/* AI Optimizer */}
               <div className="bg-gradient-to-br from-gray-50 to-white rounded-3xl p-6 border border-black/5 relative overflow-visible shadow-ios">
                    <label className="block text-sm font-bold text-black mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-purple-500" fill="currentColor" viewBox="0 0 20 20"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" /></svg>
                        {t('review.optimizer')}
                    </label>
                    <div className="flex gap-3 relative z-10">
                        <input
                            type="text"
                            disabled={optimizing}
                            className="flex-1 min-w-0 bg-white border border-gray-200 rounded-xl p-3 text-black text-sm outline-none focus:border-ios-blue focus:ring-2 focus:ring-ios-blue/20 transition-all disabled:bg-gray-100 disabled:text-gray-400"
                            placeholder={t('review.optimize_placeholder')}
                            value={refineInstruction}
                            onChange={(e) => setRefineInstruction(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !optimizing && refineInstruction.trim()) {
                                    handleOptimize();
                                }
                            }}
                        />
                        <button
                            onClick={handleOptimize}
                            disabled={optimizing || !refineInstruction.trim()}
                            className="shrink-0 px-5 bg-black text-white rounded-xl font-bold text-sm hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg active:scale-95 flex items-center justify-center min-w-[80px]"
                        >
                            {optimizing ? (
                                <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                            ) : t('review.submit')}
                        </button>
                    </div>
               </div>
          </div>

          {/* Right Column */}
          <div className="flex flex-col gap-6 overflow-y-auto pr-2 pb-20 custom-scrollbar">
             
             {/* System Instruction */}
             <div className="bg-white rounded-3xl p-6 border border-black/5 shadow-ios">
                   <div className="flex items-center gap-3 mb-4">
                       <div className="w-8 h-8 rounded-full bg-ios-blue/10 flex items-center justify-center text-ios-blue">
                           <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                       </div>
                       <h3 className="text-lg font-bold text-black">
                           {context.method === 'voice' ? t('review.system_prompt') : t('review.preface')}
                       </h3>
                   </div>
                   <textarea
                       className="w-full bg-ios-input rounded-xl p-4 text-black text-sm leading-relaxed outline-none focus:ring-2 focus:ring-ios-blue/50 h-56 resize-none font-mono"
                       value={plan.systemInstruction}
                       onChange={(e) => setPlan({...plan, systemInstruction: e.target.value})}
                   />
             </div>

             {/* Questions */}
             <div className="bg-white rounded-3xl p-6 border border-black/5 shadow-ios">
                   <div className="flex items-center gap-3 mb-4">
                       <div className="w-8 h-8 rounded-full bg-ios-red/10 flex items-center justify-center text-ios-red">
                           <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                       </div>
                       <h3 className="text-lg font-bold text-black">{t('review.questions')} ({plan.questions.length})</h3>
                   </div>
                   <div className="space-y-3">
                       {plan.questions.map((q, idx) => (
                           <div key={q.id} className="bg-ios-input rounded-xl p-4 group transition-colors hover:bg-gray-200">
                               <div className="flex gap-3">
                                   <span className="text-ios-gray font-bold text-sm pt-1 w-6">{idx + 1}.</span>
                                   <div className="flex-1 space-y-2">
                                        <input
                                            type="text"
                                            className="w-full bg-transparent text-black text-sm font-medium outline-none border-b border-transparent focus:border-ios-blue placeholder-gray-500"
                                            value={q.text}
                                            onChange={(e) => {
                                                const newQuestions = [...plan.questions];
                                                newQuestions[idx].text = e.target.value;
                                                setPlan({...plan, questions: newQuestions});
                                            }}
                                        />
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold bg-black/5 px-1.5 py-0.5 rounded">{t('review.intent')}</span>
                                            <input
                                                type="text"
                                                className="flex-1 bg-transparent text-xs text-gray-600 outline-none"
                                                value={q.intent}
                                                onChange={(e) => {
                                                    const newQuestions = [...plan.questions];
                                                    newQuestions[idx].intent = e.target.value;
                                                    setPlan({...plan, questions: newQuestions});
                                                }}
                                            />
                                        </div>
                                   </div>
                               </div>
                           </div>
                       ))}
                   </div>
             </div>
          </div>
       </div>

       {/* Modal */}
       {showLinkModal && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white p-8 rounded-[32px] shadow-2xl max-w-md w-full relative animate-in zoom-in-95 duration-300 ring-1 ring-black/5">
                <button 
                    onClick={() => setShowLinkModal(false)}
                    className="absolute top-5 right-5 w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 hover:text-black transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                <div className="text-center mb-8 mt-2">
                    <div className="w-16 h-16 bg-ios-blue/10 text-ios-blue rounded-2xl flex items-center justify-center mx-auto mb-5">
                         <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                    </div>
                    <h3 className="text-2xl font-bold text-black mb-2">{t('review.modal.ready')}</h3>
                    <p className="text-ios-gray text-sm">{t('review.modal.desc')}</p>
                </div>

                <div className="bg-gray-50 rounded-xl p-1 flex items-center mb-6 border border-gray-200">
                    <input 
                        type="text" 
                        readOnly 
                        value={shareLink}
                        className="bg-transparent border-none text-gray-600 text-sm flex-1 focus:ring-0 outline-none w-full px-3 py-2"
                    />
                    <button
                        onClick={handleCopy}
                        className={`px-4 py-2 rounded-lg font-bold text-xs transition-all ${
                            copied 
                            ? 'bg-green-500 text-white' 
                            : 'bg-white text-black border border-gray-200 hover:bg-gray-100'
                        }`}
                    >
                        {copied ? t('review.modal.copied') : t('review.modal.copy')}
                    </button>
                </div>

                <div className="space-y-3">
                    <button
                        onClick={handleStartNow}
                        className="w-full py-3.5 bg-ios-blue hover:bg-blue-600 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-200 active:scale-[0.98]"
                    >
                        {t('review.modal.start')}
                    </button>
                    
                     <button
                        onClick={onEnterDashboard}
                        className="w-full py-3.5 bg-transparent text-ios-blue hover:bg-blue-50 rounded-xl font-bold transition-colors"
                    >
                        {t('review.modal.dashboard')}
                    </button>
                </div>
            </div>
         </div>
       )}
    </div>
  );
};