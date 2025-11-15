import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { googleAuth } from '../services/googleAuth';

export const LoginScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [isInitializing, setIsInitializing] = useState(true);
  const hasInitialized = useRef(false);

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      
      // Initialize Google Auth service
      googleAuth.init()
        .then(() => {
          console.log('✅ Google Auth service initialized');
          setIsInitializing(false);
        })
        .catch((error) => {
          console.error('❌ Failed to initialize Google Auth:', error);
          setIsInitializing(false);
        });
    }
  }, []);

  const handleSignIn = async () => {
    try {
      await googleAuth.signIn();
      // The googleAuth service will handle the rest via events
    } catch (error) {
      console.error('❌ Sign-in failed:', error);
    }
  };

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

          {/* Google Sign-In Button - Custom OAuth2 button */}
          <div className="flex justify-center mb-4">
            <button
              onClick={handleSignIn}
              disabled={isInitializing}
              className="flex items-center gap-3 px-6 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow hover:shadow-md transition-all text-gray-700 dark:text-gray-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {isInitializing ? t('auth.initializing') || 'Initializing...' : t('auth.signInWithGoogle') || 'Sign in with Google'}
            </button>
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
