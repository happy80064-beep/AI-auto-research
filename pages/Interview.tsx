import React, { useEffect, useState, useRef } from 'react';
import { ResearchPlan, TranscriptItem } from '../types';
import { useLiveAgent } from '../hooks/useLiveAgent';
import { Visualizer } from '../components/Visualizer';
import { useLanguage } from '../contexts/LanguageContext';

interface InterviewProps {
  plan: ResearchPlan;
  onFinish: (transcript: string) => void;
}

export const Interview: React.FC<InterviewProps> = ({ plan, onFinish }) => {
  const { t, language } = useLanguage();
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const transcriptRef = useRef<TranscriptItem[]>([]);

  const handleTranscriptUpdate = (text: string, isUser: boolean) => {
    setTranscript(prev => {
        const lastItem = prev[prev.length - 1];
        const role = isUser ? 'user' : 'model';
        
        if (lastItem && lastItem.role === role) {
            const updatedLast = { 
                ...lastItem, 
                text: lastItem.text + text 
            };
            const newTranscript = [...prev.slice(0, -1), updatedLast];
            transcriptRef.current = newTranscript;
            return newTranscript;
        } else {
            const newTranscript = [...prev, {
                role: role,
                text,
                timestamp: Date.now()
            } as TranscriptItem];
            transcriptRef.current = newTranscript;
            return newTranscript;
        }
    });
  };

  const { connect, disconnect, isConnected, isSpeaking, volume } = useLiveAgent({
    systemInstruction: plan.systemInstruction,
    voiceName: plan.voiceSettings?.voiceName,
    onTranscriptUpdate: handleTranscriptUpdate
  });

  const handleEndSession = () => {
    disconnect();
    const fullText = transcriptRef.current.map(t => `${t.role.toUpperCase()}: ${t.text}`).join('\n');
    onFinish(fullText);
  };

  useEffect(() => {
    if (transcript.length > 0) {
        const lastMsg = transcript[transcript.length - 1];
        const lowerText = lastMsg.text.toLowerCase();
        
        // Dynamic End detection keywords based on language context
        const endKeywords = language === 'zh' 
            ? ["访谈结束", "感谢您的参与", "再见"]
            : ["interview is over", "thank you", "goodbye", "end of interview"];
            
        const isEndSignal = endKeywords.some(kw => lowerText.includes(kw));

        if (isEndSignal && isConnected) {
            setTimeout(() => {
                handleEndSession();
            }, 4000); 
        }
    }
  }, [transcript, isConnected, language]);

  // Auto scroll to bottom
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  return (
    <div className="h-screen flex flex-col bg-white relative overflow-hidden">
      
      {/* Dynamic Aura Background */}
      <div className={`absolute inset-0 transition-opacity duration-[2000ms] pointer-events-none ${isSpeaking ? 'opacity-30' : 'opacity-10'}`}>
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-200 rounded-full blur-[150px] animate-pulse" />
      </div>

      {/* Header */}
      <header className="flex justify-between items-center py-4 px-6 bg-white/80 backdrop-blur-lg border-b border-gray-100 z-20 sticky top-0">
          <div className="flex items-center gap-3">
             <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-ios-green shadow-[0_0_8px_rgba(52,199,89,0.5)]' : 'bg-gray-300'}`} />
             <div>
                <h2 className="text-sm font-bold text-black tracking-wide">{t('interview.title')}</h2>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest">
                   {isConnected ? t('interview.status.live') : t('interview.status.idle')}
                </p>
             </div>
          </div>
          <button 
            onClick={handleEndSession}
            className="px-4 py-1.5 bg-gray-100 hover:bg-red-50 text-ios-red rounded-full text-xs font-bold transition-all border border-transparent"
          >
            {t('interview.end')}
          </button>
      </header>

      {/* Conversation Area - iOS Message Style */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-6 space-y-6 custom-scrollbar scroll-smooth bg-white"
      >
            {transcript.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-4">
                    <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center">
                        <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                    </div>
                    <p className="font-medium text-sm">{t('interview.mic_hint')}</p>
                </div>
            )}
            
            {transcript.map((t, idx) => {
                const isUser = t.role === 'user';
                return (
                    <div key={idx} className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 fade-in duration-300`}>
                        <div 
                            className={`max-w-[80%] px-5 py-3 rounded-2xl text-[15px] leading-relaxed shadow-sm ${
                                isUser 
                                ? 'bg-ios-blue text-white rounded-tr-sm' 
                                : 'bg-[#E9E9EB] text-black rounded-tl-sm'
                            }`}
                        >
                            {t.text}
                        </div>
                    </div>
                );
            })}
      </div>

      {/* Bottom Control Bar */}
      <div className="pb-10 pt-6 px-6 bg-white/90 backdrop-blur-xl border-t border-gray-100 z-20 shadow-lg shadow-black/5">
        <div className="max-w-md mx-auto flex flex-col items-center gap-6">
            
            {/* Visualizer */}
            <div className="h-12 w-full flex items-center justify-center">
                <Visualizer volume={volume} isActive={isConnected} isSpeaking={isSpeaking} />
            </div>

            {/* Main Action Button */}
            {!isConnected ? (
                <button
                    onClick={connect}
                    className="group relative flex items-center justify-center w-20 h-20 bg-black rounded-full hover:scale-105 transition-transform duration-300 shadow-xl"
                >
                    <svg className="w-8 h-8 text-white group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                    </svg>
                </button>
            ) : (
                <div className="flex flex-col items-center gap-3">
                    <button
                        onClick={handleEndSession}
                        className="flex items-center justify-center w-20 h-20 bg-red-50 border border-ios-red rounded-full hover:bg-ios-red hover:text-white text-ios-red transition-all duration-300 relative shadow-md"
                    >
                         <div className="w-8 h-8 bg-current rounded-md" />
                    </button>
                    <span className="text-xs text-gray-500 font-medium tracking-wide">{t('interview.end_confirm')}</span>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};