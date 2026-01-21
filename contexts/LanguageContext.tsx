import React, { createContext, useState, useContext, ReactNode } from 'react';

type Language = 'zh' | 'en';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  zh: {
    "greeting.morning": "早上好",
    "greeting.afternoon": "下午好",
    "greeting.evening": "晚上好",
    "app.title": "AI 商业调研伙伴",
    "app.subtitle": "智能商业调研工具\n从逻辑设计到深度洞察，轻松高效搞定商业调研",
    
    // Home
    "home.create.title": "创建调研",
    "home.create.desc": "基于 AI Agent 的自动化访谈与问卷生成。",
    "home.create.sub": "开始新项目",
    "home.dashboard.title": "数据后台",
    "home.dashboard.desc": "全量项目监控、AI 洞察分析与热力图。",
    "home.dashboard.sub": "查看数据分析",

    // Setup
    "setup.title": "创建新调研",
    "setup.back": "首页",
    "setup.define_target": "定义目标",
    "setup.subtitle": "AI 将根据您的输入定制访谈策略",
    "setup.step1": "第一步：调研对象",
    "setup.type": "对象类型",
    "setup.industry": "所处行业",
    "setup.demographics": "基础属性",
    "setup.persona": "画像描述",
    "setup.step2": "第二步：目标设定",
    "setup.objectives": "核心目标",
    "setup.method": "执行方式",
    "setup.method.voice": "AI 语音访谈",
    "setup.method.questionnaire": "问卷调查",
    "setup.count": "题目数量",
    "setup.generate": "生成调研方案",
    "setup.generating": "AI 正在构建策略...",
    "setup.placeholder.type": "例如：全职妈妈、兼职骑手...",
    "setup.placeholder.industry": "例如：SaaS 企业服务、新能源...",
    "setup.placeholder.demo": "例如：25-30岁女性，本科学历...",
    "setup.placeholder.persona": "例如：性格开朗但有选择困难症...",
    "setup.placeholder.objectives": "例如：挖掘其对国货品牌的真实看法...",
    
    // Options
    "opt.expert": "行业专家",
    "opt.executive": "企业高管",
    "opt.client": "企业客户",
    "opt.potential": "潜在用户",
    "opt.other": "自定义...",

    // Plan Review
    "review.title": "方案预览与优化",
    "review.subtitle": "AI 已生成初步策略，您可以手动或 AI 辅助修改",
    "review.confirm": "确认方案并生成链接",
    "review.voice_settings": "AI 访谈官设定",
    "review.gender": "性别",
    "review.male": "男声",
    "review.female": "女声",
    "review.lang": "语言",
    "review.zh": "中文",
    "review.en": "English",
    "review.tone": "声音特色",
    "review.logic": "调研逻辑大纲",
    "review.analysis": "分析体系",
    "review.optimizer": "AI 优化助手",
    "review.optimize_placeholder": "输入优化指令，例如：让语气更专业...",
    "review.submit": "提交",
    "review.system_prompt": "AI 系统设定 (System Prompt)",
    "review.preface": "问卷卷首语",
    "review.questions": "问题列表",
    "review.intent": "意图",
    "review.modal.ready": "调研已就绪",
    "review.modal.desc": "链接已生成，您可以分发给目标用户。",
    "review.modal.copy": "复制",
    "review.modal.copied": "已复制",
    "review.modal.start": "立即开始体验 (Admin)",
    "review.modal.dashboard": "进入数据后台",

    // Interview
    "interview.title": "AI 访谈专家",
    "interview.end": "结束",
    "interview.mic_hint": "点击麦克风开始访谈",
    "interview.end_confirm": "结束访谈",
    "interview.status.live": "进行中",
    "interview.status.idle": "空闲",

    // Questionnaire
    "quest.intro": "感谢您的参与。请根据实际情况回答以下问题。",
    "quest.submit": "提交问卷",
    "quest.placeholder": "请输入您的回答...",
    "quest.scale.unsatisfied": "不满意",
    "quest.scale.satisfied": "满意",

    // Dashboard
    "dash.title": "洞察报告",
    "dash.share": "分享",
    "dash.share_alert": "报告链接已复制",
    "dash.done": "完成",
    "dash.loading": "正在进行深度语义分析...",
    "dash.core_insight": "AI 核心洞察",
    "dash.sentiment": "情感分布",
    "dash.keywords": "高频词云",
    "dash.themes": "话题关注度",

    // Global Dashboard
    "global.title": "管理控制台",
    "global.projects": "项目数",
    "global.responses": "回复总数",
    "global.list_title": "调研项目列表",
    "global.status.active": "进行中",
    "global.overview": "项目概览",
    "global.generate_report": "生成深度报告",
    "global.generating": "AI 撰写中...",
    "global.link": "投放链接",
    "global.participants": "参与人数",
    "global.completed": "已完成场次",
    "global.tab.list": "对话列表",
    "global.list.header.participant": "参与者",
    "global.list.header.status": "状态",
    "global.list.header.date": "日期",
    "global.list.header.type": "类型",
    "global.list.header.msgs": "消息数",
    "global.list.header.action": "操作",
    "global.action.view": "查看",
    "global.status.done": "已完成",
    "global.type.voice": "语音访谈",
    "global.type.quest": "问卷调查",
    "global.empty": "该项目暂无会话记录。",
    "global.analyzing": "AI 正在分析...",
    "global.waiting": "正在等待分析...",
    "global.no_result": "暂无分析结果，请先完成会话。",
    "global.select_hint": "请从列表中选择一个会话以查看报告。",
    "global.report.title": "单场详细分析报告",
    "global.report.topics": "核心议题分布",
    "global.report.sentiment": "情绪光谱",
    "global.report.keywords": "语义热力",

    // Thank You
    "thanks.title": "感谢参与",
    "thanks.desc": "您的回答已记录。\n您的反馈将帮助我们做得更好。",
    "thanks.home": "返回首页",
    
    // Voice Input
    "voice.error.network": "网络不稳定",
    "voice.error.general": "语音错误",
    "voice.error.support": "不支持语音",
    "voice.error.start": "无法启动",

    // Loading Logs
    "log.init": "初始化 Agent: 商业分析师",
    "log.graph": "加载行业知识图谱",
    "log.persona": "解析目标画像",
    "log.demo": "分析基本属性",
    "log.extract": "提取画像特征",
    "log.goal": "设定调研目标",
    "log.model": "构建方法论模型",
    "log.tree": "正在生成访谈逻辑树...",
    "log.rapport": "设计破冰环节...",
    "log.explore": "生成核心探究性问题...",
    "log.valid": "设计验证性问题...",
    "log.followup": "配置 AI 动态追问策略...",
    "log.prompt": "优化系统指令...",
    "log.check": "最终一致性检查...",
    "log.done": "✅ 方案构建完成，正在跳转...",
    "log.fail": "❌ 生成失败，请重试。"
  },
  en: {
    "greeting.morning": "Good Morning",
    "greeting.afternoon": "Good Afternoon",
    "greeting.evening": "Good Evening",
    "app.title": "AI Research Partner",
    "app.subtitle": "Intelligent business research tool.\nFrom logic design to deep insights, efficiently handled.",
    
    // Home
    "home.create.title": "Create Research",
    "home.create.desc": "Automated interview & questionnaire generation powered by AI Agents.",
    "home.create.sub": "Start New Project",
    "home.dashboard.title": "Data Dashboard",
    "home.dashboard.desc": "Comprehensive project monitoring, AI insights, and heatmaps.",
    "home.dashboard.sub": "View Analytics",

    // Setup
    "setup.title": "Create New Research",
    "setup.back": "Home",
    "setup.define_target": "Define Goal",
    "setup.subtitle": "AI will customize the interview strategy based on your input",
    "setup.step1": "Step 1: Research Target",
    "setup.type": "Target Type",
    "setup.industry": "Industry",
    "setup.demographics": "Demographics",
    "setup.persona": "Persona Description",
    "setup.step2": "Step 2: Objectives",
    "setup.objectives": "Core Objectives",
    "setup.method": "Method",
    "setup.method.voice": "AI Voice Interview",
    "setup.method.questionnaire": "Questionnaire",
    "setup.count": "Question Count",
    "setup.generate": "Generate Research Plan",
    "setup.generating": "AI is building strategy...",
    "setup.placeholder.type": "E.g. Stay-at-home mom, Gig worker...",
    "setup.placeholder.industry": "E.g. SaaS, EV, E-commerce...",
    "setup.placeholder.demo": "E.g. 25-30 Female, Bachelor's degree...",
    "setup.placeholder.persona": "E.g. Cheerful but indecisive...",
    "setup.placeholder.objectives": "E.g. Uncover decision path for skincare...",

    // Options
    "opt.expert": "Industry Expert",
    "opt.executive": "Executive",
    "opt.client": "Enterprise Client",
    "opt.potential": "Potential User",
    "opt.other": "Custom...",

    // Plan Review
    "review.title": "Plan Preview & Optimization",
    "review.subtitle": "AI has generated a preliminary strategy, you can edit manually or with AI",
    "review.confirm": "Confirm & Generate Link",
    "review.voice_settings": "AI Interviewer Settings",
    "review.gender": "Gender",
    "review.male": "Male",
    "review.female": "Female",
    "review.lang": "Language",
    "review.zh": "Chinese",
    "review.en": "English",
    "review.tone": "Voice Tone",
    "review.logic": "Research Logic Outline",
    "review.analysis": "Analysis Framework",
    "review.optimizer": "AI Optimizer",
    "review.optimize_placeholder": "Enter instructions, e.g., Make tone more professional...",
    "review.submit": "Submit",
    "review.system_prompt": "System Prompt",
    "review.preface": "Questionnaire Preface",
    "review.questions": "Questions List",
    "review.intent": "Intent",
    "review.modal.ready": "Research Ready",
    "review.modal.desc": "Link generated. You can distribute it to target users.",
    "review.modal.copy": "Copy",
    "review.modal.copied": "Copied",
    "review.modal.start": "Start Experience (Admin)",
    "review.modal.dashboard": "Go to Dashboard",

    // Interview
    "interview.title": "AI Interview Expert",
    "interview.end": "End",
    "interview.mic_hint": "Tap microphone to start interview",
    "interview.end_confirm": "End Interview",
    "interview.status.live": "LIVE",
    "interview.status.idle": "IDLE",

    // Questionnaire
    "quest.intro": "Thank you for participating. Please answer based on your actual situation.",
    "quest.submit": "Submit Questionnaire",
    "quest.placeholder": "Please enter your answer...",
    "quest.scale.unsatisfied": "Unsatisfied",
    "quest.scale.satisfied": "Satisfied",

    // Dashboard
    "dash.title": "Insight Report",
    "dash.share": "Share",
    "dash.share_alert": "Link copied to clipboard",
    "dash.done": "Done",
    "dash.loading": "Analyzing deep semantics...",
    "dash.core_insight": "AI Core Insights",
    "dash.sentiment": "Sentiment Distribution",
    "dash.keywords": "Word Cloud",
    "dash.themes": "Topic Trends",

    // Global Dashboard
    "global.title": "Management Console",
    "global.projects": "Projects",
    "global.responses": "Responses",
    "global.list_title": "Project List",
    "global.status.active": "Active",
    "global.overview": "Project Overview",
    "global.generate_report": "Generate Deep Report",
    "global.generating": "AI Writing...",
    "global.link": "Link",
    "global.participants": "Participants",
    "global.completed": "Completed",
    "global.tab.list": "Conversations",
    "global.list.header.participant": "Participant",
    "global.list.header.status": "Status",
    "global.list.header.date": "Date",
    "global.list.header.type": "Type",
    "global.list.header.msgs": "Msgs",
    "global.list.header.action": "Action",
    "global.action.view": "View",
    "global.status.done": "Done",
    "global.type.voice": "Voice Interview",
    "global.type.quest": "Questionnaire",
    "global.empty": "No session records found.",
    "global.analyzing": "AI Analyzing...",
    "global.waiting": "Waiting for analysis...",
    "global.no_result": "No analysis result yet.",
    "global.select_hint": "Select a session from the list to view report.",
    "global.report.title": "Single Session Analysis",
    "global.report.topics": "Topic Distribution",
    "global.report.sentiment": "Sentiment Spectrum",
    "global.report.keywords": "Semantic Heatmap",

    // Thank You
    "thanks.title": "Thank You",
    "thanks.desc": "Your response has been recorded.\nYour feedback helps us improve.",
    "thanks.home": "Back to Home",

    // Voice Input
    "voice.error.network": "Network unstable",
    "voice.error.general": "Voice error",
    "voice.error.support": "Voice not supported",
    "voice.error.start": "Cannot start",

    // Loading Logs
    "log.init": "Initializing Agent: Business Analyst",
    "log.graph": "Loading Industry Knowledge Graph",
    "log.persona": "Parsing Target Persona",
    "log.demo": "Analyzing Demographics",
    "log.extract": "Extracting Features",
    "log.goal": "Setting Research Goals",
    "log.model": "Building Methodology Model",
    "log.tree": "Generating Interview Logic Tree...",
    "log.rapport": "Designing Rapport Building...",
    "log.explore": "Generating Exploratory Questions...",
    "log.valid": "Designing Validation Questions...",
    "log.followup": "Configuring Follow-up Strategy...",
    "log.prompt": "Optimizing System Prompt...",
    "log.check": "Consistency Check...",
    "log.done": "✅ Plan Ready, Redirecting...",
    "log.fail": "❌ Generation Failed, Retry."
  }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('zh');

  const t = (key: string) => {
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
