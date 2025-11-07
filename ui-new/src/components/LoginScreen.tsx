import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';

export const LoginScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { login } = useAuth();
  const buttonRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  useEffect(() => {
    // IMPORTANT: Don't use global flag - allow re-initialization when user is logged out
    // This ensures the Google button appears when user is logged out due to inactivity
    if (buttonRef.current && !hasInitialized.current) {
      let retryCount = 0;
      const maxRetries = 100; // Maximum 10 seconds of retries (increased from 5s)
      
      const initializeGoogleButton = () => {
        if (typeof google !== 'undefined' && google.accounts) {
          const clientId = import.meta.env.VITE_GGL_CID;
          
          if (!clientId) {
            console.error('❌ VITE_GGL_CID not configured in ui-new/.env');
            return;
          }
          
          // Mark as initialized for this component instance only
          hasInitialized.current = true;
          
          console.log('✅ Google SDK loaded, initializing Sign-In button...');
          
          (google.accounts.id.initialize as any)({
            client_id: clientId,
            callback: (response: any) => {
              if (response.credential) {
                console.log('✅ Google Sign-In successful');
                login(response.credential);
              }
            },
            // CRITICAL: Disable ALL automatic behaviors
            auto_select: false,
            cancel_on_tap_outside: true,
            itp_support: false,
            use_fedcm_for_prompt: false // Disable FedCM prompts
          });
          
          // CRITICAL: Immediately cancel any auto-prompts after initialization
          try {
            (google.accounts.id as any).cancel();
          } catch (e) {
            // Ignore
          }

          (google.accounts.id.renderButton as any)(
            buttonRef.current!,
            {
              theme: 'filled_blue',
              size: 'large',
              text: 'signin_with',
              shape: 'rectangular',
              width: 300
            }
          );

          console.log('✅ Google Sign-In button ready');
        } else if (retryCount < maxRetries) {
          retryCount++;
          // Only log every 10 retries to reduce console spam
          if (retryCount % 10 === 0 || retryCount === 1) {
            console.log(`⏳ Waiting for Google SDK... (${retryCount}/${maxRetries})`);
          }
          setTimeout(initializeGoogleButton, 100);
        } else {
          console.warn('⚠️ Google SDK not loaded after 10 seconds - check network connection or browser extensions');
          // Don't give up - keep the button ref so it can be initialized later if SDK loads
        }
      };

      initializeGoogleButton();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run once on mount

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-12 max-w-3xl w-full mx-4 relative overflow-y-auto max-h-[95vh]">
        {/* Language Selector */}
        <div className="absolute top-4 right-4">
          <select
            value={i18n.language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="en">🇬🇧 {t('languages.en')}</option>
            <option value="es">🇪🇸 {t('languages.es')}</option>
            <option value="fr">🇫🇷 {t('languages.fr')}</option>
            <option value="de">🇩🇪 {t('languages.de')}</option>
            <option value="nl">🇳🇱 {t('languages.nl')}</option>
            <option value="pt">🇵🇹 {t('languages.pt')}</option>
            <option value="ru">🇷🇺 {t('languages.ru')}</option>
            <option value="zh">🇨🇳 {t('languages.zh')}</option>
            <option value="ja">🇯🇵 {t('languages.ja')}</option>
            <option value="ar">🇸🇦 {t('languages.ar')}</option>
          </select>
        </div>

        <div className="text-center mb-8">
          {/* App Logo/Icon */}
          <div className="inline-flex items-center justify-center mb-4">
            <img 
              src={`${import.meta.env.BASE_URL}agent.png`}
              alt={t('auth.researchAgent')}
              className="w-24 h-24 object-contain"
            />
          </div>
          
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {t('auth.researchAgent')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {t('auth.tagline')}
          </p>

          {/* Google Sign-In Button - Moved to top */}
          <div className="flex justify-center mb-4">
            <div 
              ref={buttonRef} 
              id="login-screen-google-signin"
              className="min-w-[300px] min-h-[44px]"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            ></div>
          </div>

          <div className="text-xs text-gray-500 dark:text-gray-400">
            {t('auth.secureAuth')}
          </div>

          {/* Privacy Link */}
          <div className="mt-3">
            <Link 
              to="/privacy" 
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
            >
              🔒 Privacy Policy
            </Link>
          </div>
        </div>

        {/* Marketing Copy */}
        <div className="mb-8 text-left space-y-4 max-w-2xl mx-auto">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white text-center">
            {t('auth.whyChooseTitle')}
          </h2>
          <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
            {t('auth.whyChooseIntro')}
          </p>
          
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              {t('auth.keyAdvantagesTitle')}
            </h3>
            
            <div className="space-y-2.5 text-sm">
              <div>
                <strong className="text-blue-600 dark:text-blue-400">{t('auth.webConnected')}:</strong>
                <span className="text-gray-700 dark:text-gray-300"> {t('auth.webConnectedDesc')}</span>
              </div>
              
              <div>
                <strong className="text-purple-600 dark:text-purple-400">{t('auth.multiTool')}:</strong>
                <span className="text-gray-700 dark:text-gray-300"> {t('auth.multiToolDesc')}</span>
              </div>
              
              <div>
                <strong className="text-green-600 dark:text-green-400">{t('auth.knowledgeBase')}:</strong>
                <span className="text-gray-700 dark:text-gray-300"> {t('auth.knowledgeBaseDesc')}</span>
              </div>
              
              <div>
                <strong className="text-indigo-600 dark:text-indigo-400">{t('auth.advancedPlanning')}:</strong>
                <span className="text-gray-700 dark:text-gray-300"> {t('auth.advancedPlanningDesc')}</span>
              </div>
              
              <div>
                <strong className="text-cyan-600 dark:text-cyan-400">🎯 Personalized Learning Feed:</strong>
                <span className="text-gray-700 dark:text-gray-300"> Discover fascinating facts, news, and educational content tailored to your interests. Test your knowledge with auto-generated quizzes and expand your learning with AI chat.</span>
              </div>
              
              <div>
                <strong className="text-yellow-600 dark:text-yellow-400">{t('auth.costEffective')}:</strong>
                <span className="text-gray-700 dark:text-gray-300"> {t('auth.costEffectiveDesc')}</span>
              </div>
              
              <div>
                <strong className="text-pink-600 dark:text-pink-400">{t('auth.transparency')}:</strong>
                <span className="text-gray-700 dark:text-gray-300"> {t('auth.transparencyDesc')}</span>
              </div>
            </div>
          </div>
          
          <p className="text-gray-700 dark:text-gray-300 text-sm italic border-t border-gray-200 dark:border-gray-700 pt-3">
            {t('auth.perfectFor')}
          </p>
        </div>
      </div>
    </div>
  );
};
