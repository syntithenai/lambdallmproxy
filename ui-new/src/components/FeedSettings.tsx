/**
 * Feed Settings Component - Manage Search Terms and Preferences
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useFeed } from '../contexts/FeedContext';
import { Plus, X, Tag, Brain } from 'lucide-react';

export default function FeedSettings() {
  const { t } = useTranslation();
  const { preferences, updateSearchTerms } = useFeed();
  
  const [searchTerms, setSearchTerms] = useState<string[]>([]);
  const [newTerm, setNewTerm] = useState('');

  // Initialize from preferences
  useEffect(() => {
    setSearchTerms(preferences.searchTerms);
  }, [preferences.searchTerms]);

  /**
   * Add new search term
   */
  const handleAddTerm = () => {
    const trimmed = newTerm.trim();
    
    if (!trimmed) return;
    
    if (searchTerms.includes(trimmed)) {
      alert(t('feed.searchTermExists'));
      return;
    }

    if (searchTerms.length >= 5) {
      alert(t('feed.maxSearchTerms'));
      return;
    }

    const updated = [...searchTerms, trimmed];
    setSearchTerms(updated);
    setNewTerm('');
    updateSearchTerms(updated);
  };

  /**
   * Remove search term
   */
  const handleRemoveTerm = (term: string) => {
    const updated = searchTerms.filter(t => t !== term);
    setSearchTerms(updated);
    updateSearchTerms(updated);
  };

  /**
   * Handle Enter key
   */
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddTerm();
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Terms */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Tag className="h-5 w-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            {t('feed.searchTerms')}
          </h3>
        </div>
        
        <p className="text-sm text-gray-600 mb-4">
          {t('feed.searchTermsDescription')}
        </p>

        {/* Current search terms */}
        <div className="space-y-2 mb-4">
          {searchTerms.map((term, index) => (
            <div
              key={index}
              className="flex items-center justify-between bg-gray-50 rounded-lg p-3"
            >
              <span className="text-gray-900 font-medium">{term}</span>
              
              <button
                onClick={() => handleRemoveTerm(term)}
                className="p-1 rounded hover:bg-gray-200 transition-colors"
                title={t('feed.removeSearchTerm')}
              >
                <X className="h-4 w-4 text-gray-600" />
              </button>
            </div>
          ))}

          {searchTerms.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              {t('feed.noSearchTerms')}
            </div>
          )}
        </div>

        {/* Add new term */}
        {searchTerms.length < 5 && (
          <div className="flex gap-2">
            <input
              type="text"
              value={newTerm}
              onChange={(e) => setNewTerm(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={t('feed.searchTermPlaceholder')}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={100}
            />
            
            <button
              onClick={handleAddTerm}
              disabled={!newTerm.trim()}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 font-medium"
            >
              <Plus className="h-4 w-4" />
              {t('feed.add')}
            </button>
          </div>
        )}

        <p className="text-xs text-gray-500 mt-2">
          {t('feed.searchTermCount', { count: searchTerms.length })}
        </p>
      </div>

      {/* Learned Preferences */}
      <div className="border-t border-gray-200 pt-6">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="h-5 w-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            {t('feed.learnedPreferences')}
          </h3>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          {t('feed.learnedPreferencesDescription')}
        </p>

        {/* Liked topics */}
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">
            {t('feed.likedTopics', { count: preferences.likedTopics.length })}
          </h4>
          
          {preferences.likedTopics.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {preferences.likedTopics.map((topic, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium"
                >
                  {topic}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">
              {t('feed.stashToLearn')}
            </p>
          )}
        </div>

        {/* Disliked topics */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">
            {t('feed.dislikedTopics', { count: preferences.dislikedTopics.length })}
          </h4>
          
          {preferences.dislikedTopics.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {preferences.dislikedTopics.map((topic, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium"
                >
                  {topic}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">
              {t('feed.trashToLearn')}
            </p>
          )}
        </div>
      </div>

      {/* Usage hints */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-900 mb-2">
          {t('feed.tipsTitle')}
        </h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• {t('feed.tip1')}</li>
          <li>• {t('feed.tip2')}</li>
          <li>• {t('feed.tip3')}</li>
          <li>• {t('feed.tip4')}</li>
        </ul>
      </div>
    </div>
  );
}
