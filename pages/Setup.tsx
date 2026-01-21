import React, { useState, useEffect, useRef } from 'react';
import { ResearchContext, ResearchPlan } from '../types';
import { generateResearchPlan } from '../services/geminiService';
import { useLanguage } from '../contexts/LanguageContext';

// Inset Grouped Style Helper Components
interface InputGroupProps {
  label: string;
  children: React.ReactNode;
}

const InputGroup: React.FC<InputGroupProps> = ({ label, children }) => (
  <div className="mb-8">
      <h3 className="text-xs font-medium text-ios-gray uppercase tracking-wider ml-4 mb-2">{label}</h3>
      <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-black/5 divide-y divide-gray-100">
          {children}
      </div>
  </div>
);

interface InputRowProps {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}

const InputRow: React.FC<InputRowProps> = ({ label, children, last = false }) => (
  <div className="flex flex-col md:flex-row md:items-start p-5 bg-white gap-3 md:gap-0">
      <label className="text-black font-bold text-sm md:text-base w-full md:w-32 pt-3 md:pt-3.5 shrink-0">{label}</label>
      <div className="flex-1 w-full">
          {children}
      </div>
  </div>
);

// Styled Input Classes
const inputClass = "w-full bg-gray-50 hover:bg-gray-100 focus:bg-white border border-gray-200 focus:border-ios-blue/50 rounded-xl px-4 py-3.5 text-black text-base outline-none transition-all placeholder-gray-400/60 focus:shadow-[0_0_0_4px_rgba(0,122,255,0.1)]";
const textareaClass = "w-full bg-gray-50 hover:bg-gray-100 focus:bg-white border border-gray-200 focus:border-ios-blue/50 rounded-xl px-4 py-3.5 text-black text-base outline-none transition-all placeholder-gray-400/60 focus:shadow-[0_0_0_4px_rgba(0,122,255,0.1)] min-h-[120px] resize-none leading-relaxed";
const selectClass = "w-full bg-gray-50 hover:bg-gray-100 focus:bg-white border border-gray-200 focus:border-ios-blue/50 rounded-xl px-4 py-3.5 text-black text-base outline-none cursor-pointer appearance-none transition-all focus:shadow-[0_0_0_4px_rgba(0,122,255,0.1)]";

interface SetupProps {
  onDraftGenerated: (plan: ResearchPlan, context: ResearchContext) => void;
  onBack: () => void;
  initialContext?: ResearchContext | null;
}

