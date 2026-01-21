import React, { useEffect, useState } from 'react';
import { AnalysisResult } from '../types';
import { analyzeTranscripts } from '../services/geminiService';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useLanguage } from '../contexts/LanguageContext';

interface DashboardProps {
  fullTranscript: string;
  onRestart: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ fullTranscript, onRestart }) => {
  const { t } = useLanguage();
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const runAnalysis = async () => {
      try {
        const result = await analyzeTranscripts(fullTranscript);
        setAnalysis(result);
      } catch (e) {
        console.error("Analysis failed", e);
      } finally {
        setLoading(false);
      }
    };
    runAnalysis();
  }, [fullTranscript]);

  if (loading) {
    return (
      <div className="h-screen bg-ios-bg flex flex-col items-center justify-center text-black space-y-6">
        <div className="w-16 h-16 border-4 border-ios-blue border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xl font-medium tracking-tight animate-pulse text-gray-500">{t('dash.loading')}</p>
      </div>
    );
  }

  if (!analysis) return <div className="p-10 text-black bg-ios-bg h-screen">Analysis Failed. Please retry.</div>;

  const maxKeywordCount = analysis.keywords ? Math.max(...analysis.keywords.map(k => k.count)) : 1;

  const COLORS = ['#007AFF', '#34C759', '#FF3B30', '#FFCC00', '#AF52DE', '#5856D6'];

  return (
    <div className="min-h-screen bg-ios-bg text-black p-6 md:p-10">
      <header className="flex justify-between items-center mb-10">
        <h1 className="text-3xl font-bold tracking-tight">{t('dash.title')}</h1>
        <div className="flex gap-4">
            <button 
                onClick={() => alert(t('dash.share_alert'))}
                className="px-5 py-2.5 bg-white rounded-full hover:bg-gray-100 text-sm font-medium transition-colors border border-gray-200 shadow-sm"
            >
                {t('dash.share')}
            </button>
            <button 
                onClick={onRestart}
                className="px-5 py-2.5 bg-ios-blue rounded-full hover:bg-blue-600 text-white text-sm font-bold shadow-lg shadow-blue-200 transition-colors"
            >
                {t('dash.done')}
            </button>
        </div>
      </header>

      {/* Bento Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* 1. Summary Card - Large */}
        <div className="md:col-span-2 lg:col-span-2 row-span-2 bg-white rounded-[32px] p-8 border border-black/5 shadow-ios relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-blue-100 transition-colors duration-700"></div>
            <h3 className="text-xl font-bold mb-6 text-black flex items-center gap-2 relative z-10">
                <svg className="w-6 h-6 text-ios-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {t('dash.core_insight')}
            </h3>
            <div className="prose prose-p:text-gray-600 prose-p:text-base prose-p:leading-relaxed max-w-none relative z-10 whitespace-pre-line">
                {analysis.summary}
            </div>
        </div>

        {/* 2. Sentiment - Medium */}
        <div className="md:col-span-1 lg:col-span-1 bg-white rounded-[32px] p-6 border border-black/5 shadow-ios flex flex-col">
            <h3 className="text-lg font-bold mb-4 text-black">{t('dash.sentiment')}</h3>
            <div className="flex-1 min-h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={analysis.sentiment}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={70}
                            paddingAngle={5}
                            dataKey="value"
                            stroke="none"
                        >
                            {analysis.sentiment.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip 
                            contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: '12px', border: '1px solid #eee', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                            itemStyle={{ color: '#000', fontSize: '12px' }}
                        />
                    </PieChart>
                </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-3 mt-2 flex-wrap">
                {analysis.sentiment.map((s, i) => (
                    <div key={s.name} className="flex items-center gap-1.5 bg-gray-100 px-2 py-1 rounded-md">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color || COLORS[i % COLORS.length] }} />
                        <span className="text-[10px] text-gray-600 font-medium uppercase">{s.name}</span>
                    </div>
                ))}
            </div>
        </div>

        {/* 3. Keywords - Medium */}
        <div className="md:col-span-1 lg:col-span-1 bg-white rounded-[32px] p-6 border border-black/5 shadow-ios overflow-hidden">
             <h3 className="text-lg font-bold mb-4 text-black">{t('dash.keywords')}</h3>
             <div className="flex flex-wrap gap-2 content-start h-full overflow-y-auto custom-scrollbar pb-4">
                {analysis.keywords && analysis.keywords.slice(0, 15).map((kw, index) => {
                    const intensity = kw.count / maxKeywordCount;
                    return (
                        <div 
                            key={index}
                            className={`rounded-full px-3 py-1 text-xs font-medium border border-transparent transition-all cursor-default hover:scale-105`}
                            style={{ 
                                backgroundColor: `rgba(255, 59, 48, ${0.1 + intensity * 0.3})`, 
                                color: '#FF3B30',
                            }}
                        >
                            {kw.word}
                        </div>
                    );
                })}
             </div>
        </div>

        {/* 4. Themes - Wide */}
        <div className="md:col-span-2 lg:col-span-2 bg-white rounded-[32px] p-6 border border-black/5 shadow-ios">
            <h3 className="text-lg font-bold mb-6 text-black">{t('dash.themes')}</h3>
            <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analysis.themes} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                        <XAxis dataKey="topic" stroke="#999" tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                        <YAxis stroke="#999" tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                        <Tooltip 
                            cursor={{fill: '#f5f5f5'}}
                            contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: '12px', border: '1px solid #eee', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        />
                        <Bar dataKey="count" fill="#007AFF" radius={[6, 6, 6, 6]} barSize={20} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>

      </div>
    </div>
  );
};