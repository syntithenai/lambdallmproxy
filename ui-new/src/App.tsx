import { useState, useEffect, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProjectProvider } from './contexts/ProjectContext';
import { SearchResultsProvider } from './contexts/SearchResultsContext';
import { PlaylistProvider } from './contexts/PlaylistContext';
import { PlayerProvider } from './contexts/PlayerContext';
import { SwagProvider } from './contexts/SwagContext';
import { FeedProvider } from './contexts/FeedContext';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { YouTubeAuthProvider } from './contexts/YouTubeAuthContext';
import { UsageProvider, useUsage } from './contexts/UsageContext';
import { CastProvider } from './contexts/CastContext';
import { LocationProvider } from './contexts/LocationContext';
import { TTSProvider } from './contexts/TTSContext';
import { TTS_FEATURE_ENABLED } from './types/tts';
import { FeaturesProvider, useFeatures } from './contexts/FeaturesContext';
import { ToastProvider } from './components/ToastManager';
import { chatHistoryDB } from './utils/chatHistoryDB';
import { getCachedApiBase } from './utils/api';
import { LoginScreen } from './components/LoginScreen';
import { GoogleLoginButton } from './components/GoogleLoginButton';
import { PlaylistButton } from './components/PlaylistButton';
import { BackgroundPlayer } from './components/BackgroundPlayer';
import { ChatTab } from './components/ChatTab';
import ProviderSetupGate from './components/ProviderSetupGate';
import { GlobalTTSStopButton } from './components/ReadButton';
import { GitHubLink } from './components/GitHubLink';
import { WelcomeWizard } from './components/WelcomeWizard';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { OfflineStatus } from './components/OfflineStatus';
import { useLocalStorage } from './hooks/useLocalStorage';
import { unifiedSync } from './services/unifiedSync';
import { plansAdapter, playlistsAdapter, googleSheetsAdapter } from './services/adapters';
import { SyncStatusProvider } from './contexts/SyncStatusContext';
import { AgentProvider, useAgents } from './contexts/AgentContext';
import { GlobalAgentIndicator } from './components/GlobalAgentIndicator';
import ProjectSelectorButton from './components/ProjectSelectorButton';

// Lazy-loaded components for code splitting
const SettingsPage = lazy(() => import('./components/SettingsPage').then(m => ({ default: m.SettingsPage })));
const PlanningPage = lazy(() => import('./components/PlanningPage').then(m => ({ default: m.PlanningPage })));
const SwagPage = lazy(() => import('./components/SwagPage').then(m => ({ default: m.SwagPage })));
const QuizPage = lazy(() => import('./components/QuizPage'));
const FeedPage = lazy(() => import('./components/FeedPage'));
const BillingPage = lazy(() => import('./components/BillingPage'));
const HelpPage = lazy(() => import('./components/HelpPage').then(m => ({ default: m.HelpPage })));
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicy })));
const SharedSnippetViewer = lazy(() => import('./components/SharedSnippetViewer').then(m => ({ default: m.SharedSnippetViewer })));
const SharedChatViewer = lazy(() => import('./components/SharedChatViewer').then(m => ({ default: m.SharedChatViewer })));
const SharedFeedItemViewer = lazy(() => import('./components/SharedFeedItemViewer').then(m => ({ default: m.SharedFeedItemViewer })));
const ImageEditorPage = lazy(() => import('./components/ImageEditor/ImageEditorPage').then(m => ({ default: m.ImageEditorPage })));
const AgentManager = lazy(() => import('./components/AgentManager').then(m => ({ default: m.AgentManager })));

// Loading fallback component
const LoadingFallback = () => (
  <div className="flex items-center justify-center h-full">
    <div className="text-center">
      <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400"></div>
      <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
    </div>
  </div>
);

