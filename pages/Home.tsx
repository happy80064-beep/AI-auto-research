import React, { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

interface HomeProps {
  onCreate: () => void;
  onDashboard: () => void;
}

export const Home: React.FC<HomeProps> = ({ onCreate, onDashboard }) => {
  const { language, setLanguage, t } = useLanguage();
  const [greetingKey, setGreetingKey] = useState<string>('greeting.morning');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const updateGreeting = () => {
      const hour = new Date().getHours();
      if (hour < 12) {
        setGreetingKey('greeting.morning');
      } else if (hour < 18) {
        setGreetingKey('greeting.afternoon');
      } else {
        setGreetingKey('greeting.evening');
      }
    };

    updateGreeting();
    // Update every minute to ensure correctness if page is left open
    const timer = setInterval(updateGreeting, 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-ios-bg text-ios-text flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
      <style>{`
        @keyframes gradient-x {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient-x {
          background-size: 200% auto;
          animation: gradient-x 5s ease infinite;
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .fade-in-up {
          opacity: 0;
          animation: fadeInUp 0.8s ease-out forwards;
        }
      `}</style>

      {/* iOS style segmented control / text toggle */}
      <div className="absolute top-8 right-8 z-30 flex gap-4 text-sm font-medium tracking-wide">
        <button 
            onClick={() => setLanguage('zh')}
            className={`transition-colors duration-300 ${language === 'zh' ? 'text-ios-blue font-semibold' : 'text-ios-gray hover:text-black'}`}
        >
            简体中文
        </button>
        <span className="text-ios-separator">|</span>
        <button 
            onClick={() => setLanguage('en')}
            className={`transition-colors duration-300 ${language === 'en' ? 'text-ios-blue font-semibold' : 'text-ios-gray hover:text-black'}`}
        >
            English
        </button>
      </div>

      {/* Atmospheric Background - Lighter for Light Mode */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] bg-blue-100 rounded-full blur-[100px] opacity-60 mix-blend-multiply" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-purple-100 rounded-full blur-[100px] opacity-60 mix-blend-multiply" />
      </div>

      <div className={`z-10 text-center max-w-4xl w-full space-y-16 transition-opacity duration-1000 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
        
        <div className="space-y-6 flex flex-col items-center">
            {/* Greeting - Fade In Up */}
            <div 
                className="text-ios-blue font-semibold tracking-widest text-xl md:text-2xl uppercase mb-4 fade-in-up"
                style={{ animationDelay: '0.1s' }}
            >
                {t(greetingKey)}
            </div>

            {/* Title - Gradient Animation + Fade In Up */}
            <h1 
                className="text-5xl md:text-7xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-purple-500 to-blue-600 animate-gradient-x drop-shadow-sm pb-2 fade-in-up"
                style={{ animationDelay: '0.3s' }}
            >
                {t('app.title')}
            </h1>
            
            {/* Subtitle - Fade In Up with Delay */}
            <p 
                className="text-xl md:text-2xl text-ios-gray font-normal max-w-2xl mx-auto leading-relaxed whitespace-pre-line tracking-wide fade-in-up"
                style={{ animationDelay: '0.5s' }}
            >
                {t('app.subtitle')}
            </p>
        </div>

        <div 
            className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto w-full fade-in-up"
            style={{ animationDelay: '0.7s' }}
        >
            {/* Create Research Card - iOS Widget Style */}
            <button 
                onClick={onCreate}
                className="group relative h-72 rounded-[32px] bg-white/70 backdrop-blur-xl border border-white/50 p-8 flex flex-col justify-between overflow-hidden hover:bg-white/90 transition-all duration-300 shadow-ios hover:shadow-ios-hover hover:scale-[1.02] text-left ring-1 ring-black/5"
            >
                <div className="relative z-10">
                    <div className="w-14 h-14 rounded-2xl bg-ios-blue/10 text-ios-blue flex items-center justify-center mb-6">
                        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                    </div>
                    <h2 className="text-3xl font-bold text-black mb-2 tracking-tight">{t('home.create.title')}</h2>
                    <p className="text-ios-gray text-base leading-relaxed">
                        {t('home.create.desc')}
                    </p>
                </div>
                
                <div className="relative z-10 flex items-center text-ios-blue font-semibold group-hover:translate-x-1 transition-transform">
                    <span className="mr-2">{t('home.create.sub')}</span>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                </div>
            </button>

            {/* Data Dashboard Card */}
            <button 
                onClick={onDashboard}
                className="group relative h-72 rounded-[32px] bg-white/70 backdrop-blur-xl border border-white/50 p-8 flex flex-col justify-between overflow-hidden hover:bg-white/90 transition-all duration-300 shadow-ios hover:shadow-ios-hover hover:scale-[1.02] text-left ring-1 ring-black/5"
            >
                <div className="relative z-10">
                    <div className="w-14 h-14 rounded-2xl bg-purple-500/10 text-purple-600 flex items-center justify-center mb-6">
                         <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                    </div>
                    <h2 className="text-3xl font-bold text-black mb-2 tracking-tight">{t('home.dashboard.title')}</h2>
                    <p className="text-ios-gray text-base leading-relaxed">
                        {t('home.dashboard.desc')}
                    </p>
                </div>

                <div className="relative z-10 flex items-center text-purple-600 font-semibold group-hover:translate-x-1 transition-transform">
                    <span className="mr-2">{t('home.dashboard.sub')}</span>
                     <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                </div>
            </button>
        </div>
      </div>
    </div>
  );
};