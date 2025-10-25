import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function HelpPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'features' | 'planning' | 'tools' | 'rag' | 'pricing' | 'privacy'>('features');

  const tabs = [
    { id: 'features' as const, label: 'Features & Advantages', icon: '✨' },
    { id: 'planning' as const, label: 'Planning & SWAG', icon: '📋' },
    { id: 'tools' as const, label: 'Backend LLM Tools', icon: '🔧' },
    { id: 'rag' as const, label: 'Browser RAG', icon: '🧠' },
    { id: 'pricing' as const, label: 'Pricing', icon: '💰' },
    { id: 'privacy' as const, label: 'Privacy Policy', icon: '🔒' },
  ];

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Back to Chat"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Help & Documentation</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-2 border-b dark:border-gray-700 overflow-x-auto bg-gray-50 dark:bg-gray-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
            }`}
          >
            <span>{tab.icon}</span>
            <span className="text-sm font-medium">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl text-left">
          {activeTab === 'features' && <FeaturesContent />}
          {activeTab === 'planning' && <PlanningContent />}
          {activeTab === 'tools' && <ToolsContent />}
          {activeTab === 'rag' && <RAGContent />}
          {activeTab === 'pricing' && <PricingContent />}
          {activeTab === 'privacy' && <PrivacyContent />}
        </div>
      </div>
    </div>
  );
}

function FeaturesContent() {
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
              Switch between models seamlessly to find the best fit for each task.</p>
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
            
            <div className="border-l-4 border-orange-500 pl-4">
              <p className="font-semibold text-orange-700 dark:text-orange-300">✅ Knowledge Management with Browser RAG</p>
              <p className="text-sm">Save snippets to your personal knowledge base, create semantic embeddings, and retrieve relevant context 
              during conversations. Optional Google Drive sync keeps your data accessible across devices.</p>
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
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">💾 Knowledge Management</h3>
        <div className="space-y-2 pl-4">
          <p><strong>Content Management:</strong> Save snippets, images, and links to your personal knowledge base with tagging and organization features.</p>
          <p><strong>Browser RAG:</strong> Search your saved content using semantic embeddings for intelligent context retrieval during conversations.</p>
          <p><strong>Chat History:</strong> Persistent storage of all conversations with full-text search capabilities for easy reference.</p>
          <p><strong>Google Drive Sync:</strong> Optionally backup your content to your personal Google Drive for cross-device access and data persistence.</p>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🎵 Media Playback</h3>
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
          Research Agent uses a prepaid credit system. Purchase credits via PayPal and they're automatically deducted 
          as you use the service. Credits never expire and can be used for any API operations.
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
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">📊 Simple Pricing Table</h3>
        <p className="mb-3">Understanding your costs is straightforward:</p>
        
        <div className="overflow-x-auto">
          <table className="min-w-full border-2 dark:border-gray-600 text-sm">
            <thead className="bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-900 dark:to-purple-900">
              <tr>
                <th className="border dark:border-gray-600 px-4 py-3 text-left font-bold">Cost Component</th>
                <th className="border dark:border-gray-600 px-4 py-3 text-left font-bold">Server-Provided Keys</th>
                <th className="border dark:border-gray-600 px-4 py-3 text-left font-bold">Your API Keys (BYOK)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-white dark:bg-gray-800">
                <td className="border dark:border-gray-600 px-4 py-3 font-semibold">LLM API Calls</td>
                <td className="border dark:border-gray-600 px-4 py-3 text-orange-600 dark:text-orange-400">
                  Provider cost <strong>+ 25% surcharge</strong><br/>
                  <span className="text-xs">(Example: $0.10 → $0.125)</span>
                </td>
                <td className="border dark:border-gray-600 px-4 py-3 text-green-600 dark:text-green-400 font-bold">
                  $0.00<br/>
                  <span className="text-xs font-normal">(You pay provider directly)</span>
                </td>
              </tr>
              <tr className="bg-gray-50 dark:bg-gray-700">
                <td className="border dark:border-gray-600 px-4 py-3 font-semibold">Lambda Infrastructure</td>
                <td className="border dark:border-gray-600 px-4 py-3" colSpan={2}>
                  <strong>4x markup</strong> on AWS Lambda hosting costs<br/>
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    (Typical: $0.0001 AWS charge → $0.0004 billed)<br/>
                    Covers execution time, storage, networking, operational overhead
                  </span>
                </td>
              </tr>
              <tr className="bg-blue-50 dark:bg-blue-900/30">
                <td className="border dark:border-gray-600 px-4 py-3 font-bold">Example Total Cost</td>
                <td className="border dark:border-gray-600 px-4 py-3">
                  <span className="text-blue-600 dark:text-blue-400 font-bold">$0.1254</span><br/>
                  <span className="text-xs">($0.10 LLM + $0.025 surcharge + $0.0004 infra)</span>
                </td>
                <td className="border dark:border-gray-600 px-4 py-3">
                  <span className="text-green-600 dark:text-green-400 font-bold">$0.0004</span><br/>
                  <span className="text-xs">(Infrastructure only)</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800 mt-4">
          <p className="font-semibold mb-2">💡 Key Takeaway:</p>
          <p className="text-sm">
            Bring Your Own Key (BYOK) users pay <strong>~99.6% less</strong> for LLM operations! The only charge is 
            the minimal Lambda infrastructure fee. You pay your LLM provider directly (often free with generous quotas) 
            and avoid the 25% surcharge entirely.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🔑 Advantages of Bringing Your Own API Keys (BYOK)</h3>
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
          
          <details className="border-2 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
            <summary className="font-semibold cursor-pointer text-base">Where can I sign up for API keys?</summary>
            <div className="mt-2 text-sm pl-4 space-y-3">
              <p className="mb-2">
                Getting your own API keys lets you use the service with zero LLM costs! Here's where to sign up:
              </p>
              <div className="space-y-2">
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
              <p className="mt-3 text-xs text-gray-600 dark:text-gray-400">
                After getting your API key, add it in <strong>Settings → Providers → Add Provider</strong> to start using it immediately.
              </p>
            </div>
          </details>
        </div>
      </section>
    </div>
  );
}

function PrivacyContent() {
  return (
    <div className="space-y-6 text-gray-800 dark:text-gray-200 text-left">
      <h2 className="text-3xl font-bold mb-4 text-left">Privacy Policy</h2>
      
      <section className="space-y-3">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">📅 Last Updated</h3>
        <p>October 24, 2025</p>
      </section>

      <section className="space-y-3">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🔒 Information We Collect</h3>
        <p className="mb-3">
          When you use Research Agent, we collect several types of information to provide and improve our service. 
          This includes your authentication credentials obtained through Google OAuth, such as your email address 
          and profile information, which we use to identify you and secure your account.
        </p>
        <p className="mb-3">
          We track your usage of the service including the API requests you make, which models you select, token 
          counts for billing purposes, associated costs, and timestamps of your activity. Your chat history—the 
          messages you send to and receive from LLM providers—is stored locally in your browser's storage for your 
          convenience and privacy.
        </p>
        <p className="mb-3">
          For billing purposes, we maintain records of your PayPal transactions including transaction IDs, purchase 
          amounts, and your current credit balance. If you use the content management features, your SWAG snippets, 
          embeddings, and organizational tags are stored locally in your browser's IndexedDB. You have the option 
          to sync this content to your personal Google Drive for backup and cross-device access.
        </p>
        <p>
          Additionally, certain optional data may be collected if you grant permission, such as your location information 
          for location-based features, or access to your Google Drive files if you choose to enable cloud synchronization 
          features.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🎯 How We Use Your Information</h3>
        <p className="mb-3">
          Your information serves several critical functions within our service. We use your authentication data to verify 
          your identity and provide secure access to your account and personalized settings. When you make requests, we route 
          them to the LLM providers you've selected, passing along necessary context to fulfill your queries.
        </p>
        <p className="mb-3">
          For billing operations, we track your credit usage against your available balance, process payments through PayPal 
          when you add credits, and generate detailed transaction records so you can monitor your spending. This financial 
          transparency is important for managing your budget and understanding service costs.
        </p>
        <p>
          We also use aggregated usage data to improve the service—monitoring performance metrics, debugging technical issues, 
          and optimizing our infrastructure for better reliability and speed. When necessary, we may use your contact information 
          to send important service updates or respond to your support requests.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🤝 Data Sharing</h3>
        <p className="mb-3">
          To provide our service effectively, we share certain information with trusted third parties. When you send prompts 
          to generate responses, your queries and chat history are transmitted to the LLM providers you've selected—such as 
          OpenAI, Google, Groq, or others. Each of these providers has their own privacy policies governing how they handle 
          your data, and we encourage you to review their terms.
        </p>
        <p className="mb-3">
          Payment processing is handled entirely by PayPal, which means your financial information and transaction details 
          are subject to PayPal's privacy policy rather than ours. We never see or store your credit card numbers or banking 
          information directly. Our backend infrastructure runs on AWS Lambda cloud services, which hosts the application code 
          that processes your requests.
        </p>
        <p className="mb-3">
          If you enable synchronization features, your content is saved directly to your personal Google Drive account. This 
          means the data goes from your browser to your own Drive storage—we don't maintain a copy on our servers.
        </p>
        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-800">
          <p className="font-semibold text-red-800 dark:text-red-200 mb-2">⚠️ Important Privacy Commitment</p>
          <p className="text-sm">
            We do NOT sell or rent your personal information to third parties for marketing purposes. We do NOT share your 
            data with advertisers or data brokers. Your information is used solely to provide the service you've signed up for.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🔐 Data Storage & Security</h3>
        <p className="mb-3">
          We take a privacy-first approach to data storage. The majority of your personal content—including your full chat 
          history, SWAG snippets, and generated embeddings—is stored exclusively in your browser's local IndexedDB database. 
          This means the data stays on your device and is not transmitted to our servers unless you explicitly choose to sync 
          it to your Google Drive.
        </p>
        <p className="mb-3">
          The only information we store on our backend infrastructure is billing-related data: your transaction history, 
          credit purchases, and usage logs for accounting purposes. This financial data is stored securely on our cloud 
          infrastructure with appropriate access controls.
        </p>
        <p className="mb-3">
          All data transmitted between your browser and our servers is encrypted using industry-standard HTTPS protocol. 
          Authentication is handled through secure OAuth2 flows with Google, ensuring your credentials are never exposed 
          to our application directly. Access to your personal data is restricted exclusively to you through your authenticated 
          Google account—no other users or administrators can access your information.
        </p>
        <p>
          We retain billing logs for accounting and tax compliance purposes as required by law. Your chat history, being stored 
          locally in your browser, is under your control—you can delete it at any time through your browser's storage management 
          tools or the application's clear data features.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🛡️ Your Privacy Rights</h3>
        <p className="mb-3">
          You maintain significant control over your data within our service. You can access your billing transactions and 
          detailed usage data at any time through the Billing page, which provides complete transparency into how your credits 
          have been used and what you've been charged for.
        </p>
        <p className="mb-3">
          Because your chat history and content are stored locally in your browser, you have the ability to delete this 
          information whenever you choose. The application provides clear options to clear your local data, and you can 
          also use your browser's built-in storage management to remove IndexedDB data if preferred.
        </p>
        <p className="mb-3">
          Your data is portable—you can export your transaction history and usage data for your own records or to migrate 
          to another service. You also have granular control over optional features: disconnect Google Drive synchronization 
          to stop cloud backups, revoke location access permissions, or close your account entirely if you no longer wish 
          to use the service.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">⚠️ Disclaimer of Liability</h3>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-5 rounded-lg border-2 border-yellow-300 dark:border-yellow-700">
          <p className="font-bold mb-3 text-lg text-yellow-900 dark:text-yellow-100">IMPORTANT - PLEASE READ CAREFULLY</p>
          
          <p className="mb-4">
            <strong className="text-yellow-800 dark:text-yellow-200">Artificial Intelligence Content:</strong> The responses 
            generated by LLM providers are produced by artificial intelligence systems that, while sophisticated, are not 
            infallible. These AI-generated outputs may contain factual errors, exhibit biases present in their training data, 
            include inappropriate or offensive content, or provide information that is outdated or incorrect. AI systems can 
            also "hallucinate" information—presenting fabricated details with apparent confidence.
          </p>

          <p className="mb-4">
            <strong className="text-yellow-800 dark:text-yellow-200">No Warranties or Guarantees:</strong> We provide this 
            service "AS IS" and "AS AVAILABLE" without any warranties of any kind, whether express or implied. This includes 
            but is not limited to implied warranties of merchantability, fitness for a particular purpose, or non-infringement. 
            We make no guarantees about the accuracy, reliability, completeness, or timeliness of any information provided 
            through the service.
          </p>

          <p className="mb-4">
            <strong className="text-yellow-800 dark:text-yellow-200">Your Responsibility:</strong> You acknowledge and agree 
            that YOU are solely responsible for verifying any information obtained through this service before relying on it 
            for any purpose. This is especially critical for decisions involving health, legal matters, financial planning, 
            safety, or any other consequential actions. We strongly recommend consulting appropriate professionals for important 
            decisions rather than relying solely on AI-generated content.
          </p>

          <p className="mb-4">
            <strong className="text-yellow-800 dark:text-yellow-200">Third-Party Services:</strong> We are not responsible 
            for the performance, availability, accuracy, or policies of third-party services including OpenAI, Google AI, 
            Groq, Together AI, PayPal, Google Drive, or any other integrated service. Issues arising from these services 
            are governed by their respective terms of service and privacy policies.
          </p>

          <p className="mb-4">
            <strong className="text-yellow-800 dark:text-yellow-200">Data Loss:</strong> While we implement reasonable measures 
            to protect your data, we cannot guarantee against data loss. We are not liable for any loss of local data including 
            chat history, SWAG content, or other browser-stored information due to browser cache clearing, device failure, 
            software conflicts, or any other cause. We strongly recommend regularly backing up important content to external 
            storage or cloud services.
          </p>

          <p>
            <strong className="text-yellow-800 dark:text-yellow-200">Limitation of Liability:</strong> To the maximum extent 
            permitted by law, our total aggregate liability to you for all claims arising out of or related to your use of 
            the service shall not exceed the amount you have paid us for credits in the thirty (30) days immediately preceding 
            the event giving rise to the claim. In no event shall we be liable for any indirect, incidental, special, 
            consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🔄 Changes to This Policy</h3>
        <p>
          We reserve the right to modify this privacy policy at any time as our service evolves or in response to legal 
          or regulatory requirements. When we make significant changes that materially affect your rights or how we handle 
          your data, we will notify you by posting a prominent notice within the application or by updating the "Last Updated" 
          date at the top of this document. We encourage you to review this policy periodically to stay informed about how 
          we're protecting your information. Your continued use of the service after any modifications indicates your acceptance 
          of the updated terms.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">📧 Contact Us</h3>
        <p className="mb-3">
          If you have questions, concerns, or requests regarding this privacy policy, your personal data, or how we handle 
          your information, we want to hear from you:
        </p>
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800 space-y-3">
          <div className="border-l-4 border-blue-500 pl-4">
            <p className="font-semibold text-blue-700 dark:text-blue-300">Email Support</p>
            <p className="text-sm mb-1">For general inquiries, privacy questions, or billing issues:</p>
            <a href="mailto:stever@syntithenai.com" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">
              stever@syntithenai.com
            </a>
          </div>
          
          <div className="border-l-4 border-purple-500 pl-4">
            <p className="font-semibold text-purple-700 dark:text-purple-300">Bug Reports & Feature Requests</p>
            <p className="text-sm mb-1">For technical issues, bug reports, or feature suggestions:</p>
            <a href="https://github.com/syntithenai/lambdallmproxy/issues" target="_blank" rel="noopener noreferrer" className="text-purple-600 dark:text-purple-400 hover:underline text-sm">
              GitHub Issues →
            </a>
          </div>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">
          We review and respond to inquiries as promptly as possible, typically within a few business days. For urgent 
          issues affecting your account or billing, please indicate "URGENT" in the subject line.
        </p>
      </section>

      <div className="bg-blue-50 dark:bg-blue-900/20 p-5 rounded-lg border-2 border-blue-300 dark:border-blue-700 mt-6">
        <p className="font-semibold text-lg mb-2 text-blue-900 dark:text-blue-100">Acknowledgment and Consent</p>
        <p className="text-sm">
          By accessing or using Research Agent, you acknowledge that you have read this privacy policy in its entirety, 
          understand its terms and implications, and agree to be bound by it along with the disclaimer of liability. 
          You also acknowledge that you understand the nature of AI-generated content and the inherent limitations and 
          risks associated with using such technology. If you do not agree with any part of this policy, please discontinue 
          use of the service immediately.
        </p>
      </div>
    </div>
  );
}