// Create a wrapper component that can access auth context
function AppContent() {
  const { isAuthenticated, getToken } = useAuth();
  const { settings } = useSettings();
  const { usage, loading: usageLoading } = useUsage();
  const { showAgentManager, setShowAgentManager } = useAgents();
  const { features } = useFeatures();
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [showMCPDialog, setShowMCPDialog] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [showNavigationWarning, setShowNavigationWarning] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showWelcomeWizard, setShowWelcomeWizard] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  
  // Debug: Log route changes
  useEffect(() => {
    console.log('🧭 Route changed to:', location.pathname);
  }, [location.pathname]);

  // Debug: Log welcome wizard state changes
  useEffect(() => {
    console.log('🎓 showWelcomeWizard changed to:', showWelcomeWizard);
  }, [showWelcomeWizard]);
  
  // Initialize unified sync system - ONLY after authentication
  useEffect(() => {
    // Register sync adapters (always register, even if not starting)
    unifiedSync.registerAdapter(plansAdapter);
    unifiedSync.registerAdapter(playlistsAdapter);
    unifiedSync.registerAdapter(googleSheetsAdapter);
    
    // ⚠️ CRITICAL: Only start sync if user is authenticated
    // This prevents Google Sheets sync errors on login page
    if (!isAuthenticated) {
      console.log('⚠️ User not authenticated, unified sync disabled');
      return;
    }
    
    // Check if auto-sync is enabled (default to enabled, opt-out)
    const autoSyncEnabled = localStorage.getItem('auto_sync_enabled') !== 'false';
    
    if (autoSyncEnabled) {
      // Start automatic periodic sync (every 5 minutes)
      unifiedSync.start(5 * 60 * 1000);
      console.log('✅ Unified sync started (plans, playlists, google-sheets)');
    } else {
      console.log('⚠️ Auto-sync disabled by user');
    }
    
    // Cleanup on unmount
    return () => {
      unifiedSync.stop();
    };
  }, [isAuthenticated]); // Dependency on isAuthenticated to restart sync after login
  
  // Handle language changes and document direction
  useEffect(() => {
    if (settings.language && i18n.language !== settings.language) {
      i18n.changeLanguage(settings.language);
    }
    
    // Set document direction based on language
    const direction = ['ar', 'he', 'fa'].includes(i18n.language) ? 'rtl' : 'ltr';
    document.documentElement.dir = direction;
    document.documentElement.lang = i18n.language;
  }, [settings.language, i18n]);
  
  // Global keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K or ? to open keyboard shortcuts help
      if ((e.ctrlKey && e.key === 'k') || e.key === '?') {
        e.preventDefault();
        setShowKeyboardShortcuts(true);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  // Close mobile menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);
  
  // Handle navigation with loading check
  const handleNavigate = (path: string) => {
    console.log('handleNavigate called:', { path, isChatLoading, currentPath: location.pathname });
    if (isChatLoading && location.pathname === '/') {
      // Show warning dialog instead of blocking
      console.log('Showing navigation warning (chat is loading)');
      setPendingNavigation(path);
      setShowNavigationWarning(true);
    } else {
      console.log('Navigating to:', path);
      navigate(path);
    }
  };
  
  // Confirm navigation and stop active request
  const confirmNavigation = () => {
    setShowNavigationWarning(false);
    if (pendingNavigation) {
      navigate(pendingNavigation);
    }
    setPendingNavigation(null);
  };
  
  // Cancel navigation
  const cancelNavigation = () => {
    setShowNavigationWarning(false);
    setPendingNavigation(null);
  };
  
  // Auto-dismiss navigation warning when loading completes
  useEffect(() => {
    if (!isChatLoading && showNavigationWarning) {
      setShowNavigationWarning(false);
      setPendingNavigation(null);
    }
  }, [isChatLoading, showNavigationWarning]);
  
  // Tool configuration - shared between ChatTab and SettingsModal
  const [enabledTools, setEnabledTools] = useLocalStorage<{
    web_search: boolean;
    execute_js: boolean;
    scrape_url: boolean;
    youtube: boolean;
    transcribe: boolean;
    generate_chart: boolean;
    generate_image: boolean;
    search_knowledge_base: boolean;
    manage_todos: boolean;
    manage_snippets: boolean;
    ask_llm: boolean;
    generate_reasoning_chain: boolean;
  }>('chat_enabled_tools', {
    web_search: true,
    execute_js: true,
    scrape_url: true,
    youtube: true,
    transcribe: true,
    generate_chart: true,
    generate_image: true,
    search_knowledge_base: false, // Independent server-side knowledge base tool
    manage_todos: true, // Backend todo queue management
    manage_snippets: true, // Google Sheets snippets storage
    ask_llm: false, // Recursive LLM agent - DISABLED by default due to high token usage
    generate_reasoning_chain: false // Deep reasoning chains - DISABLED by default due to EXTREME token usage
  });
  
  // NOTE: search_knowledge_base is now independent from the local RAG system
  // Local RAG uses the "Use Knowledge Base Context" checkbox in chat
  // search_knowledge_base is a separate server-side tool enabled in Settings > Tools

  // Warn user before closing/refreshing during active request
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isChatLoading && location.pathname === '/chat') {
        e.preventDefault();
        e.returnValue = ''; // Chrome requires returnValue to be set
        return ''; // Some browsers use return value
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isChatLoading, location.pathname]);

  // Migrate chat history from localStorage to IndexedDB on mount
  useEffect(() => {
    const migrateData = async () => {
      try {
        console.log('Starting migration from localStorage to IndexedDB...');
        const migratedCount = await chatHistoryDB.migrateFromLocalStorage();
        console.log(`Migration complete: ${migratedCount} chats migrated`);
        
        // Cleanup old chats, keep 100 most recent
        await chatHistoryDB.cleanupOldChats(100);
        console.log('Cleanup complete: kept 100 most recent chats');
      } catch (error) {
        console.error('Error during migration:', error);
      }
    };
    
    migrateData();
  }, []);

  // Initialize Google Identity Services for client-side Sheets API
  useEffect(() => {
    const clientId = import.meta.env.VITE_GGL_CID;
    if (clientId && (window as any).google) {
      initGoogleIdentity(clientId);
    } else if (clientId) {
      // Wait for GIS script to load
      const checkGIS = setInterval(() => {
        if ((window as any).google) {
          initGoogleIdentity(clientId);
          clearInterval(checkGIS);
        }
      }, 100);
      // Timeout after 5 seconds
      setTimeout(() => clearInterval(checkGIS), 5000);
    }
  }, []);

  // Check authorization status on mount
  useEffect(() => {
    const checkAuthAndProviders = async () => {
      if (!isAuthenticated) {
        setHasCheckedAuth(true);
        return;
      }

      try {
        const token = await getToken();
        if (!token) {
          setHasCheckedAuth(true);
          return;
        }

        // Show UI immediately - we have a valid JWT
        setHasCheckedAuth(true);

        // Check provider setup in background (non-blocking)
        const lambdaUrl = await getCachedApiBase();
        const response = await fetch(`${lambdaUrl}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'test' }],
            providers: settings.providers || []
          })
        });

        if (response.status === 403) {
          const data = await response.json();
          if (data.requiresProviderSetup) {
            console.log('🔒 User needs to configure providers');
            setIsBlocked(true);
          }
        }
      } catch {
        // Silently handle network errors - they're not critical for app functionality
        // The auth check is just for provider setup verification
        console.log('Unable to verify provider setup status (this is not critical)');
      }
    };

    if (isAuthenticated && !hasCheckedAuth) {
      checkAuthAndProviders();
    }
  }, [isAuthenticated, getToken, settings.providers, hasCheckedAuth]);

  // Check if we should show the welcome wizard
  useEffect(() => {
    // Temporarily disabled automatic welcome wizard to debug manual trigger
    // if (hasCheckedAuth && isAuthenticated && shouldShowWelcomeWizard(isAuthenticated)) {
    //   // Small delay to let the UI finish rendering
    //   const timer = setTimeout(() => setShowWelcomeWizard(true), 500);
    //   return () => clearTimeout(timer);
    // }
  }, [hasCheckedAuth, isAuthenticated]);

  // Listen for manual welcome wizard trigger events
  useEffect(() => {
    const handleShowWelcomeWizard = () => {
      console.log('🎓 Received show-welcome-wizard event, setting showWelcomeWizard to true');
      setShowWelcomeWizard(prev => {
        console.log('🎓 State update function called, prev:', prev, 'new: true');
        return true;
      });
    };

    window.addEventListener('show-welcome-wizard', handleShowWelcomeWizard);
    return () => window.removeEventListener('show-welcome-wizard', handleShowWelcomeWizard);
  }, []);

  // Check if we're on a public route (shared snippet viewer, shared chat, shared feed, privacy policy, help page)
  const hasShareParam = new URLSearchParams(location.search).has('share'); // Legacy format
  const isChatShared = location.hash.includes('/chat/shared'); // New hash-based format
  const isFeedShared = location.pathname.startsWith('/feed/share/'); // Feed share format (path-based)
  const isPublicRoute = location.pathname.startsWith('/snippet/shared') || 
                        location.hash.includes('/snippet/shared') ||
                        location.pathname === '/privacy' ||
                        location.pathname === '/help' ||
                        hasShareParam ||
                        isChatShared ||
                        isFeedShared;
  
  // Debug: Log public route detection
  useEffect(() => {
    console.log('🔍 Public route detection:', {
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      hasShareParam,
      isChatShared,
      isFeedShared,
      isPublicRoute
    });
  }, [location.pathname, location.search, location.hash, hasShareParam, isChatShared, isFeedShared, isPublicRoute]);
  
  // Show public pages without authentication
  if (isPublicRoute) {
    return (
      <>
        <Suspense fallback={<LoadingFallback />}>
          {location.pathname.startsWith('/snippet/shared') || location.hash.includes('/snippet/shared') ? (
            <SharedSnippetViewer />
          ) : hasShareParam || isChatShared ? (
            <SharedChatViewer />
          ) : isFeedShared ? (
            <SharedFeedItemViewer />
          ) : location.pathname === '/privacy' ? (
            <PrivacyPolicy />
          ) : location.pathname === '/help' ? (
            <HelpPage />
          ) : null}
        </Suspense>
        
        {/* Welcome Wizard - Also available on public routes for authenticated users */}
        {isAuthenticated && (
          <WelcomeWizard 
            isOpen={showWelcomeWizard}
            onClose={() => setShowWelcomeWizard(false)}
          />
        )}
      </>
    );
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  // Show loading while checking auth
  if (!hasCheckedAuth) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  // Show provider setup gate if blocked OR if usage exceeded
  const isUsageExceeded = usage?.exceeded || false;
  
  if (isBlocked || isUsageExceeded) {
    return (
      <ProviderSetupGate 
        isBlocked={isBlocked || isUsageExceeded} 
        onUnblock={() => setIsBlocked(false)} 
      />
    );
  }

  // Show full app UI only when authenticated
  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-gray-900">
      {/* Skip to main content link - Accessibility */}
      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:z-50 focus:p-4 focus:bg-blue-600 focus:text-white focus:rounded-br-lg focus:shadow-lg"
      >
        Skip to main content
      </a>

      {/* Header - Only visible when authenticated */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-center px-0 md:px-4 py-3 w-full md:max-w-screen-2xl md:mx-auto">
          {/* Left side: Logo and Project Selector */}
          <div className="flex items-center gap-3">
            <img 
              src={`${import.meta.env.BASE_URL}agent.png`}
              alt="Research Agent" 
              className="h-10 sm:h-12 w-auto object-contain"
            />
            <ProjectSelectorButton />
          </div>
          
          {/* Desktop Navigation - Hidden on mobile */}
          <div className="hidden md:flex items-center gap-3">
            <PlaylistButton />
            
            {/* Billing Button with Credit Info - Hide on billing page */}
            {location.pathname !== '/billing' && (
              <button
                onClick={() => { console.log('Billing button clicked, navigating to /billing'); handleNavigate('/billing'); }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors shadow-sm font-medium bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 min-h-11 touch-target select-none"
                title={usage ? `You have $${usage.creditBalance.toFixed(2)} remaining of $${usage.totalCredits.toFixed(2)} total credits` : 'View billing and usage details'}
                aria-label="Billing and credits"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                {usage && !usageLoading && typeof usage.creditBalance === 'number' && typeof usage.totalCredits === 'number' && (
                  <span className={`text-xs font-medium select-none ${
                    usage.exceeded 
                      ? 'text-red-600 dark:text-red-400' 
                      : 'text-green-600 dark:text-green-400'
                  }`}>
                    ${usage.creditBalance.toFixed(2)} / ${usage.totalCredits.toFixed(2)}
                  </span>
                )}
              </button>
            )}
            
            {/* Back button - Show on ALL pages except feed (/) */}
            {location.pathname !== '/' && (
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 p-2 md:px-3 md:py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm font-medium min-h-11 touch-target"
                title="Back to Feed"
                aria-label="Back to Feed"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                <span className="text-sm hidden md:inline">Back</span>
              </button>
            )}
            
            <GlobalAgentIndicator />
            
            <GoogleLoginButton />
          </div>
          
          {/* Mobile Navigation - Visible only on mobile */}
          <div className="flex md:hidden items-center gap-2">
            {/* Quick Billing on Mobile */}
            {location.pathname !== '/billing' && usage && !usageLoading && typeof usage.creditBalance === 'number' && (
              <div className={`text-xs font-medium px-2 py-1 rounded ${
                usage.exceeded 
                  ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20' 
                  : 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
              }`}>
                ${usage.creditBalance.toFixed(2)}
              </div>
            )}
            
            {/* Back button - Show on ALL pages except feed (/) */}
            {location.pathname !== '/' && (
              <button
                onClick={() => handleNavigate('/')}
                className="px-3 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors flex items-center gap-2"
                title="Back to Feed"
                aria-label="Back to Feed"
              >
                <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="hidden md:inline text-sm font-medium text-gray-700 dark:text-gray-300">Back</span>
              </button>
            )}
            
            {/* Hamburger Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="icon-button"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <svg className="w-6 h-6 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
        
        {/* Mobile Menu Dropdown */}
        {mobileMenuOpen && (
          <nav 
            className="md:hidden border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
            role="navigation"
            aria-label="Mobile navigation"
          >
            <div className="px-4 py-2 space-y-1">
              {/* Feed */}
              {location.pathname !== '/' && (
                <button
                  onClick={() => {
                    navigate('/');
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-lg transition-colors text-left touch-target hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 5c7.18 0 13 5.82 13 13M6 11a7 7 0 017 7m-6 0a1 1 0 11-2 0 1 1 0 012 0z" />
                  </svg>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Feed</span>
                </button>
              )}
              
              {/* Chat */}
              {location.pathname !== '/chat' && (
                <button
                  onClick={() => {
                    navigate('/chat');
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-lg transition-colors text-left touch-target hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Chat</span>
                </button>
              )}
              
              {location.pathname !== '/billing' && (
                <button
                  onClick={() => {
                    handleNavigate('/billing');
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-lg transition-colors text-left touch-target hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <div className="flex-1">
                    <div className="font-medium text-gray-700 dark:text-gray-300">Billing</div>
                    {usage && !usageLoading && typeof usage.creditBalance === 'number' && typeof usage.totalCredits === 'number' && (
                      <div className={`text-xs ${usage.exceeded ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                        ${usage.creditBalance.toFixed(2)} / ${usage.totalCredits.toFixed(2)}
                      </div>
                    )}
                  </div>
                </button>
              )}
              
              {location.pathname !== '/swag' && (
                <button
                  onClick={() => {
                    handleNavigate('/swag');
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-lg transition-colors text-left touch-target hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8 2C8 1.45 8.45 1 9 1h6c.55 0 1 .45 1 1v2h-8V2zm-1 4h10l1.5 13c.08.72-.48 1.32-1.2 1.32H6.7c-.72 0-1.28-.6-1.2-1.32L7 6zm5 2c-2.21 0-4 1.79-4 4v6h8v-6c0-2.21-1.79-4-4-4z"/>
                  </svg>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Swag</span>
                </button>
              )}
              
              {/* Image Editor Link - Only show if feature is available */}
              {features?.imageEditing && (
                <button
                  onClick={() => {
                    handleNavigate('/image-editor');
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-lg transition-colors text-left touch-target hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Image Editor</span>
                </button>
              )}
              
              <button
                onClick={() => {
                  handleNavigate('/settings');
                  setMobileMenuOpen(false);
                }}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-lg transition-colors text-left touch-target hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="font-medium text-gray-700 dark:text-gray-300">Settings</span>
              </button>

              {/* Help Link */}
              <button
                onClick={() => {
                  handleNavigate('/help');
                  setMobileMenuOpen(false);
                }}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-lg transition-colors text-left touch-target hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium text-gray-700 dark:text-gray-300">Help</span>
              </button>

              {/* Privacy Policy Link */}
              <button
                onClick={() => {
                  handleNavigate('/privacy');
                  setMobileMenuOpen(false);
                }}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-lg transition-colors text-left touch-target hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span className="font-medium text-gray-700 dark:text-gray-300">Privacy Policy</span>
              </button>

              {/* GitHub Link */}
              <a
                href="https://github.com/syntithenai/lambdallmproxy"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-lg transition-colors text-left touch-target hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                <span className="font-medium text-gray-700 dark:text-gray-300">GitHub</span>
              </a>
              
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <GoogleLoginButton />
              </div>
            </div>
          </nav>
        )}
      </header>

      {/* Global TTS Stop Button */}
      {TTS_FEATURE_ENABLED && <GlobalTTSStopButton />}

      {/* Background Player - Always mounted for continuous audio */}
      <BackgroundPlayer />

      {/* Main Content - Only visible when authenticated */}
      <main id="main-content" className="flex-1 overflow-y-auto pt-[73px]">
        <div className="min-h-full w-full md:max-w-screen-2xl md:mx-auto">
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              {/* Feed is now the default landing page */}
              <Route path="/" element={<FeedPage />} />
              <Route path="/feed" element={<FeedPage />} />
              
              {/* Chat is accessible at /chat */}
              <Route 
                path="/chat" 
                element={
                  <ChatTab 
                    enabledTools={enabledTools}
                    setEnabledTools={setEnabledTools}
                    showMCPDialog={showMCPDialog}
                    setShowMCPDialog={setShowMCPDialog}
                    onLoadingChange={setIsChatLoading}
                  />
                } 
              />
              <Route path="/planning" element={<PlanningPage />} />
              <Route path="/swag" element={<SwagPage />} />
              <Route path="/quiz" element={<QuizPage />} />
              <Route path="/image-editor" element={<ImageEditorPage />} />
              <Route path="/snippet/shared" element={<SharedSnippetViewer />} />
              <Route path="/feed/share/:data" element={<SharedFeedItemViewer />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/settings" element={
                <SettingsPage 
                  enabledTools={enabledTools}
                  setEnabledTools={setEnabledTools}
                  onOpenMCPDialog={() => setShowMCPDialog(true)}
                />
              } />
              <Route path="/help" element={<HelpPage />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
            </Routes>
          </Suspense>
        </div>
      </main>

      {/* Agent Manager Modal */}
      {showAgentManager && (
        <Suspense fallback={null}>
          <AgentManager
            onSwitchToAgent={() => {
              // Navigate to chat and load the agent's chat
              handleNavigate('/chat');
              setShowAgentManager(false);
              // TODO: Load chat by chatId in ChatTab
            }}
            onCreateNewAgent={() => {
              handleNavigate('/chat');
              setShowAgentManager(false);
            }}
            onClose={() => setShowAgentManager(false)}
          />
        </Suspense>
      )}

      {/* Keyboard Shortcuts Modal */}
      {showKeyboardShortcuts && (
        <KeyboardShortcutsModal 
          isOpen={showKeyboardShortcuts}
          onClose={() => setShowKeyboardShortcuts(false)}
        />
      )}

      {/* Navigation Warning Dialog */}
      {showNavigationWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="card max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              ⚠️ Active Request in Progress
            </h3>
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              You have an active chat request running. Navigating away will stop the current request and you may lose the response.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-6 font-semibold">
              Are you sure you want to continue?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelNavigation}
                className="btn-secondary px-4 py-2"
              >
                Stay Here
              </button>
              <button
                onClick={confirmNavigation}
                className="btn-primary px-4 py-2 bg-orange-600 hover:bg-orange-700"
              >
                Navigate Away
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Right Action Buttons - Fixed bottom right */}
      <GitHubLink />

      {/* Offline Status Overlay */}
      <OfflineStatus />

      {/* Welcome Wizard - Show once on first login */}
      <WelcomeWizard 
        isOpen={showWelcomeWizard}
        onClose={() => setShowWelcomeWizard(false)}
      />
    </div>
  );
}

import './App.css';
import { initGoogleIdentity } from './services/googleSheetsClient';

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ToastProvider>
        <AuthProvider>
          <ProjectProvider>
            <FeaturesProvider>
              <UsageProvider>
                <SettingsProvider>
                  <LocationProvider>
                    <SyncStatusProvider>
                      <AgentProvider>
                      {TTS_FEATURE_ENABLED ? (
                        <TTSProvider>
                          <CastProvider>
                            <YouTubeAuthProvider>
                              <PlaylistProvider>
                                <PlayerProvider>
                                  <SearchResultsProvider>
                                    <SwagProvider>
                                      <FeedProvider>
                                        <AppContent />
                                      </FeedProvider>
                                    </SwagProvider>
                                  </SearchResultsProvider>
                                </PlayerProvider>
                              </PlaylistProvider>
                            </YouTubeAuthProvider>
                          </CastProvider>
                        </TTSProvider>
                      ) : (
                        <CastProvider>
                          <YouTubeAuthProvider>
                            <PlaylistProvider>
                              <PlayerProvider>
                                <SearchResultsProvider>
                                  <SwagProvider>
                                    <FeedProvider>
                                      <AppContent />
                                    </FeedProvider>
                                  </SwagProvider>
                                </SearchResultsProvider>
                              </PlayerProvider>
                            </PlaylistProvider>
                          </YouTubeAuthProvider>
                        </CastProvider>
                      )}
                    </AgentProvider>
                  </SyncStatusProvider>
                </LocationProvider>
              </SettingsProvider>
            </UsageProvider>
          </FeaturesProvider>
          </ProjectProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
