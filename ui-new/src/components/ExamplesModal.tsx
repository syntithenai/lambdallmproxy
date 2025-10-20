import React from 'react';

interface ExamplesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExampleClick: (text: string) => void;
  location: { latitude: number; longitude: number } | null;
  locationLoading: boolean;
  requestLocation: () => Promise<void>;
  clearLocation: () => void;
}

export const ExamplesModal: React.FC<ExamplesModalProps> = ({
  isOpen,
  onClose,
  onExampleClick,
  location,
  locationLoading,
  requestLocation,
  clearLocation,
}) => {
  if (!isOpen) return null;

  const handleExampleClick = (text: string) => {
    onExampleClick(text);
    onClose();
  };

  // Close modal on Escape key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-7xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            📝 Example Prompts
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content - 3 Column Grid */}
        <div className="overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* Column 1: Search, YouTube, Transcription, Math */}
            <div className="space-y-6">
              {/* Web Search */}
              <div>
                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                  🔍 Web Search & Research
                </h3>
                <div className="space-y-1">
                  <button onClick={() => handleExampleClick('What are the latest developments in artificial intelligence this week?')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Latest AI developments</button>
                  <button onClick={() => handleExampleClick('Find current news about climate change policy updates')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Climate change policy news</button>
                  <button onClick={() => handleExampleClick('What is the current stock price of Tesla and recent news about the company?')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Stock price lookup with news</button>
                  <button onClick={() => handleExampleClick('Search for recent scientific breakthroughs in quantum computing')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Scientific research updates</button>
                </div>
              </div>

              {/* YouTube Features */}
              <div>
                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                  🎬 YouTube Search & Transcripts
                </h3>
                <div className="space-y-1">
                  <button onClick={() => handleExampleClick('Find YouTube videos about TypeScript best practices')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Search YouTube videos</button>
                  <button onClick={() => handleExampleClick('Get transcript with timestamps from https://www.youtube.com/watch?v=dQw4w9WgXcQ')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Get YouTube transcript (with timestamps)</button>
                  <button onClick={() => handleExampleClick('Find the top 5 Python tutorial videos and summarize their content')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Search + batch summarize videos</button>
                  <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-500 italic">ℹ️ 3 YouTube tools available</p>
                </div>
              </div>

              {/* Transcription */}
              <div>
                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                  🎙️ Audio/Video Transcription (Whisper AI)
                </h3>
                <div className="space-y-1">
                  <button onClick={() => handleExampleClick('Transcribe this: http://localhost:3000/samples/long-form-ai-speech.mp3')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">🏠 Local Dev: AI & ML discussion (~4min)</button>
                  <button onClick={() => handleExampleClick('Transcribe this: https://llmproxy-media-samples.s3.amazonaws.com/audio/long-form-ai-speech.mp3')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Transcribe: AI & ML discussion (~4min)</button>
                  <button onClick={() => handleExampleClick('Transcribe this YouTube video: https://www.youtube.com/watch?v=dQw4w9WgXcQ')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Transcribe YouTube video</button>
                  <button onClick={() => handleExampleClick('Transcribe this audio file: https://llmproxy-media-samples.s3.amazonaws.com/audio/hello-test.wav and summarize it')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Transcribe + auto-summarize</button>
                  <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-500 italic">ℹ️ OpenAI Whisper with progress tracking<br/>⚠️ Local dev example only works with localhost backend</p>
                </div>
              </div>

              {/* Mathematical Calculations */}
              <div>
                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                  🧮 Math & Calculations (JavaScript Sandbox)
                </h3>
                <div className="space-y-1">
                  <button onClick={() => handleExampleClick('Calculate compound interest on $10,000 at 7% annual rate for 15 years')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Compound interest calculator</button>
                  <button onClick={() => handleExampleClick('Generate a multiplication table for numbers 1-12')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Multiplication table</button>
                  <button onClick={() => handleExampleClick('Calculate the Fibonacci sequence up to the 20th number')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Fibonacci sequence</button>
                  <button onClick={() => handleExampleClick('Convert 100 USD to EUR, GBP, and JPY at current exchange rates')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Currency conversion</button>
                  <button onClick={() => handleExampleClick('Calculate my BMI if I weigh 70kg and am 175cm tall')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">BMI calculator</button>
                  <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-500 italic">ℹ️ Secure sandbox execution</p>
                </div>
              </div>
            </div>

            {/* Column 2: Charts, Scraping, Location, Images */}
            <div className="space-y-6">
              {/* Charts & Diagrams */}
              <div>
                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                  📊 Charts & Diagrams (Mermaid.js)
                </h3>
                <div className="space-y-1">
                  <button onClick={() => handleExampleClick('Create a flowchart showing the software development lifecycle from planning to deployment')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Flowchart: Dev lifecycle</button>
                  <button onClick={() => handleExampleClick('Show a sequence diagram for user authentication with OAuth 2.0')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Sequence: OAuth flow</button>
                  <button onClick={() => handleExampleClick('Generate a Gantt chart for a 3-month web app project')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Gantt: Project timeline</button>
                  <button onClick={() => handleExampleClick('Create a class diagram for an e-commerce system with User, Order, and Product')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Class diagram: E-commerce</button>
                  <button onClick={() => handleExampleClick('Show a state diagram for an order processing system')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">State diagram: Order processing</button>
                  <button onClick={() => handleExampleClick('Create an ER diagram for a blog database with Users, Posts, Comments')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">ER diagram: Blog schema</button>
                  <button onClick={() => handleExampleClick('Show a pie chart of renewable energy distribution: Solar 30%, Wind 35%, Hydro 25%, Geo 10%')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Pie chart: Energy sources</button>
                  <button onClick={() => handleExampleClick('Create a mindmap for planning a mobile app development project')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Mindmap: App planning</button>
                  <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-500 italic">ℹ️ 9 chart types with auto-fix</p>
                </div>
              </div>

              {/* Web Scraping */}
              <div>
                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                  🌐 Web Scraping & Content Extraction
                </h3>
                <div className="space-y-1">
                  <button onClick={() => handleExampleClick('Scrape and summarize https://news.ycombinator.com')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Scrape: Hacker News</button>
                  <button onClick={() => handleExampleClick('Extract key points from https://en.wikipedia.org/wiki/Artificial_intelligence')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Extract: Wikipedia article</button>
                  <button onClick={() => handleExampleClick('Get the full documentation from https://react.dev/learn')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Scrape: React docs</button>
                  <button onClick={() => handleExampleClick('Analyze this GitHub repo: https://github.com/microsoft/TypeScript')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Scrape: GitHub repository</button>
                  <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-500 italic">ℹ️ Universal scraper</p>
                </div>
              </div>

              {/* Location */}
              <div>
                <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400">
                    📍 Location-Based Services
                  </h3>
                  <button
                    onClick={async () => {
                      if (location) {
                        clearLocation();
                      } else {
                        await requestLocation();
                      }
                    }}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      location 
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50' 
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                    title={location ? 'Location enabled - Click to disable' : 'Location disabled - Click to enable'}
                  >
                    {locationLoading ? '⏳' : location ? '✓ Enabled' : '✗ Disabled'}
                  </button>
                </div>
                <div className="space-y-1">
                  <button onClick={() => handleExampleClick('Find the top 5 restaurants near my current location')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Find nearby restaurants</button>
                  <button onClick={() => handleExampleClick('Search for coffee shops within 2 miles that are open now')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Find open coffee shops</button>
                  <button onClick={() => handleExampleClick('What is the weather forecast for my location for the next 3 days?')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Local weather forecast</button>
                  <button onClick={() => handleExampleClick('Find the nearest hospital or emergency room')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Find nearest hospital</button>
                  <button onClick={() => handleExampleClick('What tourist attractions are in my area?')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Find local attractions</button>
                  <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-500 italic">ℹ️ Privacy-first location</p>
                </div>
              </div>

              {/* Image Generation */}
              <div>
                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                  🎨 AI Image Generation
                </h3>
                <div className="space-y-1">
                  <button onClick={() => handleExampleClick('Generate an image of a serene mountain landscape at sunset with golden light')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Landscape: Mountain sunset</button>
                  <button onClick={() => handleExampleClick('Create a photorealistic portrait of a professional business woman smiling')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Portrait: Business professional</button>
                  <button onClick={() => handleExampleClick('Generate a cartoon-style illustration of a friendly robot helping humans')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Cartoon: Friendly robot</button>
                  <button onClick={() => handleExampleClick('Create a fast sketch of a coffee cup on a desk')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Quick sketch: Coffee cup</button>
                  <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-500 italic">ℹ️ Smart model selection</p>
                </div>
              </div>
            </div>

            {/* Column 3: Knowledge Base, Browser, Data Analysis */}
            <div className="space-y-6">
              {/* Knowledge Base */}
              <div>
                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                  📚 Internal Knowledge Base (RAG)
                </h3>
                <div className="space-y-1">
                  <button onClick={() => handleExampleClick('How do I configure OpenAI embeddings in this project?')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Search: OpenAI config</button>
                  <button onClick={() => handleExampleClick('What is the RAG implementation in this codebase?')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Search: RAG system</button>
                  <button onClick={() => handleExampleClick('How do I deploy Lambda functions in this project?')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Search: Lambda deployment</button>
                  <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-500 italic">ℹ️ Semantic search with RAG</p>
                </div>
              </div>

              {/* Data Analysis */}
              <div>
                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                  📈 Data Analysis & Comparison
                </h3>
                <div className="space-y-1">
                  <button onClick={() => handleExampleClick('Compare population growth rates of the top 5 most populous countries')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Compare: Population growth</button>
                  <button onClick={() => handleExampleClick('What are the key differences between Python and JavaScript?')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Compare: Python vs JavaScript</button>
                  <button onClick={() => handleExampleClick('Analyze pros and cons of renewable energy sources')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Analyze: Renewable energy</button>
                  <button onClick={() => handleExampleClick('Compare the performance benchmarks of React, Vue, and Angular')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Compare: JS frameworks</button>
                </div>
              </div>

              {/* Multi-Step Workflows (Todos) */}
              <div>
                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                  ✅ Multi-Step Workflows (Backend Todos)
                </h3>
                <div className="space-y-1">
                  <button onClick={() => handleExampleClick('Create a complete React blog application with authentication, post creation, and comments. Break this down into steps and implement each one.')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Build: React blog app</button>
                  <button onClick={() => handleExampleClick('Help me set up a full CI/CD pipeline for my Node.js app. Plan out all the steps needed and execute them in order.')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Setup: CI/CD pipeline</button>
                  <button onClick={() => handleExampleClick('Migrate my Express server from JavaScript to TypeScript. Create a step-by-step plan and execute each phase.')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Migrate: JS to TypeScript</button>
                  <button onClick={() => handleExampleClick('Set up a complete AWS deployment for my application including VPC, RDS database, Lambda functions, and API Gateway. Plan and implement this step by step.')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Deploy: AWS infrastructure</button>
                  <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-500 italic">ℹ️ Auto-progresses through steps (max 5 iterations)</p>
                </div>
              </div>

              {/* Knowledge Snippets */}
              <div>
                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                  📝 Knowledge Snippets (Google Sheets)
                </h3>
                <div className="space-y-1">
                  <button onClick={() => handleExampleClick('Save this code example to my snippets with tags "javascript" and "async": async function fetchData() { const response = await fetch(url); return response.json(); }')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Save: Code snippet</button>
                  <button onClick={() => handleExampleClick('Remember this information: TypeScript 5.0 introduced const type parameters for generic functions')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Save: Quick note</button>
                  <button onClick={() => handleExampleClick('Search my snippets for "react hooks"')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Search: Saved snippets</button>
                  <button onClick={() => handleExampleClick('Find all my snippets tagged with "python"')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">Search: By tag</button>
                  <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-500 italic">ℹ️ Stored in your personal Google Sheet</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
