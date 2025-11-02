import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { triggerWelcomeWizard } from '../utils/auth';
import { useAuth } from '../contexts/AuthContext';

export function HelpPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'features' | 'planning' | 'tools' | 'rag' | 'pricing'>('features');
  const contentRef = useRef<HTMLDivElement>(null);

  // Reset scroll to top when tab changes
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  const tabs = [
    { id: 'features' as const, label: 'Features & Advantages', icon: '✨' },
    { id: 'planning' as const, label: 'Planning & SWAG', icon: '📋' },
    { id: 'tools' as const, label: 'Backend LLM Tools', icon: '🔧' },
    { id: 'rag' as const, label: 'Browser RAG', icon: '🧠' },
    { id: 'pricing' as const, label: 'Pricing', icon: '💰' },
  ];

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b dark:border-gray-700 sticky top-0 z-10 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
            aria-label="Back to chat"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Help & Documentation</h1>
        </div>
        <button
          onClick={() => navigate('/privacy')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <span>🔒</span>
          <span className="text-sm font-medium">Privacy Policy</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-2 border-b dark:border-gray-700 overflow-x-auto bg-gray-50 dark:bg-gray-800 sticky top-[73px] z-10">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 sm:px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
            }`}
          >
            <span>{tab.icon}</span>
            <span className="text-sm font-medium hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl text-left">
          {activeTab === 'features' && <FeaturesContent />}
          {activeTab === 'planning' && <PlanningContent />}
          {activeTab === 'tools' && <ToolsContent />}
          {activeTab === 'rag' && <RAGContent />}
          {activeTab === 'pricing' && <PricingContent />}
        </div>
      </div>
    </div>
  );
}

function FeaturesContent() {
  const { isAuthenticated } = useAuth();
  
  return (
    <div className="space-y-6 text-gray-800 dark:text-gray-200 text-left">
      <h2 className="text-3xl font-bold mb-4 text-left">Features & Advantages</h2>
      
      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-green-600 dark:text-green-400">🎯 Why Research Agent is Better Than ChatGPT</h3>
        <div className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 p-5 rounded-lg border-2 border-green-300 dark:border-green-700 mb-6">
          <p className="mb-4">
            While ChatGPT is a powerful AI assistant, Research Agent offers significant advantages for users who want more control, 
            flexibility, and cost optimization:
          </p>
          
          <div className="space-y-3">
            <div className="border-l-4 border-green-500 pl-4">
              <p className="font-semibold text-green-700 dark:text-green-300">✅ Access Multiple AI Providers</p>
              <p className="text-sm">Choose from OpenAI, Google Gemini, Groq, Together AI, and custom endpoints - not locked into a single provider. 
              Switch between models seamlessly to find the best fit for each task. Distribute the load among providers to minimise rate limits and costs.</p>
            </div>
            
            <div className="border-l-4 border-teal-500 pl-4">
              <p className="font-semibold text-teal-700 dark:text-teal-300">✅ Automatic Model Selection</p>
              <p className="text-sm">The system intelligently decides what kind of model is a suitable balance between cost and effectiveness 
              for your query. No point in paying Einstein to do basic maths - simple questions get fast, cheap models while complex reasoning 
              tasks get more powerful models.</p>
            </div>
            
            <div className="border-l-4 border-blue-500 pl-4">
              <p className="font-semibold text-blue-700 dark:text-blue-300">✅ Massive Cost Savings with BYOK</p>
              <p className="text-sm">Bring Your Own API Keys and pay $0 for LLM operations! Use Groq's unlimited free tier or Google Gemini's generous 
              quotas. Only pay minimal infrastructure fees (~$0.0004 per request) instead of ChatGPT Plus $20/month.</p>
            </div>
            
            <div className="border-l-4 border-purple-500 pl-4">
              <p className="font-semibold text-purple-700 dark:text-purple-300">✅ Advanced Planning & Research Tools</p>
              <p className="text-sm">Built-in planning mode breaks complex questions into steps. Integrated web search (DuckDuckGo, Tavily), 
              advanced web scraping (Puppeteer, Playwright, Selenium), and YouTube integration for comprehensive research.</p>
            </div>
            
            <div className="border-l-4 border-amber-500 pl-4">
              <p className="font-semibold text-amber-700 dark:text-amber-300">✅ Persistent Iteration</p>
              <p className="text-sm">The agent is prompted to be generous with calling tools and generating responses to make sure you get 
              the answers you want. An assessor call is made before giving up on your request, ensuring thorough and complete responses.</p>
            </div>
            
            <div className="border-l-4 border-orange-500 pl-4">
              <p className="font-semibold text-orange-700 dark:text-orange-300">✅ Knowledge Management with Browser RAG</p>
              <p className="text-sm">Save snippets to your personal knowledge base, create semantic embeddings, and retrieve relevant context 
              during conversations. Optional Google Drive sync keeps your data accessible across devices.</p>
            </div>
            
            <div className="border-l-4 border-teal-500 pl-4">
              <p className="font-semibold text-teal-700 dark:text-teal-300">✅ Learning Support</p>
              <p className="text-sm">Curated feed to fire your imagination and interactive quizzes to lock down memories with spaced repetition. 
              Track your progress and retain what you learn.</p>
            </div>
            
            <div className="border-l-4 border-pink-500 pl-4">
              <p className="font-semibold text-pink-700 dark:text-pink-300">✅ Full Transparency & Control</p>
              <p className="text-sm">See exact costs for each request, token counts, model selection reasoning, and detailed API interactions. 
              Enable/disable specific tools, customize provider priorities, and maintain complete control over your AI usage.</p>
            </div>
            
            <div className="border-l-4 border-indigo-500 pl-4">
              <p className="font-semibold text-indigo-700 dark:text-indigo-300">✅ Privacy-First Architecture</p>
              <p className="text-sm">Chat history and content stored locally in your browser's IndexedDB - not on our servers. When using your 
              own API keys, your prompts go directly from Lambda to your chosen provider with no middleman storage.</p>
            </div>
          </div>
        </div>
      </section>
      
      {/* Only show welcome tour section for authenticated users */}
      {isAuthenticated && (
        <section className="space-y-4">
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 p-5 rounded-lg border-2 border-indigo-300 dark:border-indigo-700">
            <h3 className="text-xl font-semibold text-indigo-600 dark:text-indigo-400 mb-3">🎓 New to Research Agent?</h3>
            <p className="mb-3 text-sm">
              If you're just getting started or want a quick refresher on the key features, you can replay the interactive welcome tour 
              that introduces you to the main components of the application.
            </p>
            <button
              onClick={triggerWelcomeWizard}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium"
            >
              <span>🎓</span>
              <span>Replay Welcome Tour</span>
            </button>
          </div>
        </section>
      )}
      
      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🚀 Multi-Provider LLM Access with Intelligent Load Balancing</h3>
        <p className="mb-3">
          Access multiple AI providers seamlessly through a single interface. The system intelligently selects 
          the best provider for each request using sophisticated load balancing that considers multiple factors 
          to optimize performance, cost, and reliability.
        </p>
        
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800 mb-4">
          <p className="font-semibold mb-2">Smart Provider Selection Considers:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <p className="font-medium text-blue-700 dark:text-blue-300">Performance Factors:</p>
              <ul className="list-disc pl-5 mt-1 space-y-1">
                <li>Model capability requirements</li>
                <li>Response speed optimization</li>
                <li>Current API availability</li>
                <li>Rate limit status</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-blue-700 dark:text-blue-300">Cost & Strategy:</p>
              <ul className="list-disc pl-5 mt-1 space-y-1">
                <li>Pricing tier optimization</li>
                <li>Free tier preference</li>
                <li>Custom priority settings</li>
                <li>Fallback chain resilience</li>
              </ul>
            </div>
          </div>
        </div>

        <p className="font-medium mb-2">Supported Providers:</p>
        <div className="space-y-2 pl-4">
          <p><strong>OpenAI:</strong> Industry-leading models including GPT-4, GPT-4o, GPT-4 Turbo, and GPT-4o-mini for high-quality generation and reasoning tasks.</p>
          <p><strong>Google Gemini:</strong> Advanced multimodal models (Gemini 1.5 Pro, 2.0 Flash, 2.5 Pro) with generous free tier limits for cost-effective usage.</p>
          <p><strong>Groq:</strong> Ultra-fast inference engine delivering responses up to 10x faster using Llama, Mixtral, and Gemma models, perfect for real-time applications.</p>
          <p><strong>Together AI:</strong> Access to cutting-edge open source models including Llama 4, DeepSeek, and specialized models, with trial credits available.</p>
          <p><strong>Custom Endpoints:</strong> Bring your own OpenAI-compatible API endpoints for complete flexibility and control over model selection.</p>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🔍 Web Search & Scraping Integration</h3>
        <p className="mb-3">
          Get real-time information and extract content from any website using integrated search and advanced web scraping capabilities. 
          The system intelligently handles both simple searches and complex data extraction with multiple fallback strategies.
        </p>
        
        <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg border border-purple-200 dark:border-purple-800 mb-4">
          <p className="font-semibold mb-2">Web Search Capabilities:</p>
          <div className="space-y-2">
            <p><strong>DuckDuckGo Search:</strong> Privacy-focused web search that doesn't track your queries or build user profiles, ideal for general information retrieval and finding relevant URLs.</p>
            <p><strong>Tavily AI:</strong> Advanced AI-powered research engine optimized for gathering comprehensive information from multiple sources (requires API key).</p>
            <p><strong>Automatic Citation:</strong> All search results include source URLs, allowing you to verify information and explore topics further.</p>
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="font-semibold mb-3">Advanced Web Scraping Tools:</p>
          <p className="mb-3">
            Extract structured content from websites that require JavaScript execution, handle anti-bot protection, or need complex 
            interactions. The system automatically selects the best scraping method based on the target site's requirements.
          </p>
          
          <div className="space-y-3 mb-3">
            <div className="border-l-4 border-blue-500 pl-3">
              <p className="font-medium text-blue-700 dark:text-blue-300">Direct HTTP Scraping</p>
              <p className="text-sm">Fast extraction of static HTML content using standard HTTP requests - ideal for simple pages and APIs.</p>
            </div>
            
            <div className="border-l-4 border-purple-500 pl-3">
              <p className="font-medium text-purple-700 dark:text-purple-300">Puppeteer Scraping</p>
              <p className="text-sm">Headless Chrome automation for JavaScript-heavy sites - executes page scripts, waits for dynamic content, 
              and can interact with elements before extraction.</p>
            </div>
            
            <div className="border-l-4 border-green-500 pl-3">
              <p className="font-medium text-green-700 dark:text-green-300">Playwright Scraping (Self-Hosted)</p>
              <p className="text-sm">Cross-browser automation with advanced capabilities - supports multiple browser engines, automatic waiting 
              for elements, and sophisticated page interaction patterns. <strong>Only available when running the service on your own computer</strong> 
              (see <a href="https://github.com/syntithenai/lambdallmproxy" target="_blank" rel="noopener noreferrer" className="text-green-600 dark:text-green-400 hover:underline">GitHub repo</a>), 
              with the advantage of not paying infrastructure costs.</p>
            </div>
            
            <div className="border-l-4 border-orange-500 pl-3">
              <p className="font-medium text-orange-700 dark:text-orange-300">Selenium Scraping (Self-Hosted)</p>
              <p className="text-sm">Industry-standard browser automation with extensive ecosystem - handles complex workflows, form submissions, 
              and sites with strict anti-automation measures. <strong>Only available when running the service on your own computer</strong> 
              (see <a href="https://github.com/syntithenai/lambdallmproxy" target="_blank" rel="noopener noreferrer" className="text-orange-600 dark:text-orange-400 hover:underline">GitHub repo</a>), 
              with the advantage of not paying infrastructure costs.</p>
            </div>
          </div>

          <div className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/30 dark:to-red-900/30 p-3 rounded-lg border border-orange-300 dark:border-orange-700">
            <p className="font-semibold text-orange-800 dark:text-orange-200 mb-2">🛡️ Residential Proxy Support (Optional)</p>
            <p className="text-sm">
              For websites with stringent bot detection and protection systems, the scraper can route requests through residential proxy networks. 
              This provides real residential IP addresses that appear as legitimate users, allowing successful data extraction from sites that 
              block datacenter IPs, implement CAPTCHA challenges, or employ sophisticated fingerprinting techniques. Particularly useful for 
              e-commerce sites, social media platforms, and services with aggressive anti-scraping measures.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🎯 Intelligent Planning Mode</h3>
        <p className="mb-2">
          Complex queries benefit from planning before execution. Planning mode breaks down sophisticated questions 
          into manageable steps, executes them efficiently, and synthesizes results into comprehensive answers.
        </p>
        <div className="space-y-2 pl-4">
          <p><strong>Research Planning:</strong> Automatically decomposes complex questions into focused sub-queries for thorough investigation.</p>
          <p><strong>Multi-Step Execution:</strong> Sequentially executes searches, analyzes intermediate results, and adapts the research strategy based on findings.</p>
          <p><strong>Cost Optimization:</strong> Minimizes token usage by planning efficient query sequences and avoiding redundant API calls.</p>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🎨 Rich Media Support</h3>
        <div className="space-y-2 pl-4">
          <p><strong>Image Generation:</strong> Create images using DALL-E 3, Stable Diffusion, or Flux models with customizable styles and quality settings.</p>
          <p><strong>Chart Generation:</strong> Visualize data and processes with Mermaid diagrams including flowcharts, sequence diagrams, Gantt charts, and more.</p>
          <p><strong>YouTube Integration:</strong> Search for videos, extract transcripts, and analyze video content without leaving the interface.</p>
          <p><strong>Audio Transcription:</strong> Convert audio and video files to searchable text using OpenAI's Whisper model with high accuracy.</p>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-cyan-600 dark:text-cyan-400">🎯 Personalized Learning Feed</h3>
        <div className="space-y-2 pl-4">
          <p><strong>Content Discovery:</strong> Get a personalized feed of fascinating facts, news, and educational content tailored to your interests. The Feed learns from your interactions to surface increasingly relevant content.</p>
          <p><strong>Interactive Quizzes:</strong> Test your knowledge with auto-generated quizzes based on feed content. Track your learning progress and retain information through active recall.</p>
          <p><strong>Smart Filtering:</strong> Upvote content you enjoy to see more like it. Downvote to block topics and prevent similar content from appearing in future feeds.</p>
          <p><strong>Seamless Chat Integration:</strong> Click the chat button on any feed item to dive deeper, ask questions, or explore topics in more detail with AI assistance.</p>
          <p><strong>Maturity Levels:</strong> Customize content appropriateness with child-safe, youth-focused, adult, or academic maturity filters in Settings.</p>
        </div>
        
        <div className="bg-cyan-50 dark:bg-cyan-900/20 p-4 rounded-lg border border-cyan-200 dark:border-cyan-800 mt-3">
          <p className="font-semibold mb-2 text-cyan-700 dark:text-cyan-300">📊 How Downvoting Works</p>
          <div className="space-y-2 text-sm">
            <p><strong>Topic Blocking:</strong> When you downvote a feed item, all its associated topics are automatically added to your blocked list. Future feed generation will avoid content related to these topics.</p>
            <p><strong>Persistent Filtering:</strong> Blocked topics are stored permanently in your browser's IndexedDB until you manually remove them from Settings → Feed tab.</p>
            <p><strong>Granular Control:</strong> You can review your complete blocked topics list at any time and remove individual topics if you change your mind.</p>
            <p><strong>Learning Over Time:</strong> The more you interact with feed items (upvoting and downvoting), the better the system understands your preferences and delivers more relevant content.</p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">💾 Knowledge Management</h3>
        <div className="space-y-2 pl-4">
          <p><strong>Content Management:</strong> Save snippets, images, and links to your personal knowledge base with tagging and organization features.</p>
          <p><strong>Browser RAG:</strong> Search your saved content using semantic embeddings for intelligent context retrieval during conversations.</p>
          <p><strong>Chat History:</strong> Persistent storage of all conversations with full-text search capabilities for easy reference.</p>
          <p><strong>Google Drive Sync:</strong> Optionally backup your content to your personal Google Drive for cross-device access and data persistence.</p>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">� Learning Support</h3>
        <div className="space-y-2 pl-4">
          <p><strong>Curated Feed:</strong> A personalized feed to fire your imagination with interesting content, discoveries, and ideas worth exploring.</p>
          <p><strong>Interactive Quizzes:</strong> Lock down memories with spaced repetition quizzes that help you retain what you learn.</p>
          <p><strong>Progress Tracking:</strong> Monitor your learning journey with quiz analytics and performance insights.</p>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">�🎵 Media Playback</h3>
        <div className="space-y-2 pl-4">
          <p><strong>Background Player:</strong> Play audio content from YouTube, podcasts, and other sources while continuing to use the chat interface.</p>
          <p><strong>Playlists:</strong> Queue multiple audio tracks and manage playback with standard controls.</p>
          <p><strong>Chromecast Support:</strong> Cast audio to compatible TV speakers or smart devices for enhanced listening experience.</p>
        </div>
      </section>
    </div>
  );
}

function PlanningContent() {
  return (
    <div className="space-y-6 text-gray-800 dark:text-gray-200 text-left">
      <h2 className="text-3xl font-bold mb-4 text-left">Planning Wizard, Todos & Content Management for Long-Term Thinking</h2>
      
      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">📋 Creating Effective Plans</h3>
        <p className="mb-3">
          Whether you're tackling complex research, building documents, or managing multi-step projects, effective 
          planning helps the AI deliver better results. You can create plans explicitly using the <strong>"Create a Plan"</strong> button 
          in the chat interface, or let the AI generate them automatically based on your needs.
        </p>

        <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 p-5 rounded-lg border border-blue-200 dark:border-blue-800 mb-4">
          <p className="font-semibold mb-4 text-lg">The Planning Process:</p>
          
          <div className="space-y-6">
            <div className="border-l-4 border-blue-500 pl-4">
              <strong className="text-blue-700 dark:text-blue-300 block mb-2">1. Define Clear Objectives</strong>
              <p className="text-sm mb-3">
                Start with a detailed prompt that specifies what you want to achieve, the format you need, 
                and any constraints or requirements. The more specific your initial request, the better the AI can plan.
              </p>
              <div className="bg-white dark:bg-gray-800/50 p-3 rounded border border-blue-200 dark:border-blue-700">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Example Prompts:</p>
                <div className="space-y-2 text-xs italic text-gray-700 dark:text-gray-300">
                  <p>💬 "Create a comprehensive analysis of renewable energy trends, including solar, wind, and hydro. 
                  I need statistics from 2020-2024, key market players, and future projections. Format as a structured report."</p>
                  <p>💬 "Build a 5-week curriculum for learning Python from scratch, with daily exercises, weekly projects, 
                  and assessment milestones. Target audience is complete beginners."</p>
                  <p>💬 "Research the top 10 productivity apps for remote teams, compare their features, pricing, and user reviews, 
                  then create a decision matrix with recommendations for different team sizes."</p>
                  <p>💬 "Develop a marketing strategy for launching a new mobile app. Include target audience analysis, 
                  competitive landscape, channel recommendations, and a 90-day action plan with budget estimates."</p>
                </div>
              </div>
            </div>

            <hr className="border-gray-300 dark:border-gray-600" />

            <div className="border-l-4 border-purple-500 pl-4">
              <strong className="text-purple-700 dark:text-purple-300 block mb-2">2. Use Iteration & Tools</strong>
              <p className="text-sm mb-3">
                Plans work best when they leverage available tools strategically. The AI can break down 
                complex tasks into steps that use web search for research, snippets for building documents incrementally, 
                and todos for tracking progress across multiple sessions.
              </p>
              <div className="bg-white dark:bg-gray-800/50 p-3 rounded border border-purple-200 dark:border-purple-700">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Example Workflow:</p>
                <p className="text-xs text-gray-700 dark:text-gray-300">
                  Search for recent data → Save findings to snippets → Create todo items for each section 
                  → Build document piece by piece → Reference saved snippets when needed
                </p>
              </div>
            </div>

            <hr className="border-gray-300 dark:border-gray-600" />

            <div className="border-l-4 border-green-500 pl-4">
              <strong className="text-green-700 dark:text-green-300 block mb-2">3. Enable Planning Wizard (Optional)</strong>
              <p className="text-sm mb-3">
                For research-heavy tasks, click the <strong>"Create a Plan"</strong> button in the chat interface to activate the Planning Wizard. 
                This creates an explicit research plan before executing searches, ensuring comprehensive coverage and avoiding redundant queries.
              </p>
              <div className="bg-white dark:bg-gray-800/50 p-3 rounded border border-green-200 dark:border-green-700">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">When to Use Planning Wizard:</p>
                <ul className="text-xs space-y-1 pl-4 text-gray-700 dark:text-gray-300">
                  <li>• Multi-source research requiring synthesis from 5+ websites</li>
                  <li>• Comparative analysis needing structured data gathering</li>
                  <li>• Complex topics where you need to ensure thorough coverage</li>
                  <li>• Time-sensitive research where you want to avoid re-searching</li>
                </ul>
              </div>
            </div>

            <hr className="border-gray-300 dark:border-gray-600" />

            <div className="border-l-4 border-orange-500 pl-4">
              <strong className="text-orange-700 dark:text-orange-300 block mb-2">4. Build Incrementally with Snippets</strong>
              <p className="text-sm mb-3">
                For document creation, use the snippet management tool to build content incrementally. 
                The AI can save sections as snippets, update them as new information arrives, and reference them in future conversations 
                to maintain consistency.
              </p>
              <div className="bg-white dark:bg-gray-800/50 p-3 rounded border border-orange-200 dark:border-orange-700">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Pro Tip:</p>
                <p className="text-xs italic text-gray-700 dark:text-gray-300">
                  Tag snippets by topic (e.g., "renewable-energy-solar", "renewable-energy-wind") for easy retrieval
                </p>
              </div>
            </div>

            <hr className="border-gray-300 dark:border-gray-600" />

            <div className="border-l-4 border-red-500 pl-4">
              <strong className="text-red-700 dark:text-red-300 block mb-2">5. Track with Todos</strong>
              <p className="text-sm mb-3">
                Use the todo management tool to track multi-step projects across sessions. The AI can 
                create tasks, mark them complete as work progresses, and maintain context about what's been done and what remains.
              </p>
              <div className="bg-white dark:bg-gray-800/50 p-3 rounded border border-red-200 dark:border-red-700">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Example Prompts:</p>
                <div className="space-y-1 text-xs italic text-gray-700 dark:text-gray-300">
                  <p>💬 "Create a todo list for organizing a conference: venue booking, speaker outreach, marketing plan, registration setup"</p>
                  <p>💬 "Break down the website redesign project into actionable tasks with priorities"</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
          <p className="font-semibold mb-2">💡 Pro Tip: Detailed Prompts = Better Plans</p>
          <p className="text-sm">
            When asking the AI to create a plan (either by clicking <strong>"Create a Plan"</strong> or through natural language), 
            be explicit about your requirements, desired format, timeline, and any specific sources or constraints. The AI will use 
            this information to generate a structured plan with clear steps, tool usage, and success criteria.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">✅ Backend Todo Management</h3>
        <p className="mb-2">
          The <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">manage_todos</code> tool provides persistent 
          task tracking that works across all your chat sessions.
        </p>
        <div className="space-y-2 pl-4">
          <p><strong>Task Tracking:</strong> The AI can create, update, and complete tasks automatically as you work through projects.</p>
          <p><strong>Multi-Turn Context:</strong> Todos persist across chat sessions, allowing you to pause work and resume later without losing context.</p>
          <p><strong>Project Management:</strong> Break down large tasks into manageable steps, track dependencies, and maintain a clear picture of progress.</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800 mt-3">
          <p className="font-medium mb-2">Example Usage:</p>
          <p className="text-sm italic">"Create a todo list for building a web scraper: research libraries, write code, test with sample data, deploy to production"</p>
          <p className="text-xs mt-2 text-gray-600 dark:text-gray-400">The AI will create structured todos and can mark them complete as you make progress</p>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🎒 Content Management</h3>
        <p className="mb-2">
          Your personal knowledge repository for saving, organizing, and retrieving information across sessions.
        </p>
        <div className="space-y-2 pl-4">
          <p><strong>Save Anything:</strong> Store text snippets, code blocks, images, links, and any other content you want to reference later.</p>
          <p><strong>Organize with Tags:</strong> Categorize content using tags for easy filtering and retrieval by topic or project.</p>
          <p><strong>Search & Filter:</strong> Find content quickly using full-text search, tag filters, or content type.</p>
          <p><strong>Generate Embeddings:</strong> Enable semantic search across your content to find relevant information by meaning, not just keywords.</p>
          <p><strong>Cloud Sync:</strong> Backup your content to Google Drive for persistence across devices and browsers.</p>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800 mt-3">
          <p className="font-semibold mb-2">🎯 Long-Term Knowledge Building:</p>
          <p className="text-sm">Combine Planning Mode, Todos, and Content Management to build a growing knowledge base over time. 
          Save research findings as you discover them, reference past work using RAG semantic search, track ongoing projects with todos, 
          and build comprehensive documents incrementally using saved snippets.</p>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">📝 Google Sheets Integration</h3>
        <p className="mb-2">
          The <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">manage_snippets</code> tool provides cloud-based 
          snippet storage with Google Sheets integration.
        </p>
        <div className="space-y-2 pl-4">
          <p><strong>Cloud Storage:</strong> Snippets are automatically synced to a Google Sheet in your Drive for permanent storage.</p>
          <p><strong>Collaborative:</strong> Share your snippet sheets with team members for collaborative knowledge management.</p>
          <p><strong>Always Available:</strong> Access your snippets from any device by connecting to your Google account.</p>
        </div>
      </section>
    </div>
  );
}

function ToolsContent() {
  return (
    <div className="space-y-6 text-gray-800 dark:text-gray-200 text-left">
      <h2 className="text-3xl font-bold mb-4 text-left">Backend LLM Tools</h2>
      
      <p className="text-lg mb-4">
        The AI has access to powerful backend tools that it can call automatically when needed. 
        Enable or disable specific tools in <strong>Settings → Tools</strong> to control which capabilities are available.
      </p>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🔧 Available Tools</h3>
        
        <div className="space-y-4">
          <ToolCard
            name="web_search"
            icon="🔍"
            description="Search the web using DuckDuckGo for current information, news, and research"
            trigger="Automatically triggered when current information is needed"
            examples={[
              "What's the current price of Bitcoin?",
              "Find the latest research on climate change mitigation strategies",
              "What are the top news stories today about artificial intelligence?"
            ]}
          />
          
          <ToolCard
            name="execute_js"
            icon="⚡"
            description="Execute JavaScript code for calculations, data processing, and algorithmic tasks"
            trigger="Triggered when computation or data manipulation is needed"
            examples={[
              "Calculate the Fibonacci sequence up to the 20th number",
              "Sort this list of numbers: [42, 17, 93, 8, 51] and find the median",
              "Generate a random password with 16 characters including symbols"
            ]}
          />
          
          <ToolCard
            name="scrape_url"
            icon="🌐"
            description="Extract and analyze content from any publicly accessible URL"
            trigger="Triggered when a specific webpage needs to be analyzed"
            examples={[
              "Summarize the main points from https://example.com/article",
              "Extract all the product prices from this e-commerce page",
              "What are the key features described on this documentation page?"
            ]}
          />
          
          <ToolCard
            name="youtube"
            icon="🎥"
            description="Search YouTube and extract video transcripts for analysis"
            trigger="Triggered when YouTube content is mentioned"
            examples={[
              "Find videos about machine learning fundamentals",
              "Get the transcript from this YouTube video about quantum computing",
              "Search for tutorials on React hooks and summarize the top result"
            ]}
          />
          
          <ToolCard
            name="transcribe"
            icon="🎙️"
            description="Transcribe audio and video files using OpenAI's Whisper model"
            trigger="User uploads an audio or video file"
            examples={[
              "Upload an MP3 recording and ask: 'Transcribe this interview'",
              "Transcribe this podcast episode and create a summary",
              "Convert this meeting recording to text and extract action items"
            ]}
          />
          
          <ToolCard
            name="generate_chart"
            icon="📊"
            description="Create diagrams and visualizations using Mermaid syntax"
            trigger="Triggered when visualization is requested"
            examples={[
              "Create a flowchart showing the user authentication process",
              "Generate a sequence diagram for a REST API call",
              "Draw a Gantt chart for a 3-month software development project"
            ]}
          />
          
          <ToolCard
            name="generate_image"
            icon="🎨"
            description="Generate images using DALL-E 3, Stable Diffusion, or Flux models"
            trigger="Triggered when image generation is requested"
            examples={[
              "Generate an image of a sunset over mountains in watercolor style",
              "Create a professional headshot of a businesswoman in an office",
              "Design a logo for a coffee shop with a minimalist aesthetic"
            ]}
          />
          
          <ToolCard
            name="search_knowledge_base"
            icon="📚"
            description="Search server-side knowledge base (separate from local RAG)"
            trigger="Manually enabled tool - searches backend embeddings"
            examples={[
              "Search the knowledge base for information about API authentication",
              "Find all documentation related to database schema design",
              "What does the knowledge base say about deployment procedures?"
            ]}
          />
          
          <ToolCard
            name="manage_todos"
            icon="✅"
            description="Create, update, and manage a persistent todo list across chat sessions"
            trigger="Triggered when task management is discussed"
            examples={[
              "Add a todo to finish the quarterly report by Friday",
              "Create a checklist for preparing the product launch",
              "Mark the 'Review design mockups' todo as complete"
            ]}
          />
          
          <ToolCard
            name="manage_snippets"
            icon="📋"
            description="Save and retrieve text snippets to Google Sheets for later reference"
            trigger="Triggered when snippet storage is requested"
            examples={[
              "Save this code snippet for later: [code block]",
              "Store these meeting notes in my snippets",
              "Retrieve all snippets tagged with 'python-tips'"
            ]}
          />
          
          <ToolCard
            name="ask_llm"
            icon="🤖"
            description="Recursive LLM agent for complex multi-step reasoning (HIGH token usage)"
            trigger="⚠️ DISABLED by default - HIGH token usage"
            examples={[
              "Use deep reasoning to analyze the ethical implications of AI governance",
              "Break down this complex business problem into strategic recommendations",
              "Perform a comprehensive competitive analysis with multiple perspectives"
            ]}
            warning="Can result in very high API costs due to recursive calls"
          />
          
          <ToolCard
            name="generate_reasoning_chain"
            icon="🧠"
            description="Deep reasoning chains for academic-level problem-solving (EXTREME token usage)"
            trigger="⚠️ DISABLED by default - EXTREME token usage"
            examples={[
              "Prove this mathematical theorem using step-by-step logical reasoning",
              "Analyze the philosophical arguments for and against utilitarianism",
              "Develop a comprehensive research methodology for studying climate patterns"
            ]}
            warning="Can result in extremely high API costs due to extensive reasoning chains"
          />
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">💡 How to Use Tools</h3>
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <ol className="space-y-3">
            <li className="border-l-4 border-blue-500 pl-3">
              <strong>1. Enable tools</strong> in Settings → Tools by toggling the switches for the capabilities you want available
            </li>
            <li className="border-l-4 border-purple-500 pl-3">
              <strong>2. Ask naturally</strong> - The AI will automatically call the right tool based on your request context
            </li>
            <li className="border-l-4 border-green-500 pl-3">
              <strong>3. Check responses</strong> - Tool calls are shown in the chat with their inputs and outputs
            </li>
            <li className="border-l-4 border-orange-500 pl-3">
              <strong>4. Review costs</strong> - Tool usage affects API billing, especially for compute-intensive operations
            </li>
          </ol>
        </div>
      </section>
    </div>
  );
}

interface ToolCardProps {
  name: string;
  icon: string;
  description: string;
  trigger: string;
  examples: string[];
  warning?: string;
}

function ToolCard({ name, icon, description, trigger, examples, warning }: ToolCardProps) {
  return (
    <div className="border dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
      <div className="flex items-start gap-3">
        <span className="text-2xl">{icon}</span>
        <div className="flex-1">
          <h4 className="font-semibold text-lg">
            <code className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded text-sm">{name}</code>
          </h4>
          <p className="text-gray-700 dark:text-gray-300 mt-2">{description}</p>
          <div className="mt-3 text-sm">
            <p className="text-gray-600 dark:text-gray-400 mb-2"><strong>Triggered:</strong> {trigger}</p>
            <p className="font-medium text-blue-700 dark:text-blue-300 mb-1">Example Uses:</p>
            <ul className="space-y-1 pl-4">
              {examples.map((example, index) => (
                <li key={index} className="text-blue-600 dark:text-blue-400 text-sm">
                  💬 "{example}"
                </li>
              ))}
            </ul>
          </div>
          {warning && (
            <div className="mt-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-200 dark:border-red-800">
              ⚠️ {warning}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RAGContent() {
  return (
    <div className="space-y-6 text-gray-800 dark:text-gray-200 text-left">
      <h2 className="text-3xl font-bold mb-4 text-left">Browser-Based RAG (Retrieval Augmented Generation)</h2>
      
      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🧠 What is RAG and Why Use It?</h3>
        <p className="mb-3">
          RAG (Retrieval Augmented Generation) is a system for capturing, managing, and intelligently retrieving content 
          from your conversations and saved materials. It enhances AI responses by finding and injecting relevant context 
          from your personal knowledge base before generating answers.
        </p>
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="font-semibold mb-2">Core Purpose:</p>
          <ul className="space-y-2 text-sm pl-4">
            <li className="border-l-4 border-blue-500 pl-3">
              <strong>Capture:</strong> Save valuable content from LLM responses, your own notes, code snippets, and research findings
            </li>
            <li className="border-l-4 border-purple-500 pl-3">
              <strong>Manage:</strong> Organize content with tags, search by keywords, and generate embeddings for semantic search
            </li>
            <li className="border-l-4 border-green-500 pl-3">
              <strong>Retrieve:</strong> Automatically find relevant content when you ask questions, ensuring the AI has access to your accumulated knowledge
            </li>
            <li className="border-l-4 border-orange-500 pl-3">
              <strong>Export:</strong> Download your knowledge base or sync to Google Drive for backup and cross-device access
            </li>
          </ul>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">
          Everything runs in your browser using local embeddings - your content never leaves your device unless you explicitly sync to Google Drive.
        </p>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">� Interaction Modes</h3>
        <div className="space-y-3">
          <div className="border-2 border-green-500 dark:border-green-600 rounded-lg p-4 bg-green-50 dark:bg-green-900/20">
            <h4 className="font-semibold text-green-800 dark:text-green-200 mb-2">✅ Automatic Injection (Recommended)</h4>
            <p className="text-sm mb-2">
              When you enable "Use Knowledge Base Context" in the chat interface, the system automatically:
            </p>
            <ol className="text-sm space-y-1 pl-5">
              <li>1. Takes your query and generates an embedding for it</li>
              <li>2. Searches your knowledge base for semantically similar content</li>
              <li>3. Injects the top matching snippets into the conversation context</li>
              <li>4. The AI uses this context when generating its response</li>
            </ol>
            <p className="text-xs mt-2 text-gray-600 dark:text-gray-400 italic">
              This happens transparently - you don't need to manually select what context to include
            </p>
          </div>

          <div className="border-2 border-blue-500 dark:border-blue-600 rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20">
            <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">📎 Explicit Attach Context (Manual Control)</h4>
            <p className="text-sm mb-2">
              Alternatively, you can manually control what context to include:
            </p>
            <ol className="text-sm space-y-1 pl-5">
              <li>1. Browse your saved content in the Content Management page</li>
              <li>2. Select specific snippets you want to reference</li>
              <li>3. Use the "Attach to Chat" feature to explicitly include them</li>
              <li>4. The selected content is added to your next message</li>
            </ol>
            <p className="text-xs mt-2 text-gray-600 dark:text-gray-400 italic">
              Useful when you know exactly which content is relevant, or want to control token usage
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🚀 How to Use Browser RAG</h3>
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 p-6 rounded-lg border border-purple-200 dark:border-purple-800">
          <ol className="space-y-4">
            <li className="border-l-4 border-purple-500 pl-4">
              <strong className="text-purple-700 dark:text-purple-300">Step 1: Save Content</strong>
              <p className="text-sm mt-1">
                Navigate to the Content Management page and add text snippets, code blocks, research notes, or any content 
                you want to reference later. You can save content from LLM responses directly or paste your own material.
              </p>
            </li>
            <li className="border-l-4 border-pink-500 pl-4">
              <strong className="text-pink-700 dark:text-pink-300">Step 2: Generate Embeddings</strong>
              <p className="text-sm mt-1">
                Select snippets and click "Generate Embeddings". This creates vector representations using a local ML model 
                (Transformers.js) running in your browser. Embeddings enable semantic search by meaning rather than keywords.
              </p>
            </li>
            <li className="border-l-4 border-blue-500 pl-4">
              <strong className="text-blue-700 dark:text-blue-300">Step 3: Enable RAG in Chat</strong>
              <p className="text-sm mt-1">
                In the chat interface, check "Use Knowledge Base Context" to enable automatic context injection. The system 
                will search your knowledge base for each query and include relevant snippets.
              </p>
            </li>
            <li className="border-l-4 border-green-500 pl-4">
              <strong className="text-green-700 dark:text-green-300">Step 4: Ask Questions</strong>
              <p className="text-sm mt-1">
                Ask questions naturally. The AI will automatically search your knowledge base and use relevant snippets 
                to provide more informed, personalized responses based on your accumulated knowledge.
              </p>
            </li>
          </ol>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">✨ Features</h3>
        <div className="space-y-2 pl-4">
          <p><strong>Local Processing:</strong> Embeddings are generated in your browser using Transformers.js - no data sent to external servers for the embedding process.</p>
          <p><strong>Privacy First:</strong> Your content stays on your device unless you explicitly enable Google Drive sync for backup.</p>
          <p><strong>Semantic Search:</strong> Find content by meaning and context, not just exact keyword matches.</p>
          <p><strong>Smart Ranking:</strong> Most relevant snippets are prioritized using cosine similarity scoring.</p>
          <p><strong>Chunk Management:</strong> Large content is automatically split into optimal-sized chunks for better retrieval accuracy.</p>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">💾 Storage & Sync</h3>
        <div className="space-y-2 pl-4">
          <p><strong>IndexedDB:</strong> All snippets and embeddings are stored locally in your browser's IndexedDB for instant access.</p>
          <p><strong>Google Drive Backup:</strong> Enable optional cloud sync to back up your content to Google Drive for persistence across browsers and devices.</p>
          <p><strong>Browser Storage Limits:</strong> Most modern browsers allow several GB of IndexedDB storage, sufficient for extensive knowledge bases.</p>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800 mt-2 text-sm">
          <p className="font-medium">⚠️ Note on Storage:</p>
          <p>While browser storage is generous, very large knowledge bases (100,000+ snippets) may impact performance. 
          Consider organizing content into focused collections and archiving older material if needed.</p>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🎯 Best Practices</h3>
        <div className="space-y-3">
          <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
            <p className="font-medium text-green-800 dark:text-green-200 mb-2">✅ Do:</p>
            <ul className="space-y-1 text-sm pl-5">
              <li>Save well-organized, focused snippets with clear topics</li>
              <li>Use descriptive tags for categorization (e.g., "python-tutorial", "project-ideas")</li>
              <li>Generate embeddings for content you'll reference often in conversations</li>
              <li>Keep individual snippets under 10,000 characters for optimal retrieval</li>
              <li>Regularly review and archive outdated content</li>
            </ul>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-800">
            <p className="font-medium text-red-800 dark:text-red-200 mb-2">❌ Don't:</p>
            <ul className="space-y-1 text-sm pl-5">
              <li>Save duplicate or highly redundant content (wastes storage and degrades search quality)</li>
              <li>Store sensitive passwords, API keys, or credentials (use a password manager instead)</li>
              <li>Expect perfect recall with poorly organized or vague snippets</li>
              <li>Generate embeddings for content you'll never search (wastes processing time)</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🆚 Browser RAG vs Server Knowledge Base</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full border dark:border-gray-700">
            <thead className="bg-gray-100 dark:bg-gray-800">
              <tr>
                <th className="border dark:border-gray-700 px-4 py-2 text-left font-semibold">Feature</th>
                <th className="border dark:border-gray-700 px-4 py-2 text-left font-semibold">Browser RAG (Local)</th>
                <th className="border dark:border-gray-700 px-4 py-2 text-left font-semibold">Server KB Tool</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              <tr>
                <td className="border dark:border-gray-700 px-4 py-2 font-medium">Data Location</td>
                <td className="border dark:border-gray-700 px-4 py-2">Your browser (IndexedDB)</td>
                <td className="border dark:border-gray-700 px-4 py-2">Backend server</td>
              </tr>
              <tr className="bg-gray-50 dark:bg-gray-800/50">
                <td className="border dark:border-gray-700 px-4 py-2 font-medium">Privacy</td>
                <td className="border dark:border-gray-700 px-4 py-2 text-green-600 dark:text-green-400">100% private (offline)</td>
                <td className="border dark:border-gray-700 px-4 py-2 text-orange-600 dark:text-orange-400">Shared with backend</td>
              </tr>
              <tr>
                <td className="border dark:border-gray-700 px-4 py-2 font-medium">Content Source</td>
                <td className="border dark:border-gray-700 px-4 py-2">Your saved content</td>
                <td className="border dark:border-gray-700 px-4 py-2">Admin-uploaded documents</td>
              </tr>
              <tr className="bg-gray-50 dark:bg-gray-800/50">
                <td className="border dark:border-gray-700 px-4 py-2 font-medium">Setup Required</td>
                <td className="border dark:border-gray-700 px-4 py-2 text-green-600 dark:text-green-400">Automatic (built-in)</td>
                <td className="border dark:border-gray-700 px-4 py-2 text-orange-600 dark:text-orange-400">Enable in Settings</td>
              </tr>
              <tr>
                <td className="border dark:border-gray-700 px-4 py-2 font-medium">Use Case</td>
                <td className="border dark:border-gray-700 px-4 py-2">Personal knowledge base</td>
                <td className="border dark:border-gray-700 px-4 py-2">Shared documentation</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PricingContent() {
  return (
    <div className="space-y-6 text-gray-800 dark:text-gray-200 text-left">
      <h2 className="text-3xl font-bold mb-4 text-left">Pricing</h2>
      
      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">💰 Credit-Based System</h3>
        <p className="mb-3">
          Transparent prepaid credit system - you can't spend more than you choose. Credits never expire.
        </p>
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="font-semibold mb-2">🎁 Welcome Bonus: $0.50 in free credits for new users!</p>
          <p className="text-sm">Start experimenting with the service immediately - no payment required to try it out.</p>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">💳 Purchasing Credits</h3>
        <div className="space-y-3">
          <div className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 p-4 rounded-lg border-2 border-green-300 dark:border-green-700">
            <p className="font-semibold text-lg mb-2">Quick Add Credits</p>
            <p className="text-sm mb-3">Navigate to <strong>Billing → Add Credits</strong> to purchase more credits instantly.</p>
            <ul className="space-y-1 text-sm pl-4">
              <li><strong>Minimum Purchase:</strong> $5.00 USD</li>
              <li><strong>Payment Method:</strong> PayPal (secure checkout)</li>
              <li><strong>No Expiration:</strong> Credits never expire</li>
              <li><strong>Instant Availability:</strong> Credits appear immediately after payment</li>
              <li><strong>No Refunds:</strong> All sales are final</li>
            </ul>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Check your current balance and transaction history on the Billing page anytime.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">📊 Complete Pricing Breakdown</h3>
        <p className="mb-3">Understanding your costs is straightforward - we charge for two things:</p>
        
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 p-5 rounded-lg border-2 border-blue-300 dark:border-blue-700 mb-4">
          <h4 className="font-bold text-lg mb-3">1. AWS Infrastructure Costs (Always Charged)</h4>
          <p className="text-sm mb-3">
            Every request incurs a small infrastructure fee to cover AWS Lambda hosting. We charge a <strong>6x markup</strong> on 
            total AWS costs (industry standard is 3-10x).
          </p>
          
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-blue-200 dark:border-blue-700 mb-3">
            <p className="font-semibold mb-2 text-sm">AWS Cost Components (Example: 512MB, 800ms execution):</p>
            <div className="space-y-1 text-xs font-mono">
              <div className="flex justify-between border-b dark:border-gray-600 pb-1">
                <span>Lambda Compute:</span>
                <span>$0.00000667</span>
              </div>
              <div className="flex justify-between border-b dark:border-gray-600 pb-1">
                <span>Lambda Request:</span>
                <span>$0.00000020</span>
              </div>
              <div className="flex justify-between border-b dark:border-gray-600 pb-1">
                <span>CloudWatch Logs:</span>
                <span>$0.00000102</span>
              </div>
              <div className="flex justify-between border-b dark:border-gray-600 pb-1">
                <span>Data Transfer Out:</span>
                <span>$0.00000036</span>
              </div>
              <div className="flex justify-between border-b dark:border-gray-600 pb-1">
                <span>S3 Storage:</span>
                <span>$0.00000003</span>
              </div>
              <div className="flex justify-between font-bold text-sm pt-2 border-t-2 dark:border-gray-500">
                <span>Total AWS Cost:</span>
                <span>$0.00001087</span>
              </div>
              <div className="flex justify-between text-blue-600 dark:text-blue-400 font-bold text-sm pt-1">
                <span>With 6x markup:</span>
                <span>$0.00006522</span>
              </div>
            </div>
          </div>
          
          <p className="text-xs text-gray-600 dark:text-gray-400">
            <strong>Per 1,000 requests:</strong> $0.065 infrastructure cost<br/>
            <strong>Why 6x?</strong> Industry competitive: AWS API Gateway (3-6x), Twilio (1.3x), SendGrid (3x), Stripe (1.6x)
          </p>
        </div>

        <div className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 p-5 rounded-lg border-2 border-orange-300 dark:border-orange-700 mb-4">
          <h4 className="font-bold text-lg mb-3">2. LLM API Costs (Depends on Configuration)</h4>
          
          <div className="space-y-3">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-orange-200 dark:border-orange-700">
              <p className="font-semibold text-orange-700 dark:text-orange-300 mb-2">Option A: Server-Provided Keys</p>
              <p className="text-sm mb-2">Convenient for occasional use, no setup required.</p>
              <p className="text-sm font-mono">
                <strong>Cost:</strong> Provider pricing + 25% surcharge<br/>
                <strong>Example:</strong> $0.10 LLM call → <span className="text-orange-600 dark:text-orange-400 font-bold">$0.125 charged</span>
              </p>
            </div>
            
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border-2 border-green-500 dark:border-green-600">
              <p className="font-semibold text-green-700 dark:text-green-300 mb-2">Option B: Bring Your Own Keys (BYOK) - RECOMMENDED ⭐</p>
              <p className="text-sm mb-2">Regular users, cost-conscious users, access to free tiers.</p>
              <p className="text-sm font-mono">
                <strong>Cost:</strong> <span className="text-green-600 dark:text-green-400 font-bold text-lg">$0.00</span> (you pay provider directly!)<br/>
                <strong>Only Pay:</strong> Infrastructure fee (~$0.00007/request)
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-2 dark:border-gray-600 text-sm">
            <thead className="bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-900 dark:to-purple-900">
              <tr>
                <th className="border dark:border-gray-600 px-4 py-3 text-left font-bold">Configuration</th>
                <th className="border dark:border-gray-600 px-4 py-3 text-left font-bold">LLM Cost (100 requests)</th>
                <th className="border dark:border-gray-600 px-4 py-3 text-left font-bold">Infrastructure</th>
                <th className="border dark:border-gray-600 px-4 py-3 text-left font-bold">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-white dark:bg-gray-800">
                <td className="border dark:border-gray-600 px-4 py-3 font-semibold">Server Keys</td>
                <td className="border dark:border-gray-600 px-4 py-3">
                  $10.00 + 25% = <strong className="text-orange-600 dark:text-orange-400">$12.50</strong>
                </td>
                <td className="border dark:border-gray-600 px-4 py-3">$0.0065</td>
                <td className="border dark:border-gray-600 px-4 py-3 font-bold text-orange-600 dark:text-orange-400">$12.51</td>
              </tr>
              <tr className="bg-green-50 dark:bg-green-900/20">
                <td className="border dark:border-gray-600 px-4 py-3 font-semibold">BYOK (OpenAI)</td>
                <td className="border dark:border-gray-600 px-4 py-3">
                  <strong className="text-green-600 dark:text-green-400">$0.00</strong> (paid direct)
                </td>
                <td className="border dark:border-gray-600 px-4 py-3">$0.0065</td>
                <td className="border dark:border-gray-600 px-4 py-3 font-bold text-green-600 dark:text-green-400">$0.0065</td>
              </tr>
              <tr className="bg-gradient-to-r from-green-100 to-blue-100 dark:from-green-900/30 dark:to-blue-900/30">
                <td className="border dark:border-gray-600 px-4 py-3 font-semibold">BYOK (Groq Free Tier)</td>
                <td className="border dark:border-gray-600 px-4 py-3">
                  <strong className="text-green-600 dark:text-green-400">$0.00</strong> (free tier!)
                </td>
                <td className="border dark:border-gray-600 px-4 py-3">$0.0065</td>
                <td className="border dark:border-gray-600 px-4 py-3 font-bold text-green-600 dark:text-green-400">$0.0065</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800 mt-4">
          <p className="font-semibold mb-2">💡 Massive Savings with BYOK:</p>
          <p className="text-sm">
            Bring Your Own Key (BYOK) users save <strong>99.5%</strong> on total costs! Pay only the minimal infrastructure fee 
            (~$0.07 per 1,000 requests). Use free tier providers like Groq or Gemini and your LLM costs are literally $0.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🔑 Bring Your Own API Keys (BYOK)</h3>
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 p-5 rounded-lg border-2 border-purple-300 dark:border-purple-700">
          <p className="font-semibold mb-3 text-lg">Why use your own API keys?</p>
          <div className="space-y-3">
            <div className="border-l-4 border-green-500 pl-4">
              <p className="font-semibold text-green-700 dark:text-green-300">✅ Zero LLM Surcharge</p>
              <p className="text-sm">Avoid the 25% markup - you only pay the small Lambda infrastructure fee ($0.0001-0.0005 per request).</p>
            </div>
            <div className="border-l-4 border-blue-500 pl-4">
              <p className="font-semibold text-blue-700 dark:text-blue-300">✅ Access Free Tier Plans</p>
              <p className="text-sm">Use Groq's free tier (unlimited), Google Gemini's free tier, or Together AI's trial credits directly. 
              These generous free quotas mean you pay almost nothing for LLM usage.</p>
            </div>
            <div className="border-l-4 border-purple-500 pl-4">
              <p className="font-semibold text-purple-700 dark:text-purple-300">✅ Wider Model Selection</p>
              <p className="text-sm">Access all models available to your account, including latest releases, specialized models, 
              and experimental features not available through server-side keys.</p>
            </div>
            <div className="border-l-4 border-orange-500 pl-4">
              <p className="font-semibold text-orange-700 dark:text-orange-300">✅ Full Control</p>
              <p className="text-sm">Choose exactly which providers and models to use, set your own rate limits, and manage your own API budgets.</p>
            </div>
            <div className="border-l-4 border-pink-500 pl-4">
              <p className="font-semibold text-pink-700 dark:text-pink-300">✅ Better Privacy</p>
              <p className="text-sm">Your prompts go directly from Lambda to your API provider - the service owner doesn't need to manage server-side keys.</p>
            </div>
          </div>
          <div className="mt-4 bg-white dark:bg-gray-800 p-3 rounded-lg">
            <p className="text-sm font-semibold mb-1">How to add your API keys:</p>
            <p className="text-sm">Go to <strong>Settings → Providers → Add Provider</strong> and enter your API key from OpenAI, Groq, Gemini, Together AI, or any OpenAI-compatible endpoint.</p>
          </div>
        </div>

        <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 p-5 rounded-lg border-2 border-blue-300 dark:border-blue-700">
          <h4 className="text-lg font-semibold text-blue-800 dark:text-blue-200 mb-3">🔑 Where to Get API Keys</h4>
          <p className="mb-4 text-sm">
            Getting your own API keys lets you use the service with zero LLM costs! Here's where to sign up:
          </p>
          <div className="space-y-3">
            <div className="border-l-4 border-blue-500 pl-3">
              <p className="font-semibold text-blue-700 dark:text-blue-300">
                <a href="https://console.groq.com/" target="_blank" rel="noopener noreferrer" className="hover:underline">
                  Groq →
                </a>
              </p>
              <p className="text-xs">Unlimited free tier with fast inference. Perfect for most users. Supports Llama, Mixtral, and Gemma models.</p>
            </div>
            
            <div className="border-l-4 border-green-500 pl-3">
              <p className="font-semibold text-green-700 dark:text-green-300">
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="hover:underline">
                  Google Gemini →
                </a>
              </p>
              <p className="text-xs">Generous free tier with daily quotas. Multimodal AI models with excellent performance.</p>
            </div>
            
            <div className="border-l-4 border-orange-500 pl-3">
              <p className="font-semibold text-orange-700 dark:text-orange-300">
                <a href="https://api.together.xyz/" target="_blank" rel="noopener noreferrer" className="hover:underline">
                  Together AI →
                </a>
              </p>
              <p className="text-xs">Free trial credits for new accounts. Access to cutting-edge open source models including Llama 4 and DeepSeek.</p>
            </div>
            
            <div className="border-l-4 border-purple-500 pl-3">
              <p className="font-semibold text-purple-700 dark:text-purple-300">
                <a href="https://platform.openai.com/" target="_blank" rel="noopener noreferrer" className="hover:underline">
                  OpenAI →
                </a>
              </p>
              <p className="text-xs">Industry-leading GPT models. Paid service but competitive pricing. Includes GPT-4, GPT-4o, and GPT-4o-mini.</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-gray-600 dark:text-gray-400">
            After getting your API key, add it in <strong>Settings → Providers → Add Provider</strong> to start using it immediately with $0 LLM costs!
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">📈 Usage Tracking</h3>
        <div className="space-y-2 pl-4">
          <p><strong>Real-Time Balance:</strong> Check your credit balance anytime on the Billing page.</p>
          <p><strong>Transaction History:</strong> View detailed logs of all API calls with timestamps, models used, token counts, and costs.</p>
          <p><strong>Cost Breakdown:</strong> See exactly what you paid for each request - LLM costs, infrastructure fees, and surcharges (if applicable).</p>
          <p><strong>Export Options:</strong> Download your transaction history for personal record-keeping or expense reporting.</p>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">💡 Cost Optimization Tips</h3>
        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
          <ul className="space-y-2 pl-4">
            <li className="border-l-4 border-green-500 pl-3">
              <strong>🎯 #1 Best Savings:</strong> Add your own API keys in Settings - pay $0 for LLM operations! Use Groq or Gemini free tiers for unlimited access.
            </li>
            <li className="border-l-4 border-blue-500 pl-3">
              <strong>Choose Smaller Models:</strong> Use GPT-4o-mini instead of GPT-4, or Gemini Flash instead of Pro for routine tasks.
            </li>
            <li className="border-l-4 border-purple-500 pl-3">
              <strong>Enable Only Necessary Tools:</strong> Disable expensive tools like `ask_llm` and `generate_reasoning_chain` unless absolutely needed.
            </li>
            <li className="border-l-4 border-orange-500 pl-3">
              <strong>Strategic Planning Mode:</strong> Use planning mode only for complex research queries where the upfront planning cost saves tokens overall.
            </li>
            <li className="border-l-4 border-pink-500 pl-3">
              <strong>Monitor Transparently:</strong> Check the LLM API Transparency panel in chat to see real-time costs and adjust your usage patterns.
            </li>
          </ul>
        </div>
        
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800 mt-4">
          <p className="font-semibold mb-2">📊 How Infrastructure Costs Are Calculated</p>
          <p className="text-sm mb-3">
            Every Lambda request incurs costs from 5 AWS services. We apply a <strong>6x markup</strong> to cover 
            operational overhead and ensure service sustainability:
          </p>
          <div className="space-y-2 text-sm pl-4">
            <div className="border-l-4 border-blue-500 pl-3">
              <p className="font-medium">1. Lambda Compute</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Memory allocation × execution time × $0.0000166667 per GB-second<br/>
                <em>Example: 512MB × 0.8s = $0.00000667</em>
              </p>
            </div>
            <div className="border-l-4 border-purple-500 pl-3">
              <p className="font-medium">2. Lambda Requests</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                $0.20 per million requests ($0.0000002 per request)
              </p>
            </div>
            <div className="border-l-4 border-green-500 pl-3">
              <p className="font-medium">3. CloudWatch Logs</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                ~2KB per request × ($0.50/GB ingestion + $0.03/GB storage/month)<br/>
                <em>Example: ~$0.00000102 per request</em>
              </p>
            </div>
            <div className="border-l-4 border-orange-500 pl-3">
              <p className="font-medium">4. Data Transfer Out</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                ~4KB response size × $0.09/GB (first 10TB/month)<br/>
                <em>Example: ~$0.00000036 per request</em>
              </p>
            </div>
            <div className="border-l-4 border-pink-500 pl-3">
              <p className="font-medium">5. S3 Storage</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Deployment packages (~700MB) × $0.023/GB/month, averaged across requests<br/>
                <em>Example: ~$0.00000003 per request</em>
              </p>
            </div>
          </div>
          <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded border border-blue-300 dark:border-blue-700">
            <p className="text-xs font-mono">
              <strong>Total AWS Cost:</strong> $0.00001087 per request<br/>
              <strong>With 6x markup:</strong> $0.00006522 per request<br/>
              <strong>Profit margin:</strong> 83% (industry competitive)
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">⚠️ Image Generation Costs</h3>
        <div className="bg-red-50 dark:bg-red-900/20 p-5 rounded-lg border-2 border-red-400 dark:border-red-700">
          <p className="font-bold text-red-700 dark:text-red-300 text-lg mb-3">
            ⚠️ Warning: Image generation can be significantly more expensive than text chat!
          </p>
          <p className="text-sm mb-4">
            While text chat typically costs fractions of a cent per request, image generation can cost anywhere from 
            a few cents to over a dollar per image depending on the provider, model, resolution, and quality settings.
          </p>
          
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-red-300 dark:border-red-600 mb-4">
            <p className="font-semibold mb-3">Typical Price Ranges per Image:</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b dark:border-gray-600 pb-2">
                <span><strong>Budget Models</strong> (DALL-E 2, Stable Diffusion):</span>
                <span className="font-mono text-orange-600 dark:text-orange-400">$0.02 - $0.05</span>
              </div>
              <div className="flex justify-between border-b dark:border-gray-600 pb-2">
                <span><strong>Standard Quality</strong> (DALL-E 3 standard):</span>
                <span className="font-mono text-orange-600 dark:text-orange-400">$0.04 - $0.08</span>
              </div>
              <div className="flex justify-between border-b dark:border-gray-600 pb-2">
                <span><strong>HD Quality</strong> (DALL-E 3 HD, high-res):</span>
                <span className="font-mono text-red-600 dark:text-red-400">$0.08 - $0.12</span>
              </div>
              <div className="flex justify-between border-b dark:border-gray-600 pb-2">
                <span><strong>Premium Models</strong> (Midjourney-style, specialized):</span>
                <span className="font-mono text-red-600 dark:text-red-400">$0.10 - $0.50+</span>
              </div>
              <div className="flex justify-between pt-2 font-semibold text-base">
                <span>Cost Comparison:</span>
                <span className="text-red-600 dark:text-red-400">100-1000x more than text chat</span>
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/30 p-3 rounded border border-yellow-400 dark:border-yellow-600 mb-3">
            <p className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">💡 Cost Control Tips:</p>
            <ul className="text-sm space-y-1 pl-4 text-yellow-900 dark:text-yellow-100">
              <li>• Use lower resolution settings when high quality isn't needed</li>
              <li>• Generate fewer variations per prompt</li>
              <li>• Consider using budget-friendly providers like Stable Diffusion</li>
              <li>• Monitor your spending in the Billing page after each generation</li>
              <li>• Set personal budget limits and track usage closely</li>
            </ul>
          </div>

          <p className="text-sm text-red-700 dark:text-red-300 font-semibold">
            Always check the estimated cost before confirming image generation requests, especially when using HD or premium models.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">❓ Frequently Asked Questions</h3>
        <div className="space-y-3">
          <details className="border-2 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
            <summary className="font-semibold cursor-pointer text-base">What happens if I run out of credits?</summary>
            <p className="mt-2 text-sm pl-4">
              Chat requests will be rejected with a "402 Payment Required" error. Simply add more credits via the 
              Billing page to continue using the service. Your chat history and settings are preserved.
            </p>
          </details>
          
          <details className="border-2 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
            <summary className="font-semibold cursor-pointer text-base">Do I need credits if I provide my own API keys?</summary>
            <p className="mt-2 text-sm pl-4">
              Yes, but only for minimal infrastructure costs! When using your own API keys (BYOK), you pay <strong>$0 for LLM operations</strong> 
              and only pay the Lambda infrastructure fee (4x markup on AWS costs, typically $0.0001-0.0005 per request). 
              This is 99.6% cheaper than using server-provided keys.
            </p>
          </details>
          
          <details className="border-2 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
            <summary className="font-semibold cursor-pointer text-base">Why is there a 25% surcharge on server-side keys?</summary>
            <p className="mt-2 text-sm pl-4">
              The 25% surcharge on server-provided API keys covers the cost of maintaining API subscriptions and service overhead. 
              When you use your own keys (BYOK), there's <strong>no surcharge</strong> - you only pay infrastructure costs.
            </p>
          </details>
          
          <details className="border-2 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
            <summary className="font-semibold cursor-pointer text-base">How do I add my own API keys?</summary>
            <p className="mt-2 text-sm pl-4">
              Navigate to <strong>Settings → Providers → Add Provider</strong>. Select your provider (OpenAI, Groq, Gemini, Together AI, or Custom), 
              enter your API key, and save. Once configured, requests will use your key automatically, and you'll pay $0 for LLM operations!
            </p>
          </details>
          
          <details className="border-2 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
            <summary className="font-semibold cursor-pointer text-base">What free tier options are available with BYOK?</summary>
            <p className="mt-2 text-sm pl-4">
              <strong>Groq:</strong> Unlimited free tier with rate limits (perfect for most users)<br/>
              <strong>Google Gemini:</strong> Generous free tier with daily quotas<br/>
              <strong>Together AI:</strong> Free trial credits for new accounts<br/>
              When you use these free tiers with your own keys, your only cost is the minimal Lambda infrastructure fee!
            </p>
          </details>
          
          <details className="border-2 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
            <summary className="font-semibold cursor-pointer text-base">Can I get a refund on credit purchases?</summary>
            <p className="mt-2 text-sm pl-4">
              No, all credit purchases are final and non-refundable. Credits never expire, so you can use them whenever you're ready.
            </p>
          </details>
        </div>
      </section>
      

    </div>
  );
}
