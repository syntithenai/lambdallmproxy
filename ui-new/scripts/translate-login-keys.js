#!/usr/bin/env node

/**
 * Translate new login page marketing copy keys to all languages
 * Uses Spanish as a reference where available
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES_DIR = path.join(__dirname, '../src/i18n/locales');

// Load English (master)
const enPath = path.join(LOCALES_DIR, 'en.json');
const en = JSON.parse(fs.readFileSync(enPath, 'utf-8'));

// New keys from English
const newKeys = {
  whyChooseTitle: en.auth.whyChooseTitle,
  whyChooseIntro: en.auth.whyChooseIntro,
  keyAdvantagesTitle: en.auth.keyAdvantagesTitle,
  webConnected: en.auth.webConnected,
  webConnectedDesc: en.auth.webConnectedDesc,
  multiTool: en.auth.multiTool,
  multiToolDesc: en.auth.multiToolDesc,
  knowledgeBase: en.auth.knowledgeBase,
  knowledgeBaseDesc: en.auth.knowledgeBaseDesc,
  advancedPlanning: en.auth.advancedPlanning,
  advancedPlanningDesc: en.auth.advancedPlanningDesc,
  costEffective: en.auth.costEffective,
  costEffectiveDesc: en.auth.costEffectiveDesc,
  transparency: en.auth.transparency,
  transparencyDesc: en.auth.transparencyDesc,
  perfectFor: en.auth.perfectFor
};

// Translations for each language
const translations = {
  es: {
    whyChooseTitle: "¿Por qué elegir Research Agent?",
    whyChooseIntro: "A diferencia de los chatbots de IA estándar que simplemente responden preguntas, Research Agent es tu compañero integral de investigación diseñado para investigaciones profundas y construcción de conocimiento.",
    keyAdvantagesTitle: "Ventajas Clave:",
    webConnected: "Inteligencia Conectada a la Web",
    webConnectedDesc: "La búsqueda web en tiempo real y extracción de contenido garantizan información actual y precisa, no datos de entrenamiento obsoletos",
    multiTool: "Orquestación Multi-Herramienta",
    multiToolDesc: "Combina perfectamente búsqueda web, ejecución de código, transcripciones de YouTube, generación de imágenes y análisis de documentos en una sola conversación",
    knowledgeBase: "Integración de Base de Conocimiento",
    knowledgeBaseDesc: "Guarda hallazgos en tu base de conocimiento personal, crea fragmentos y construye documentos de investigación integrales con el tiempo",
    advancedPlanning: "Planificación Avanzada",
    advancedPlanningDesc: "Genera planes de investigación estructurados con personas expertas, estrategias de búsqueda y enfoques metodológicos",
    costEffective: "Rentable",
    costEffectiveDesc: "Usa tus propias claves API para costos de $0 en LLM, o aprovecha proveedores gratuitos automáticamente",
    transparency: "Transparencia Total",
    transparencyDesc: "Rastrea cada llamada API, uso de tokens y costos en el panel de facturación en tiempo real",
    perfectFor: "Perfecto para: Investigación académica, análisis de mercado, creación de contenido, documentación técnica, inteligencia competitiva y cualquier tarea que requiera investigación exhaustiva."
  },
  fr: {
    whyChooseTitle: "Pourquoi choisir Research Agent ?",
    whyChooseIntro: "Contrairement aux chatbots IA standards qui répondent simplement aux questions, Research Agent est votre compagnon de recherche complet conçu pour l'investigation approfondie et la construction de connaissances.",
    keyAdvantagesTitle: "Avantages Clés :",
    webConnected: "Intelligence Connectée au Web",
    webConnectedDesc: "La recherche web en temps réel et l'extraction de contenu garantissent des informations actuelles et précises, pas des données d'entraînement obsolètes",
    multiTool: "Orchestration Multi-Outils",
    multiToolDesc: "Combine de manière transparente la recherche web, l'exécution de code, les transcriptions YouTube, la génération d'images et l'analyse de documents dans une seule conversation",
    knowledgeBase: "Intégration de Base de Connaissances",
    knowledgeBaseDesc: "Sauvegardez les découvertes dans votre base de connaissances personnelle, créez des extraits et construisez des documents de recherche complets au fil du temps",
    advancedPlanning: "Planification Avancée",
    advancedPlanningDesc: "Générez des plans de recherche structurés avec des personas experts, des stratégies de recherche et des approches méthodologiques",
    costEffective: "Rentable",
    costEffectiveDesc: "Utilisez vos propres clés API pour des coûts LLM de 0 $, ou exploitez automatiquement les fournisseurs gratuits",
    transparency: "Transparence Totale",
    transparencyDesc: "Suivez chaque appel API, utilisation de jetons et coût dans le tableau de bord de facturation en temps réel",
    perfectFor: "Parfait pour : Recherche académique, analyse de marché, création de contenu, documentation technique, veille concurrentielle et toute tâche nécessitant une investigation approfondie."
  },
  de: {
    whyChooseTitle: "Warum Research Agent wählen?",
    whyChooseIntro: "Im Gegensatz zu Standard-KI-Chatbots, die einfach nur Fragen beantworten, ist Research Agent Ihr umfassender Forschungsbegleiter für tiefgehende Untersuchungen und Wissensaufbau.",
    keyAdvantagesTitle: "Hauptvorteile:",
    webConnected: "Web-verbundene Intelligenz",
    webConnectedDesc: "Echtzeit-Websuche und Content-Extraktion stellen aktuelle, präzise Informationen sicher – keine veralteten Trainingsdaten",
    multiTool: "Multi-Tool-Orchestrierung",
    multiToolDesc: "Kombiniert nahtlos Websuche, Code-Ausführung, YouTube-Transkripte, Bildgenerierung und Dokumentanalyse in einer einzigen Konversation",
    knowledgeBase: "Wissensdatenbank-Integration",
    knowledgeBaseDesc: "Speichern Sie Erkenntnisse in Ihrer persönlichen Wissensdatenbank, erstellen Sie Snippets und bauen Sie im Laufe der Zeit umfassende Forschungsdokumente auf",
    advancedPlanning: "Erweiterte Planung",
    advancedPlanningDesc: "Generieren Sie strukturierte Forschungspläne mit Experten-Personas, Suchstrategien und methodischen Ansätzen",
    costEffective: "Kostengünstig",
    costEffectiveDesc: "Verwenden Sie Ihre eigenen API-Schlüssel für 0 $ LLM-Kosten oder nutzen Sie automatisch kostenlose Anbieter",
    transparency: "Volle Transparenz",
    transparencyDesc: "Verfolgen Sie jeden API-Aufruf, Token-Verbrauch und Kosten im Echtzeit-Abrechnungs-Dashboard",
    perfectFor: "Perfekt für: Akademische Forschung, Marktanalyse, Content-Erstellung, technische Dokumentation, Competitive Intelligence und jede Aufgabe, die gründliche Untersuchungen erfordert."
  },
  nl: {
    whyChooseTitle: "Waarom kiezen voor Research Agent?",
    whyChooseIntro: "In tegenstelling tot standaard AI-chatbots die simpelweg vragen beantwoorden, is Research Agent uw uitgebreide onderzoekspartner gebouwd voor diepgaand onderzoek en kennisopbouw.",
    keyAdvantagesTitle: "Belangrijkste Voordelen:",
    webConnected: "Web-verbonden Intelligentie",
    webConnectedDesc: "Real-time webzoeken en content-extractie zorgen voor actuele, nauwkeurige informatie – geen verouderde trainingsgegevens",
    multiTool: "Multi-Tool Orkestratie",
    multiToolDesc: "Combineert naadloos webzoeken, code-uitvoering, YouTube-transcripties, beeldgeneratie en documentanalyse in één gesprek",
    knowledgeBase: "Kennisbank Integratie",
    knowledgeBaseDesc: "Sla bevindingen op in uw persoonlijke kennisbank, creëer fragmenten en bouw uitgebreide onderzoeksdocumenten in de loop van de tijd",
    advancedPlanning: "Geavanceerde Planning",
    advancedPlanningDesc: "Genereer gestructureerde onderzoeksplannen met expert-persona's, zoekstrategieën en methodologische benaderingen",
    costEffective: "Kosteneffectief",
    costEffectiveDesc: "Gebruik uw eigen API-sleutels voor $0 LLM-kosten, of maak automatisch gebruik van gratis providers",
    transparency: "Volledige Transparantie",
    transparencyDesc: "Volg elke API-aanroep, token-gebruik en kosten in real-time facturatie-dashboard",
    perfectFor: "Perfect voor: Academisch onderzoek, marktanalyse, contentcreatie, technische documentatie, competitieve intelligentie en elke taak die grondig onderzoek vereist."
  },
  pt: {
    whyChooseTitle: "Por que escolher o Research Agent?",
    whyChooseIntro: "Ao contrário dos chatbots de IA padrão que simplesmente respondem perguntas, o Research Agent é seu companheiro de pesquisa abrangente criado para investigação profunda e construção de conhecimento.",
    keyAdvantagesTitle: "Principais Vantagens:",
    webConnected: "Inteligência Conectada à Web",
    webConnectedDesc: "Pesquisa web em tempo real e extração de conteúdo garantem informações atuais e precisas – não dados de treinamento desatualizados",
    multiTool: "Orquestração Multi-Ferramentas",
    multiToolDesc: "Combina perfeitamente pesquisa web, execução de código, transcrições do YouTube, geração de imagens e análise de documentos em uma única conversa",
    knowledgeBase: "Integração de Base de Conhecimento",
    knowledgeBaseDesc: "Salve descobertas em sua base de conhecimento pessoal, crie trechos e construa documentos de pesquisa abrangentes ao longo do tempo",
    advancedPlanning: "Planejamento Avançado",
    advancedPlanningDesc: "Gere planos de pesquisa estruturados com personas especializadas, estratégias de busca e abordagens metodológicas",
    costEffective: "Custo-Efetivo",
    costEffectiveDesc: "Use suas próprias chaves API para custos de $0 de LLM, ou aproveite provedores gratuitos automaticamente",
    transparency: "Transparência Total",
    transparencyDesc: "Rastreie cada chamada de API, uso de tokens e custo no painel de cobrança em tempo real",
    perfectFor: "Perfeito para: Pesquisa acadêmica, análise de mercado, criação de conteúdo, documentação técnica, inteligência competitiva e qualquer tarefa que exija investigação minuciosa."
  },
  ru: {
    whyChooseTitle: "Почему стоит выбрать Research Agent?",
    whyChooseIntro: "В отличие от стандартных AI-чатботов, которые просто отвечают на вопросы, Research Agent — это ваш всеобъемлющий помощник по исследованиям, созданный для глубокого анализа и построения знаний.",
    keyAdvantagesTitle: "Ключевые Преимущества:",
    webConnected: "Интеллект, Подключенный к Интернету",
    webConnectedDesc: "Поиск в реальном времени и извлечение контента обеспечивают актуальную, точную информацию — не устаревшие обучающие данные",
    multiTool: "Оркестрация Нескольких Инструментов",
    multiToolDesc: "Беспрепятственно комбинирует веб-поиск, выполнение кода, транскрипты YouTube, генерацию изображений и анализ документов в одном разговоре",
    knowledgeBase: "Интеграция Базы Знаний",
    knowledgeBaseDesc: "Сохраняйте находки в личную базу знаний, создавайте фрагменты и создавайте всеобъемлющие исследовательские документы со временем",
    advancedPlanning: "Расширенное Планирование",
    advancedPlanningDesc: "Генерируйте структурированные планы исследований с экспертными персонажами, стратегиями поиска и методологическими подходами",
    costEffective: "Экономически Эффективно",
    costEffectiveDesc: "Используйте собственные API-ключи для $0 затрат на LLM или автоматически используйте бесплатных провайдеров",
    transparency: "Полная Прозрачность",
    transparencyDesc: "Отслеживайте каждый вызов API, использование токенов и стоимость на панели выставления счетов в реальном времени",
    perfectFor: "Идеально для: Академических исследований, анализа рынка, создания контента, технической документации, конкурентной разведки и любой задачи, требующей тщательного исследования."
  },
  zh: {
    whyChooseTitle: "为什么选择 Research Agent？",
    whyChooseIntro: "与仅简单回答问题的标准 AI 聊天机器人不同，Research Agent 是您的综合研究伴侣，专为深度调查和知识构建而设计。",
    keyAdvantagesTitle: "关键优势：",
    webConnected: "联网智能",
    webConnectedDesc: "实时网络搜索和内容提取确保您获得最新、准确的信息——而非过时的训练数据",
    multiTool: "多工具编排",
    multiToolDesc: "在单次对话中无缝结合网络搜索、代码执行、YouTube 转录、图像生成和文档分析",
    knowledgeBase: "知识库集成",
    knowledgeBaseDesc: "将发现保存到您的个人知识库，创建片段，并随着时间推移构建全面的研究文档",
    advancedPlanning: "高级规划",
    advancedPlanningDesc: "生成结构化的研究计划，包含专家角色、搜索策略和方法论途径",
    costEffective: "成本效益",
    costEffectiveDesc: "使用您自己的 API 密钥实现 $0 LLM 成本，或自动利用免费提供商",
    transparency: "完全透明",
    transparencyDesc: "在实时计费仪表板中跟踪每个 API 调用、令牌使用情况和成本",
    perfectFor: "适用于：学术研究、市场分析、内容创作、技术文档、竞争情报以及任何需要深入调查的任务。"
  },
  ja: {
    whyChooseTitle: "なぜResearch Agentを選ぶのか？",
    whyChooseIntro: "単に質問に答えるだけの標準的なAIチャットボットとは異なり、Research Agentは深い調査と知識構築のために作られた包括的な研究パートナーです。",
    keyAdvantagesTitle: "主な利点：",
    webConnected: "Web接続インテリジェンス",
    webConnectedDesc: "リアルタイムのWeb検索とコンテンツ抽出により、古いトレーニングデータではなく、最新で正確な情報を確保",
    multiTool: "マルチツールオーケストレーション",
    multiToolDesc: "Web検索、コード実行、YouTubeトランスクリプト、画像生成、ドキュメント分析を単一の会話でシームレスに統合",
    knowledgeBase: "ナレッジベース統合",
    knowledgeBaseDesc: "発見を個人のナレッジベースに保存し、スニペットを作成し、時間の経過とともに包括的な研究ドキュメントを構築",
    advancedPlanning: "高度な計画",
    advancedPlanningDesc: "専門家のペルソナ、検索戦略、方法論的アプローチを含む構造化された研究計画を生成",
    costEffective: "コスト効率",
    costEffectiveDesc: "独自のAPIキーを使用して$0のLLMコストを実現するか、無料プロバイダーを自動的に活用",
    transparency: "完全な透明性",
    transparencyDesc: "リアルタイム請求ダッシュボードですべてのAPI呼び出し、トークン使用量、コストを追跡",
    perfectFor: "最適な用途：学術研究、市場分析、コンテンツ作成、技術文書、競合情報、および徹底的な調査を必要とするあらゆるタスク。"
  },
  ar: {
    whyChooseTitle: "لماذا تختار Research Agent؟",
    whyChooseIntro: "على عكس روبوتات الدردشة القياسية بالذكاء الاصطناعي التي تجيب على الأسئلة ببساطة، Research Agent هو رفيقك الشامل للبحث المصمم للتحقيق العميق وبناء المعرفة.",
    keyAdvantagesTitle: "المزايا الرئيسية:",
    webConnected: "ذكاء متصل بالويب",
    webConnectedDesc: "البحث على الويب في الوقت الفعلي واستخراج المحتوى يضمنان معلومات حالية ودقيقة - وليس بيانات تدريب قديمة",
    multiTool: "تنسيق متعدد الأدوات",
    multiToolDesc: "يجمع بسلاسة بين البحث على الويب وتنفيذ التعليمات البرمجية ونصوص YouTube وتوليد الصور وتحليل المستندات في محادثة واحدة",
    knowledgeBase: "تكامل قاعدة المعرفة",
    knowledgeBaseDesc: "احفظ النتائج في قاعدة المعرفة الشخصية الخاصة بك، وأنشئ مقتطفات، وقم ببناء وثائق بحثية شاملة بمرور الوقت",
    advancedPlanning: "تخطيط متقدم",
    advancedPlanningDesc: "قم بإنشاء خطط بحث منظمة مع شخصيات خبراء واستراتيجيات بحث ومناهج منهجية",
    costEffective: "فعال من حيث التكلفة",
    costEffectiveDesc: "استخدم مفاتيح API الخاصة بك لتكاليف $0 لنماذج اللغة الكبيرة، أو استفد من مزودي الخدمة المجانيين تلقائيًا",
    transparency: "شفافية كاملة",
    transparencyDesc: "تتبع كل استدعاء API واستخدام الرموز والتكلفة في لوحة الفوترة في الوقت الفعلي",
    perfectFor: "مثالي لـ: البحث الأكاديمي، تحليل السوق، إنشاء المحتوى، التوثيق الفني، المعلومات التنافسية، وأي مهمة تتطلب تحقيقًا شاملاً."
  }
};

// Update each language file
const languages = ['es', 'fr', 'de', 'nl', 'pt', 'ru', 'zh', 'ja', 'ar'];

for (const lang of languages) {
  const langPath = path.join(LOCALES_DIR, `${lang}.json`);
  const langData = JSON.parse(fs.readFileSync(langPath, 'utf-8'));
  
  // Add new keys to auth namespace
  Object.assign(langData.auth, translations[lang]);
  
  // Write back
  fs.writeFileSync(langPath, JSON.stringify(langData, null, 2) + '\n', 'utf-8');
  console.log(`✅ Updated ${lang}.json with ${Object.keys(translations[lang]).length} new keys`);
}

console.log('\n✨ All language files updated successfully!');
