import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Share2 } from 'lucide-react';

interface ChatHeaderProps {
  systemPrompt: string;
  selectedSnippetIds: Set<string>;
  showSnippetsPanel: boolean;
  messageCount: number;
  onNewChat: () => void;
  onShowLoadDialog: () => void;
  onToggleSnippetsPanel: () => void;
  onShowExamplesModal: () => void;
  onShowShareDialog: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  systemPrompt,
  selectedSnippetIds,
  showSnippetsPanel,
  messageCount,
  onNewChat,
  onShowLoadDialog,
  onToggleSnippetsPanel,
  onShowExamplesModal,
  onShowShareDialog,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="flex flex-wrap items-center gap-2 md:px-4 py-2 border-b border-gray-200 dark:border-gray-700">
      <div className="flex flex-wrap gap-2 flex-1">
        <button 
          onClick={onNewChat} 
          className="bg-green-600 hover:bg-green-700 text-white p-2 md:px-3 md:py-1.5 rounded font-medium text-sm transition-colors flex items-center gap-1.5" 
          title={t('chat.newChat')} 
          aria-label={t('chat.newChat')}
        >
          <span>➕</span>
          <span className="hidden md:inline">{t('chat.newChat')}</span>
        </button>
        
        <button 
          onClick={onShowLoadDialog} 
          className="btn-secondary text-sm p-2 md:px-3 md:py-1.5 flex items-center gap-1.5" 
          title={t('chat.chatHistory')} 
          aria-label={t('chat.chatHistory')}
        >
          <span>🕒</span>
          <span className="hidden md:inline">{t('chat.history')}</span>
        </button>
        
        <button
          onClick={() => navigate('/planning')}
          className="btn-secondary text-sm p-2 md:px-3 md:py-1.5 flex items-center gap-1.5"
          title={systemPrompt ? "Edit system prompt and planning" : "Create a plan"}
          aria-label={systemPrompt ? t('chat.editPlan') : t('chat.makeAPlan')}
        >
          <span>{systemPrompt ? '✏️' : '📋'}</span>
          <span className="hidden md:inline">{systemPrompt ? t('chat.editPlan') : t('chat.makeAPlan')}</span>
        </button>
        
        <button 
          onClick={onShowExamplesModal}
          className="btn-secondary text-sm p-2 md:px-3 md:py-1.5 flex items-center gap-1.5"
          title={t('chat.examples')}
          aria-label={t('chat.examples')}
        >
          <span>📝</span>
          <span className="hidden md:inline">{t('chat.examples')}</span>
        </button>
        
        <button 
          onClick={onShowShareDialog}
          className="btn-secondary text-sm p-2 md:px-3 md:py-1.5 flex items-center gap-1.5"
          title="Share this conversation"
          aria-label="Share conversation"
          disabled={messageCount === 0}
        >
          <Share2 className="h-4 w-4" />
          <span className="hidden md:inline">Share</span>
        </button>
        
        <button 
          onClick={onToggleSnippetsPanel}
          className={`text-sm p-2 md:px-3 md:py-1.5 rounded font-medium transition-colors flex items-center gap-1.5 ${
            showSnippetsPanel 
              ? 'bg-blue-600 hover:bg-blue-700 text-white' 
              : 'btn-secondary'
          }`}
          title={t('chat.attachContextTooltip')}
          aria-label={t('chat.attachContext')}
        >
          <span>📎</span>
          <span className="hidden md:inline">{t('chat.attachContext')}</span>
          {selectedSnippetIds.size > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-white text-blue-600 rounded-full font-bold">
              {selectedSnippetIds.size}
            </span>
          )}
        </button>
      </div>
    </div>
  );
};
