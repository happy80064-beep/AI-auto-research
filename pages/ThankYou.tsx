import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';

interface ThankYouProps {
  onRestart: () => void;
  onViewReport: () => void;
  isShareLink?: boolean;
}

export const ThankYou: React.FC<ThankYouProps> = ({ onRestart, onViewReport, isShareLink = false }) => {
  const { t } = useLanguage();
  return (
    <div className="h-screen flex flex-col items-center justify-center bg-ios-bg text-black p-6 relative overflow-hidden">
        {/* Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-green-100 rounded-full blur-[120px] opacity-60 pointer-events-none" />
        
        <div className="z-10 flex flex-col items-center max-w-md w-full text-center animate-in zoom-in duration-500">
            <div className="w-24 h-24 bg-green-50 text-ios-green rounded-full flex items-center justify-center mb-8 shadow-lg shadow-green-100">
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
            </div>
            
            <h2 className="text-4xl font-bold mb-4 tracking-tight">{t('thanks.title')}</h2>
            <p className="text-gray-500 mb-12 text-lg leading-relaxed whitespace-pre-line">
                {t('thanks.desc')}
            </p>
            
            {!isShareLink && (
                <button 
                    onClick={onRestart}
                    className="w-full py-4 bg-black text-white hover:bg-gray-800 rounded-2xl font-bold text-lg transition-all shadow-lg active:scale-[0.98]"
                >
                    {t('thanks.home')}
                </button>
            )}
        </div>
    </div>
  );
};