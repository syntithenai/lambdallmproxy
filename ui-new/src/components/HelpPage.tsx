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
        <div className="max-w-4xl mx-auto">
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
    <div className="space-y-6 text-gray-800 dark:text-gray-200">
      <h2 className="text-3xl font-bold mb-4">Features & Advantages</h2>
      
      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🚀 Multi-Provider LLM Access</h3>
        <p>Access multiple AI providers in one place:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>OpenAI:</strong> GPT-4, GPT-4o, GPT-4 Turbo</li>
          <li><strong>Google Gemini:</strong> Gemini 1.5 Pro, Flash models (with free tier)</li>
          <li><strong>Groq:</strong> Ultra-fast inference with Llama, Mixtral, Gemma models</li>
          <li><strong>Together AI:</strong> Open source models with trial credits</li>
          <li><strong>Custom Endpoints:</strong> Bring your own OpenAI-compatible API</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🔍 Web Search Integration</h3>
        <p>Get real-time information with:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>DuckDuckGo Search:</strong> Privacy-focused web search</li>
          <li><strong>Tavily AI:</strong> Advanced AI-powered research (requires API key)</li>
          <li><strong>Automatic Citation:</strong> Sources are cited in responses</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🎯 Intelligent Planning Mode</h3>
        <p>Complex queries benefit from planning before execution:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Research Planning:</strong> Break down complex questions</li>
          <li><strong>Multi-Step Execution:</strong> Execute searches and analyze results</li>
          <li><strong>Cost Optimization:</strong> Efficient use of API credits</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🎨 Rich Media Support</h3>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Image Generation:</strong> DALL-E 3, Stable Diffusion, Flux models</li>
          <li><strong>Chart Generation:</strong> Mermaid diagrams for flowcharts, sequences, etc.</li>
          <li><strong>YouTube Integration:</strong> Search, transcript extraction, video analysis</li>
          <li><strong>Audio Transcription:</strong> Convert audio/video to text with Whisper</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">💾 Knowledge Management</h3>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Content Swag:</strong> Save snippets, images, links for later</li>
          <li><strong>Browser RAG:</strong> Search your saved content with embeddings</li>
          <li><strong>Chat History:</strong> Persistent storage with search</li>
          <li><strong>Google Drive Sync:</strong> Backup to your own Google Drive</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🎵 Media Playback</h3>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Background Player:</strong> Play audio from YouTube, podcasts, etc.</li>
          <li><strong>Playlists:</strong> Queue multiple tracks</li>
          <li><strong>Chromecast Support:</strong> Cast to TV or speakers</li>
        </ul>
      </section>
    </div>
  );
}

function PlanningContent() {
  return (
    <div className="space-y-6 text-gray-800 dark:text-gray-200">
      <h2 className="text-3xl font-bold mb-4">Planning, Todos & SWAG for Long-Term Thinking</h2>
      
      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">📋 Planning Mode</h3>
        <p>Enable planning mode in chat for complex, multi-step research tasks:</p>
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="font-medium mb-2">How it works:</p>
          <ol className="list-decimal pl-6 space-y-2">
            <li>AI analyzes your question and creates a research plan</li>
            <li>Executes searches and gathers information</li>
            <li>Synthesizes findings into a comprehensive answer</li>
            <li>Cites all sources used</li>
          </ol>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          <strong>Best for:</strong> Research questions, comparative analysis, multi-part queries
        </p>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">✅ Backend Todo Management</h3>
        <p>The <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">manage_todos</code> tool allows AI to maintain a persistent todo list:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Task Tracking:</strong> AI can create, update, and complete tasks</li>
          <li><strong>Multi-Turn Context:</strong> Todos persist across chat sessions</li>
          <li><strong>Project Management:</strong> Break down large tasks into steps</li>
        </ul>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
          <p className="font-medium">💡 Example Usage:</p>
          <p className="mt-2 italic">"Create a todo list for building a web scraper: research libraries, write code, test, deploy"</p>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🎒 Content SWAG</h3>
        <p>SWAG (Stuff We All Get) is your personal knowledge repository:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Save Anything:</strong> Text snippets, images, code, links</li>
          <li><strong>Organize with Tags:</strong> Categorize content for easy retrieval</li>
          <li><strong>Search & Filter:</strong> Find content by text, tags, or type</li>
          <li><strong>Generate Embeddings:</strong> Enable semantic search across your content</li>
          <li><strong>Cloud Sync:</strong> Backup to Google Drive for persistence</li>
        </ul>
        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
          <p className="font-medium">🎯 Long-Term Thinking:</p>
          <p className="mt-2">Combine Planning Mode + Todos + SWAG to build a knowledge base over time. Save research findings to SWAG, reference them in future chats using RAG, and track progress with todos.</p>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">📝 Google Sheets Integration</h3>
        <p>The <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">manage_snippets</code> tool syncs with Google Sheets:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Cloud Storage:</strong> Snippets saved to your Google Drive</li>
          <li><strong>Collaborative:</strong> Share sheets with team members</li>
          <li><strong>Persistent:</strong> Never lose your data</li>
        </ul>
      </section>
    </div>
  );
}

