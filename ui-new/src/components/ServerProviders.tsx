import React from 'react';
import { useUsage, type ProviderCapability } from '../contexts/UsageContext';
import { useFeatures } from '../contexts/FeaturesContext';

export const ServerProviders: React.FC = () => {
  const { providerCapabilities: providers, loading, error } = useUsage();
  const { features } = useFeatures();

  if (loading) {
    return (
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <p className="text-sm text-blue-700 dark:text-blue-300">
          ⏳ Loading server providers...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p className="text-sm text-red-700 dark:text-red-300">
          ❌ {error}
        </p>
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          ℹ️ No server-configured providers found
        </p>
      </div>
    );
  }

  // Collate providers by type
  const collatedProviders = providers.reduce((acc, provider) => {
    const existing = acc.find(p => p.type === provider.type);
    
    if (existing) {
      // Merge this provider's data into existing
      // Combine allowed models (remove duplicates)
      if (provider.allowedModels && provider.allowedModels.length > 0) {
        existing.allowedModels = existing.allowedModels || [];
        provider.allowedModels.forEach(model => {
          if (!existing.allowedModels!.includes(model)) {
            existing.allowedModels!.push(model);
          }
        });
      }
      
      // Use highest rate limit
      if (provider.rateLimitTPM) {
        existing.rateLimitTPM = Math.max(existing.rateLimitTPM || 0, provider.rateLimitTPM);
      }
      
      // Use highest priority (lower number = higher priority)
      if (provider.priority) {
        existing.priority = Math.min(existing.priority || 100, provider.priority);
      }
      
      // Collect max quality restrictions
      if (provider.maxQuality) {
        existing.maxQualityList = existing.maxQualityList || [];
        if (!existing.maxQualityList.includes(provider.maxQuality)) {
          existing.maxQualityList.push(provider.maxQuality);
        }
      }
      
      // Keep track of instance count
      existing.instanceCount = (existing.instanceCount || 1) + 1;
      
    } else {
      // First instance of this provider type
      acc.push({
        ...provider,
        instanceCount: 1,
        maxQualityList: provider.maxQuality ? [provider.maxQuality] : []
      });
    }
    
    return acc;
  }, [] as Array<ProviderCapability & { instanceCount?: number; maxQualityList?: string[] }>);

  return (
    <div className="space-y-4">
      {/* Available Features */}
      {features && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-3">
            ✨ Available Features
          </h4>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 text-sm">
              {features.chat ? (
                <span className="text-green-600 dark:text-green-400">✅</span>
              ) : (
                <span className="text-gray-400 dark:text-gray-600">❌</span>
              )}
              <span className={features.chat ? 'text-blue-900 dark:text-blue-100' : 'text-gray-500 dark:text-gray-500'}>
                Chat & LLM
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {features.imageGeneration ? (
                <span className="text-green-600 dark:text-green-400">✅</span>
              ) : (
                <span className="text-gray-400 dark:text-gray-600">❌</span>
              )}
              <span className={features.imageGeneration ? 'text-blue-900 dark:text-blue-100' : 'text-gray-500 dark:text-gray-500'}>
                Image Generation
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {features.imageEditing ? (
                <span className="text-green-600 dark:text-green-400">✅</span>
              ) : (
                <span className="text-gray-400 dark:text-gray-600">❌</span>
              )}
              <span className={features.imageEditing ? 'text-blue-900 dark:text-blue-100' : 'text-gray-500 dark:text-gray-500'}>
                Image Editing
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {features.transcription ? (
                <span className="text-green-600 dark:text-green-400">✅</span>
              ) : (
                <span className="text-gray-400 dark:text-gray-600">❌</span>
              )}
              <span className={features.transcription ? 'text-blue-900 dark:text-blue-100' : 'text-gray-500 dark:text-gray-500'}>
                Transcription
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {features.textToSpeech ? (
                <span className="text-green-600 dark:text-green-400">✅</span>
              ) : (
                <span className="text-gray-400 dark:text-gray-600">❌</span>
              )}
              <span className={features.textToSpeech ? 'text-blue-900 dark:text-blue-100' : 'text-gray-500 dark:text-gray-500'}>
                Text-to-Speech
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {features.embeddings ? (
                <span className="text-green-600 dark:text-green-400">✅</span>
              ) : (
                <span className="text-gray-400 dark:text-gray-600">❌</span>
              )}
              <span className={features.embeddings ? 'text-blue-900 dark:text-blue-100' : 'text-gray-500 dark:text-gray-500'}>
                Embeddings (RAG)
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {features.webSearch ? (
                <span className="text-green-600 dark:text-green-400">✅</span>
              ) : (
                <span className="text-gray-400 dark:text-gray-600">❌</span>
              )}
              <span className={features.webSearch ? 'text-blue-900 dark:text-blue-100' : 'text-gray-500 dark:text-gray-500'}>
                Web Search
              </span>
            </div>
          </div>
        </div>
      )}
      
      {/* Server Providers */}
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
        <div className="p-4 border-b border-green-200 dark:border-green-800">
          <h4 className="font-semibold text-green-900 dark:text-green-100 flex items-center gap-2">
            <span>🖥️</span>
            <span>Server-Configured Providers</span>
            <span className="text-xs font-normal text-green-700 dark:text-green-300">
              ({collatedProviders.length} type{collatedProviders.length !== 1 ? 's' : ''}, {providers.length} instance{providers.length !== 1 ? 's' : ''})
            </span>
          </h4>
          <p className="text-sm text-green-700 dark:text-green-300 mt-1">
            These providers are configured via environment variables on the server and are automatically available.
          </p>
        </div>
      
      <div className="divide-y divide-green-200 dark:divide-green-800">
        {collatedProviders.map((provider) => {
          const restrictions = [];
          
          if (provider.allowedModels && provider.allowedModels.length > 0) {
            restrictions.push(`models: ${provider.allowedModels.join(', ')}`);
          }
          
          if (provider.maxQualityList && provider.maxQualityList.length > 0) {
            restrictions.push(`max quality: ${provider.maxQualityList.join(' | ')}`);
          }
          
          return (
            <div key={provider.id} className="p-3">
              <div className="text-sm text-green-900 dark:text-green-100">
                <span className="font-medium">{provider.type}</span>
                {restrictions.length > 0 && (
                  <span className="text-green-600 dark:text-green-400">
                    {' — '}{restrictions.join('; ')}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
};