export const Setup: React.FC<SetupProps> = ({ onDraftGenerated, onBack, initialContext }) => {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [thinkingLogs, setThinkingLogs] = useState<string[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<any>(null);

  // Default context values
  const defaultContext: ResearchContext = {
    objectType: '', // Start empty to force selection/input
    industry: '',
    demographics: '',
    userPersona: '',
    objectives: '',
    method: 'voice',
    questionCount: 8
  };

  const getInitialState = () => {
    const ctx = initialContext ? { ...defaultContext, ...initialContext } : defaultContext;
    // We map localized values back to keys if possible, but for simplicity let's assume standard options map to keys
    // In a real app, we'd store keys and display labels. 
    // Here we'll just check if it matches one of our known keys or is custom.
    
    // For simplicity in this demo, we assume the string values are what we pass to API.
    // Ideally, we should pass language context to API so it knows how to interpret 'Potential User' vs '潜在用户'
    
    return { ctx, sel: ctx.objectType ? 'other' : 'opt.potential' };
  };

  const [state] = useState(getInitialState);
  const [context, setContext] = useState<ResearchContext>(state.ctx);
  const [selectValue, setSelectValue] = useState<string>(state.sel);

  // Auto scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [thinkingLogs]);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectValue(val);
    if (val === 'other') {
      setContext({ ...context, objectType: '' });
    } else {
      setContext({ ...context, objectType: t(val) });
    }
  };

  // Sync initial select value if empty
  useEffect(() => {
     if (!context.objectType && selectValue !== 'other') {
         setContext(prev => ({ ...prev, objectType: t(selectValue) }));
     }
  }, []);

  const handleGenerate = async () => {
    if (!context.objectType.trim()) {
        alert(t('setup.type') + " " + "Required");
        return;
    }
    
    setLoading(true);
    setThinkingLogs([]);

    // Start Simulation of AI Thinking using localized logs
    const steps = [
        t('log.init'),
        `${t('log.graph')}: ${context.industry}`,
        `${t('log.persona')}: ${context.objectType}`,
        `${t('log.demo')}: ${context.demographics}`,
        `${t('log.extract')}: "${context.userPersona.substring(0, 15)}..."`,
        t('log.goal'),
        t('log.model'),
        t('log.tree'),
        t('log.rapport'),
        t('log.explore'),
        t('log.valid'),
        t('log.followup'),
        t('log.prompt'),
        t('log.check')
    ];

    let stepIndex = 0;
    timerRef.current = setInterval(() => {
        if (stepIndex < steps.length) {
            setThinkingLogs(prev => [...prev, steps[stepIndex]]);
            stepIndex++;
        }
    }, 800); 

    try {
      const plan = await generateResearchPlan(context);
      
      clearInterval(timerRef.current);
      setThinkingLogs(prev => [...prev, t('log.done')]);
      
      setTimeout(() => {
          onDraftGenerated(plan, context);
      }, 1000);
    } catch (e) {
      console.error(e);
      clearInterval(timerRef.current);
      setThinkingLogs(prev => [...prev, t('log.fail')]);
      setLoading(false);
    }
  };

  useEffect(() => {
      return () => {
          if (timerRef.current) clearInterval(timerRef.current);
      };
  }, []);

  return (
    <div className="min-h-screen bg-ios-bg pb-20">
      {/* iOS Navigation Bar style */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-black/5 px-6 py-4 flex items-center justify-between shadow-sm">
         <button 
            onClick={onBack}
            className="flex items-center text-ios-blue hover:text-blue-600 transition-colors group"
          >
            <svg className="w-6 h-6 mr-0.5 transform group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-lg font-medium">{t('setup.back')}</span>
          </button>
          <h1 className="text-lg font-bold text-black absolute left-1/2 -translate-x-1/2">{t('setup.title')}</h1>
          <div className="w-16"></div> 
      </div>

      <div className="max-w-7xl mx-auto p-6 animate-in slide-in-from-bottom-4 duration-500">
        
        <div className="text-center mb-10 mt-4">
            <h2 className="text-3xl font-bold text-black mb-2">{t('setup.define_target')}</h2>
            <p className="text-ios-gray">{t('setup.subtitle')}</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 items-start">
            
            {/* Left Column: Inputs */}
            <div className={`flex-1 transition-all duration-500 ease-in-out w-full ${loading ? 'lg:w-1/2' : 'lg:w-2/3 lg:mx-auto'}`}>
                <InputGroup label={t('setup.step1')}>
                    <InputRow label={t('setup.type')}>
                        <div className="flex flex-col gap-3">
                            <div className="relative">
                                <select
                                    className={selectClass}
                                    value={selectValue}
                                    onChange={handleSelectChange}
                                >
                                    <option value="opt.expert">{t('opt.expert')}</option>
                                    <option value="opt.executive">{t('opt.executive')}</option>
                                    <option value="opt.client">{t('opt.client')}</option>
                                    <option value="opt.potential">{t('opt.potential')}</option>
                                    <option value="other">{t('opt.other')}</option>
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </div>
                            {selectValue === 'other' && (
                                <input 
                                    type="text"
                                    className={inputClass}
                                    placeholder={t('setup.placeholder.type')}
                                    value={context.objectType}
                                    onChange={(e) => setContext({ ...context, objectType: e.target.value })}
                                    autoFocus
                                />
                            )}
                        </div>
                    </InputRow>
                    
                    <InputRow label={t('setup.industry')}>
                        <input
                            type="text"
                            className={inputClass}
                            value={context.industry}
                            onChange={(e) => setContext({ ...context, industry: e.target.value })}
                            placeholder={t('setup.placeholder.industry')}
                        />
                    </InputRow>

                    <InputRow label={t('setup.demographics')}>
                        <input
                            type="text"
                            className={inputClass}
                            value={context.demographics}
                            onChange={(e) => setContext({ ...context, demographics: e.target.value })}
                            placeholder={t('setup.placeholder.demo')}
                        />
                    </InputRow>

                    <InputRow label={t('setup.persona')} last>
                        <textarea
                            className={textareaClass}
                            value={context.userPersona}
                            onChange={(e) => setContext({ ...context, userPersona: e.target.value })}
                            placeholder={t('setup.placeholder.persona')}
                        />
                    </InputRow>
                </InputGroup>

                <InputGroup label={t('setup.step2')}>
                    <InputRow label={t('setup.objectives')}>
                        <textarea
                            className={textareaClass}
                            value={context.objectives}
                            onChange={(e) => setContext({ ...context, objectives: e.target.value })}
                            placeholder={t('setup.placeholder.objectives')}
                        />
                    </InputRow>
                    <InputRow label={t('setup.method')}>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setContext({ ...context, method: 'voice' })}
                                className={`flex-1 py-4 px-4 rounded-xl border-2 transition-all duration-300 font-bold text-sm md:text-base flex items-center justify-center gap-2 ${
                                    context.method === 'voice'
                                    ? 'bg-ios-blue text-white border-transparent shadow-lg shadow-blue-200'
                                    : 'bg-white text-gray-500 border-gray-100 hover:border-gray-300 hover:bg-gray-50'
                                }`}
                            >
                                <svg className={`w-5 h-5 ${context.method === 'voice' ? 'text-white' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                </svg>
                                {t('setup.method.voice')}
                            </button>
                            <button
                                onClick={() => setContext({ ...context, method: 'questionnaire' })}
                                className={`flex-1 py-4 px-4 rounded-xl border-2 transition-all duration-300 font-bold text-sm md:text-base flex items-center justify-center gap-2 ${
                                    context.method === 'questionnaire'
                                    ? 'bg-ios-green text-white border-transparent shadow-lg shadow-green-200'
                                    : 'bg-white text-gray-500 border-gray-100 hover:border-gray-300 hover:bg-gray-50'
                                }`}
                            >
                                <svg className={`w-5 h-5 ${context.method === 'questionnaire' ? 'text-white' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                {t('setup.method.questionnaire')}
                            </button>
                        </div>
                    </InputRow>
                    <InputRow label={t('setup.count')} last>
                        <div className="flex items-center gap-4 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
                            <input 
                                type="range" 
                                min="5" 
                                max="20" 
                                step="1"
                                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-ios-blue"
                                value={context.questionCount}
                                onChange={(e) => setContext({ ...context, questionCount: parseInt(e.target.value) })}
                            />
                            <div className="w-12 h-10 flex items-center justify-center bg-white rounded-lg shadow-sm border border-gray-200 font-bold text-ios-blue text-lg">
                                {context.questionCount}
                            </div>
                        </div>
                    </InputRow>
                </InputGroup>

                <div className="mt-8">
                    <button
                    onClick={handleGenerate}
                    disabled={loading}
                    className={`w-full py-4 rounded-2xl font-bold text-lg transition-all duration-300 transform active:scale-[0.98] ${
                        loading
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-ios-blue text-white hover:bg-blue-600 shadow-ios hover:shadow-lg'
                    }`}
                    >
                    {loading ? (
                        <span className="flex items-center justify-center gap-2">
                        <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                        {t('setup.generating')}
                        </span>
                    ) : (
                        t('setup.generate')
                    )}
                    </button>
                </div>
            </div>

            {/* Right Column: AI Thinking Process */}
            {loading && (
                 <div className="lg:w-1/2 w-full animate-in slide-in-from-right duration-700 fade-in fill-mode-forwards">
                    <div className="sticky top-24 bg-[#1C1C1E] rounded-3xl p-6 shadow-2xl border border-white/10 min-h-[500px] flex flex-col font-mono relative overflow-hidden">
                        {/* Decorative Background Elements */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-ios-green/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                        <div className="absolute bottom-0 left-0 w-48 h-48 bg-ios-blue/5 rounded-full blur-3xl -ml-10 -mb-10 pointer-events-none"></div>

                        {/* Header */}
                        <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4 relative z-10">
                            <div className="w-3 h-3 bg-ios-green rounded-full animate-pulse shadow-[0_0_10px_#34C759]"></div>
                            <h3 className="text-lg font-bold tracking-widest uppercase text-white">InsightFlow Core</h3>
                        </div>
                        
                        {/* Logs Area */}
                        <div 
                            ref={logContainerRef}
                            className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-2 relative z-10 scroll-smooth"
                            style={{ maxHeight: '600px' }}
                        >
                            {thinkingLogs.map((log, idx) => (
                                <div key={idx} className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <span className="text-white/30 text-xs mt-1 shrink-0">
                                        {new Date().toLocaleTimeString([], {hour12: false, hour:'2-digit', minute:'2-digit', second:'2-digit'})}
                                    </span>
                                    <span className="text-sm md:text-base font-medium leading-relaxed text-gray-200">
                                        {log && (log.startsWith('✅') ? (
                                            <span className="text-ios-green font-bold text-lg">{log}</span>
                                        ) : log.startsWith('❌') ? (
                                            <span className="text-ios-red font-bold text-lg">{log}</span>
                                        ) : (
                                            <>
                                                <span className="text-ios-green mr-2 text-xs">{'>'}</span>
                                                {log}
                                            </>
                                        ))}
                                    </span>
                                </div>
                            ))}
                            <div className="flex gap-3 animate-pulse opacity-50">
                                <span className="text-white/30 text-xs mt-1">...</span>
                                <span className="w-2 h-5 bg-ios-green/50"></span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
