import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { GitHubLink } from './GitHubLink';
import { Link } from 'react-router-dom';

export const LoginScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { login } = useAuth();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [hasAttemptedOneTap, setHasAttemptedOneTap] = useState(false);

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  useEffect(() => {
    if (buttonRef.current) {
      const initializeGoogleButton = () => {
        if (typeof google !== 'undefined' && google.accounts) {
          const clientId = import.meta.env.VITE_GGL_CID;
          
          if (!clientId) {
            console.error('❌ VITE_GOOGLE_CLIENT_ID not configured in ui-new/.env');
            return;
          }
          
          console.log('LoginScreen: Initializing Google Sign-In');
          (google.accounts.id.initialize as any)({
            client_id: clientId,
            callback: (response: any) => {
              if (response.credential) {
                console.log('LoginScreen: Login successful');
                login(response.credential);
              }
            },
            // Disable auto-select to prevent automatic popup on re-login
            auto_select: false,
            cancel_on_tap_outside: false
          });

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

          // Attempt silent sign-in for returning users
          // Only attempt once per mount to prevent "Cannot continue with Google" popup
          if (!hasAttemptedOneTap) {
            setHasAttemptedOneTap(true);
            console.log('LoginScreen: Attempting One Tap sign-in (first time this mount)');
            
            try {
              // Call prompt without notification callback to avoid deprecated methods warning
              (google.accounts.id.prompt as any)();
            } catch (error) {
              // Silently catch any Google One Tap errors to prevent popup
              console.log('LoginScreen: One Tap prompt failed silently:', error);
            }
          } else {
            console.log('LoginScreen: Skipping One Tap (already attempted this mount)');
          }
        } else {
          console.log('LoginScreen: Google SDK not loaded yet, retrying...');
          setTimeout(initializeGoogleButton, 100);
        }
      };

      initializeGoogleButton();
    }
  }, [login, hasAttemptedOneTap]);

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

      {/* GitHub Link */}
      <GitHubLink hideGitHub={true} />
    </div>
  );
};
