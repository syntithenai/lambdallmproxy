import React from 'react';
import { useTranslation } from 'react-i18next';

export const VoiceSettings: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          {t('settings.voice.title', 'Voice Input Settings')}
        </h2>
        <p className="text-gray-600 mb-4">
          {t('settings.voice.description', 'Configure voice input and speech recognition settings.')}
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <svg className="w-5 h-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h3 className="text-sm font-medium text-blue-900">
              {t('settings.voice.comingSoon', 'Coming Soon')}
            </h3>
            <p className="mt-1 text-sm text-blue-700">
              {t('settings.voice.comingSoonDescription', 'Voice input settings will be available in a future update. Stay tuned!')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
