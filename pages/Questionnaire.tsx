import React, { useState, useRef } from 'react';
import { ResearchPlan } from '../types';
import { VoiceInput } from '../components/VoiceInput';
import { useLanguage } from '../contexts/LanguageContext';

interface QuestionnaireProps {
  plan: ResearchPlan;
  onFinish: (transcript: string) => void;
}

export const Questionnaire: React.FC<QuestionnaireProps> = ({ plan, onFinish }) => {
  const { t } = useLanguage();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [activeVoiceId, setActiveVoiceId] = useState<string | null>(null);
  
  const questionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const handleSubmit = () => {
    const transcriptText = plan.questions.map(q => {
      const answer = answers[q.id] || "No Answer";
      return `Question (${q.intent}): ${q.text}\nAnswer: ${answer}\n`;
    }).join('\n');
    onFinish(transcriptText);
  };

  const handleAnswerChange = (id: string, val: string) => {
    setAnswers(prev => ({ ...prev, [id]: val }));
  };

  const handleVoiceStart = (id: string) => {
    setActiveVoiceId(id);
    setTimeout(() => {
        const element = questionRefs.current[id];
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 100);
  };

  const handleVoiceEnd = (id: string) => {
    if (activeVoiceId === id) {
        setActiveVoiceId(null);
    }
  };

  return (
    <div className="min-h-screen bg-ios-bg text-black p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-10">
        <header className="text-center pt-8 pb-4">
          <h1 className="text-3xl font-bold text-black mb-3 tracking-tight">{plan.title}</h1>
          <p className="text-ios-gray text-sm leading-relaxed max-w-lg mx-auto">
              {t('quest.intro')}
          </p>
        </header>

        <div className="space-y-6">
          {plan.questions.map((q, idx) => (
            <div 
                key={q.id} 
                ref={el => { if (el) questionRefs.current[q.id] = el; }}
                className={`bg-white rounded-[24px] p-6 md:p-8 transition-all duration-500 border ${
                    activeVoiceId === q.id 
                    ? 'border-ios-blue shadow-[0_4px_20px_rgba(0,122,255,0.15)] transform scale-[1.01]' 
                    : 'border-black/5 shadow-ios'
                }`}
            >
              <label className="block text-lg font-bold text-black mb-6 leading-snug">
                <span className="text-ios-blue mr-3">{idx + 1}.</span>
                {q.text}
              </label>
              
              {q.type === 'open' && (
                <VoiceInput
                    id={q.id}
                    activeId={activeVoiceId}
                    onVoiceStart={handleVoiceStart}
                    onVoiceEnd={handleVoiceEnd}
                    multiline={true}
                    placeholder={t('quest.placeholder')}
                    value={answers[q.id] || ''}
                    onChange={(val) => handleAnswerChange(q.id, val)}
                    className="bg-ios-input border-transparent focus:bg-white focus:ring-2 focus:ring-ios-blue/20"
                />
              )}

              {q.type === 'scale' && (
                <div className="pt-2">
                    <div className="flex justify-between items-center mb-6 px-1">
                        {[1, 2, 3, 4, 5].map(val => (
                            <button
                            key={val}
                            onClick={() => handleAnswerChange(q.id, val.toString())}
                            className={`w-12 h-12 md:w-14 md:h-14 rounded-full font-bold text-lg transition-all duration-300 ${
                                answers[q.id] === val.toString()
                                ? 'bg-ios-blue text-white scale-110 shadow-lg shadow-blue-200'
                                : 'bg-ios-input text-gray-500 hover:bg-gray-200'
                            }`}
                            >
                            {val}
                            </button>
                        ))}
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 font-medium px-2">
                        <span>{q.scaleLabels?.[0] || t('quest.scale.unsatisfied')}</span>
                        <span>{q.scaleLabels?.[1] || t('quest.scale.satisfied')}</span>
                    </div>
                </div>
              )}

              {q.type === 'choice' && (
                 <VoiceInput
                    id={q.id}
                    activeId={activeVoiceId}
                    onVoiceStart={handleVoiceStart}
                    onVoiceEnd={handleVoiceEnd}
                    placeholder={t('quest.placeholder')}
                    value={answers[q.id] || ''}
                    onChange={(val) => handleAnswerChange(q.id, val)}
                    className="bg-ios-input border-transparent focus:bg-white focus:ring-2 focus:ring-ios-blue/20"
                />
              )}
            </div>
          ))}
        </div>

        <div className="pt-8 pb-20">
            <button
                onClick={handleSubmit}
                className="w-full py-4 bg-black text-white font-bold text-lg rounded-2xl hover:bg-gray-800 transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-2"
            >
                <span>{t('quest.submit')}</span>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
                </svg>
            </button>
        </div>
      </div>
    </div>
  );
};