function ToolsContent() {
  return (
    <div className="space-y-6 text-gray-800 dark:text-gray-200">
      <h2 className="text-3xl font-bold mb-4">Backend LLM Tools</h2>
      
      <p className="text-lg">
        The AI has access to powerful backend tools that it can call automatically when needed. 
        Enable/disable tools in <strong>Settings → Tools</strong>.
      </p>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🔧 Available Tools</h3>
        
        <div className="space-y-4">
          <ToolCard
            name="web_search"
            icon="🔍"
            description="Search the web using DuckDuckGo"
            trigger="Automatically triggered when current information is needed"
            example={`User: "What's the weather in Tokyo?"`}
          />
          
          <ToolCard
            name="execute_js"
            icon="⚡"
            description="Execute JavaScript code for calculations, data processing, etc."
            trigger="Triggered when computation or data manipulation is needed"
            example='User: "Calculate the Fibonacci sequence up to 100"'
          />
          
          <ToolCard
            name="scrape_url"
            icon="🌐"
            description="Extract content from any URL"
            trigger="Triggered when a specific webpage needs to be analyzed"
            example='User: "Summarize the content at example.com/article"'
          />
          
          <ToolCard
            name="youtube"
            icon="🎥"
            description="Search YouTube and extract video transcripts"
            trigger="Triggered when YouTube content is mentioned"
            example='User: "Find videos about machine learning"'
          />
          
          <ToolCard
            name="transcribe"
            icon="🎙️"
            description="Transcribe audio/video files using Whisper"
            trigger="User uploads an audio/video file"
            example="Upload an MP3 file and ask to transcribe it"
          />
          
          <ToolCard
            name="generate_chart"
            icon="📊"
            description="Create diagrams using Mermaid syntax"
            trigger="Triggered when visualization is requested"
            example='User: "Create a flowchart for user authentication"'
          />
          
          <ToolCard
            name="generate_image"
            icon="🎨"
            description="Generate images using DALL-E 3, Stable Diffusion, or Flux"
            trigger="Triggered when image generation is requested"
            example='User: "Generate an image of a sunset over mountains"'
          />
          
          <ToolCard
            name="search_knowledge_base"
            icon="📚"
            description="Search server-side knowledge base (separate from local RAG)"
            trigger="Manually enabled tool - searches backend embeddings"
            example="Enable in Settings for access to server-stored documents"
          />
          
          <ToolCard
            name="manage_todos"
            icon="✅"
            description="Create, update, and manage a persistent todo list"
            trigger="Triggered when task management is discussed"
            example='User: "Add a todo to finish the report by Friday"'
          />
          
          <ToolCard
            name="manage_snippets"
            icon="📋"
            description="Save and retrieve snippets to Google Sheets"
            trigger="Triggered when snippet storage is requested"
            example='User: "Save this code snippet for later"'
          />
          
          <ToolCard
            name="ask_llm"
            icon="🤖"
            description="Recursive LLM agent for complex multi-step reasoning"
            trigger="⚠️ DISABLED by default - HIGH token usage"
            example="Enable in Settings for advanced AI-to-AI reasoning"
            warning="Can result in very high API costs"
          />
          
          <ToolCard
            name="generate_reasoning_chain"
            icon="🧠"
            description="Deep reasoning chains for complex problem-solving"
            trigger="⚠️ DISABLED by default - EXTREME token usage"
            example="Enable for academic-level reasoning tasks"
            warning="Can result in extremely high API costs"
          />
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">💡 How to Use Tools</h3>
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <ol className="list-decimal pl-6 space-y-2">
            <li><strong>Enable tools</strong> in Settings → Tools</li>
            <li><strong>Ask naturally</strong> - AI will automatically call the right tool</li>
            <li><strong>Check responses</strong> - Tool calls are shown in the chat</li>
            <li><strong>Review costs</strong> - Tool usage affects API billing</li>
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
  example: string;
  warning?: string;
}

function ToolCard({ name, icon, description, trigger, example, warning }: ToolCardProps) {
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
            <p className="text-gray-600 dark:text-gray-400"><strong>Triggered:</strong> {trigger}</p>
            <p className="text-blue-600 dark:text-blue-400 mt-1 italic">💬 {example}</p>
          </div>
          {warning && (
            <div className="mt-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-200 dark:border-red-800">
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
    <div className="space-y-6 text-gray-800 dark:text-gray-200">
      <h2 className="text-3xl font-bold mb-4">Browser-Based RAG (Retrieval Augmented Generation)</h2>
      
      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🧠 What is RAG?</h3>
        <p>
          RAG enhances AI responses by retrieving relevant information from your personal knowledge base 
          before generating answers. Everything runs in your browser - no data sent to servers.
        </p>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🚀 How to Use Browser RAG</h3>
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 p-6 rounded-lg border border-blue-200 dark:border-blue-800">
          <ol className="list-decimal pl-6 space-y-3">
            <li className="font-medium">
              <strong>Save Content to SWAG</strong>
              <p className="font-normal text-sm mt-1 text-gray-700 dark:text-gray-300">
                Navigate to the SWAG page and add text snippets, code, notes, or any content you want to reference later.
              </p>
            </li>
            <li className="font-medium">
              <strong>Generate Embeddings</strong>
              <p className="font-normal text-sm mt-1 text-gray-700 dark:text-gray-300">
                In SWAG, select snippets and click "Generate Embeddings". This creates vector representations for semantic search.
              </p>
            </li>
            <li className="font-medium">
              <strong>Enable RAG in Chat</strong>
              <p className="font-normal text-sm mt-1 text-gray-700 dark:text-gray-300">
                In the chat interface, check "Use Knowledge Base Context" to search your SWAG content during conversations.
              </p>
            </li>
            <li className="font-medium">
              <strong>Ask Questions</strong>
              <p className="font-normal text-sm mt-1 text-gray-700 dark:text-gray-300">
                The AI will automatically search your knowledge base and include relevant snippets in its context.
              </p>
            </li>
          </ol>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">✨ Features</h3>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Local Processing:</strong> Embeddings generated in your browser using Transformers.js</li>
          <li><strong>Privacy First:</strong> Your content never leaves your device</li>
          <li><strong>Semantic Search:</strong> Find content by meaning, not just keywords</li>
          <li><strong>Smart Ranking:</strong> Most relevant snippets are prioritized</li>
          <li><strong>Chunk Management:</strong> Large content automatically split for better retrieval</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">💾 Storage & Sync</h3>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>IndexedDB:</strong> Local browser storage for snippets and embeddings</li>
          <li><strong>Google Drive Backup:</strong> Optional cloud sync for persistence</li>
          <li><strong>No Size Limits:</strong> Store as much as your browser allows</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🎯 Best Practices</h3>
        <div className="space-y-3">
          <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
            <p className="font-medium text-green-800 dark:text-green-200">✅ Do:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-sm">
              <li>Save well-organized, focused snippets</li>
              <li>Use descriptive tags for categorization</li>
              <li>Generate embeddings for content you'll reference often</li>
              <li>Keep snippets under 10,000 characters for best results</li>
            </ul>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-800">
            <p className="font-medium text-red-800 dark:text-red-200">❌ Don't:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-sm">
              <li>Save duplicate or redundant content</li>
              <li>Store sensitive passwords or credentials</li>
              <li>Expect perfect recall with low-quality snippets</li>
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
                <th className="border dark:border-gray-700 px-4 py-2 text-left">Feature</th>
                <th className="border dark:border-gray-700 px-4 py-2 text-left">Browser RAG</th>
                <th className="border dark:border-gray-700 px-4 py-2 text-left">Server KB Tool</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border dark:border-gray-700 px-4 py-2 font-medium">Data Location</td>
                <td className="border dark:border-gray-700 px-4 py-2">Your browser</td>
                <td className="border dark:border-gray-700 px-4 py-2">Backend server</td>
              </tr>
              <tr className="bg-gray-50 dark:bg-gray-800/50">
                <td className="border dark:border-gray-700 px-4 py-2 font-medium">Privacy</td>
                <td className="border dark:border-gray-700 px-4 py-2">100% private</td>
                <td className="border dark:border-gray-700 px-4 py-2">Shared with backend</td>
              </tr>
              <tr>
                <td className="border dark:border-gray-700 px-4 py-2 font-medium">Content Source</td>
                <td className="border dark:border-gray-700 px-4 py-2">Your SWAG</td>
                <td className="border dark:border-gray-700 px-4 py-2">Server documents</td>
              </tr>
              <tr className="bg-gray-50 dark:bg-gray-800/50">
                <td className="border dark:border-gray-700 px-4 py-2 font-medium">Setup</td>
                <td className="border dark:border-gray-700 px-4 py-2">Automatic</td>
                <td className="border dark:border-gray-700 px-4 py-2">Enable in Settings</td>
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
    <div className="space-y-6 text-gray-800 dark:text-gray-200">
      <h2 className="text-3xl font-bold mb-4">Pricing</h2>
      
      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">💰 Credit-Based System</h3>
        <p>
          LLM Proxy uses a prepaid credit system. You purchase credits via PayPal and they're deducted 
          as you use API services.
        </p>
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="font-medium">🎁 Welcome Bonus: $0.50 in free credits for new users!</p>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">💳 Purchasing Credits</h3>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Minimum Purchase:</strong> $5.00 USD</li>
          <li><strong>Payment Method:</strong> PayPal (secure checkout)</li>
          <li><strong>No Expiration:</strong> Credits never expire</li>
          <li><strong>No Refunds:</strong> All sales are final</li>
        </ul>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Visit the Billing page to check your balance and purchase more credits.
        </p>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">📊 Cost Structure</h3>
        <div className="space-y-3">
          <div className="border dark:border-gray-700 rounded-lg p-4">
            <h4 className="font-semibold mb-2">LLM API Costs</h4>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <strong>Pass-through pricing:</strong> You pay exactly what the provider charges. No markup on LLM API calls.
            </p>
            <ul className="list-disc pl-6 mt-2 text-sm space-y-1">
              <li>OpenAI GPT-4: ~$0.01-0.03 per 1K tokens</li>
              <li>Gemini Pro: ~$0.00035 per 1K tokens (free tier available)</li>
              <li>Groq: Free tier available, very fast</li>
            </ul>
          </div>

          <div className="border dark:border-gray-700 rounded-lg p-4">
            <h4 className="font-semibold mb-2">Infrastructure Costs</h4>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <strong>4x profit margin</strong> on Lambda/server costs to maintain the service.
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Example: If a request costs $0.0001 in Lambda fees, you're charged $0.0004 ($0.0003 markup).
            </p>
          </div>

          <div className="border dark:border-gray-700 rounded-lg p-4">
            <h4 className="font-semibold mb-2">Total Cost Example</h4>
            <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-sm font-mono">
              <div>LLM API:        $0.1000 (OpenAI charge)</div>
              <div>Lambda fees:    $0.0001 (AWS charge)</div>
              <div className="border-t dark:border-gray-600 mt-2 pt-2">
              Infrastructure: $0.0004 (4x markup)
              </div>
              <div className="font-bold mt-2 text-blue-600 dark:text-blue-400">
              Total:          $0.1004
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">📈 Usage Tracking</h3>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Real-Time Balance:</strong> Check credits remaining in Billing page</li>
          <li><strong>Transaction History:</strong> Detailed log of all API calls</li>
          <li><strong>Cost Breakdown:</strong> See exactly what you paid for</li>
          <li><strong>Google Sheets Export:</strong> Download your usage data</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">💡 Cost Optimization Tips</h3>
        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
          <ul className="list-disc pl-6 space-y-2">
            <li>Use <strong>Groq free tier</strong> for fast, free inference</li>
            <li>Choose <strong>smaller models</strong> (GPT-4o-mini, Gemini Flash) for simple tasks</li>
            <li>Enable only <strong>necessary tools</strong> to reduce API calls</li>
            <li>Use <strong>planning mode</strong> strategically for complex queries only</li>
            <li>Disable <strong>ask_llm</strong> and <strong>reasoning chains</strong> unless absolutely needed</li>
          </ul>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">❓ FAQs</h3>
        <div className="space-y-3">
          <details className="border dark:border-gray-700 rounded-lg p-4">
            <summary className="font-medium cursor-pointer">What happens if I run out of credits?</summary>
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
              Chat requests will be rejected with a 402 Payment Required error. Simply purchase more credits to continue.
            </p>
          </details>
          <details className="border dark:border-gray-700 rounded-lg p-4">
            <summary className="font-medium cursor-pointer">Do I need credits if I provide my own API keys?</summary>
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
              Yes. Credits cover infrastructure costs (Lambda, storage, etc.) even when using your own LLM API keys.
            </p>
          </details>
          <details className="border dark:border-gray-700 rounded-lg p-4">
            <summary className="font-medium cursor-pointer">Can I get a refund?</summary>
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
              No, all credit purchases are final and non-refundable.
            </p>
          </details>
        </div>
      </section>
    </div>
  );
}

function PrivacyContent() {
  return (
    <div className="space-y-6 text-gray-800 dark:text-gray-200">
      <h2 className="text-3xl font-bold mb-4">Privacy Policy</h2>
      
      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">📅 Last Updated</h3>
        <p>October 24, 2025</p>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🔒 Information We Collect</h3>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>Authentication Data:</strong> Google OAuth tokens, email address, profile information
          </li>
          <li>
            <strong>Usage Data:</strong> API requests, model selections, token counts, costs, timestamps
          </li>
          <li>
            <strong>Chat History:</strong> Messages sent to and from LLM providers (stored locally in your browser)
          </li>
          <li>
            <strong>Billing Data:</strong> PayPal transaction IDs, purchase amounts, credit balances (logged to Google Sheets)
          </li>
          <li>
            <strong>Content Data:</strong> SWAG snippets, embeddings, tags (stored locally in IndexedDB, optionally synced to your Google Drive)
          </li>
          <li>
            <strong>Optional Data:</strong> Location (if you grant permission), Google Drive file access (if you use sync features)
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🎯 How We Use Your Information</h3>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Authentication:</strong> Verify your identity and provide access to the service</li>
          <li><strong>API Routing:</strong> Forward your requests to selected LLM providers</li>
          <li><strong>Billing:</strong> Track credit usage, process payments, generate transaction records</li>
          <li><strong>Service Improvement:</strong> Monitor performance, debug issues, optimize infrastructure</li>
          <li><strong>Communication:</strong> Send service updates or respond to support requests</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🤝 Data Sharing</h3>
        <p>We share your data with:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>LLM Providers:</strong> Your prompts and chat history are sent to OpenAI, Google, Groq, or other providers you select
          </li>
          <li>
            <strong>Payment Processors:</strong> PayPal handles payment processing (subject to their privacy policy)
          </li>
          <li>
            <strong>Cloud Services:</strong> AWS Lambda hosts our backend, Google Sheets stores billing logs
          </li>
          <li>
            <strong>Your Google Drive:</strong> If you enable sync, content is saved to your personal Google Drive
          </li>
        </ul>
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded border border-red-200 dark:border-red-800">
          ⚠️ <strong>Important:</strong> We do NOT sell or rent your personal information to third parties for marketing purposes.
        </p>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🔐 Data Storage & Security</h3>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Local Storage:</strong> Chat history, SWAG content, and embeddings are stored in your browser's IndexedDB</li>
          <li><strong>Cloud Storage:</strong> Billing transactions logged to Google Sheets in your Google Drive</li>
          <li><strong>Encryption:</strong> HTTPS for all data transmission, OAuth2 for authentication</li>
          <li><strong>Access Control:</strong> Only you can access your personal data (via Google authentication)</li>
          <li><strong>Retention:</strong> We retain billing logs for accounting purposes; chat history is stored locally and you can delete it anytime</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🛡️ Your Privacy Rights</h3>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Access:</strong> View your billing transactions and usage data</li>
          <li><strong>Deletion:</strong> Clear your local chat history and SWAG content anytime</li>
          <li><strong>Portability:</strong> Export your data from Google Sheets</li>
          <li><strong>Opt-Out:</strong> Disconnect Google Drive sync, disable location access, or close your account</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">⚠️ Disclaimer of Liability</h3>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
          <p className="font-semibold mb-2">IMPORTANT - PLEASE READ CAREFULLY:</p>
          <ul className="list-disc pl-6 space-y-2 text-sm">
            <li>
              <strong>AI-Generated Content:</strong> Responses from LLM providers are generated by artificial intelligence and may contain errors, biases, or inappropriate content.
            </li>
            <li>
              <strong>No Warranties:</strong> We provide the service "AS IS" without warranties of any kind, express or implied.
            </li>
            <li>
              <strong>No Responsibility:</strong> We are NOT responsible for the accuracy, completeness, safety, or legality of AI-generated outputs.
            </li>
            <li>
              <strong>User Responsibility:</strong> YOU are responsible for verifying any information before acting on it.
            </li>
            <li>
              <strong>Third-Party Services:</strong> We are not liable for issues with OpenAI, Google, Groq, PayPal, or other third-party services.
            </li>
            <li>
              <strong>Data Loss:</strong> We are not responsible for loss of local data (chat history, SWAG content) due to browser issues, cache clearing, or device failure.
            </li>
            <li>
              <strong>Limitation of Liability:</strong> Our total liability shall not exceed the amount you paid for credits in the past 30 days.
            </li>
          </ul>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">🔄 Changes to This Policy</h3>
        <p>
          We may update this privacy policy from time to time. We will notify you of significant changes by 
          posting a notice in the application or updating the "Last Updated" date above.
        </p>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400">📧 Contact Us</h3>
        <p>
          If you have questions about this privacy policy or your data, please contact us via GitHub issues 
          at the project repository.
        </p>
      </section>

      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800 mt-6">
        <p className="text-sm font-medium">
          By using LLM Proxy, you acknowledge that you have read, understood, and agree to this privacy policy 
          and disclaimer of liability.
        </p>
      </div>
    </div>
  );
}
