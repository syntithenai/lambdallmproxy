import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getCachedApiBase } from '../utils/api';
import { requestGoogleAuth } from '../utils/googleDocs';

interface FixResponseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  messageData?: {
    messageId: string;
    messageContent: string;
    llmApiCalls: any[];
    evaluations?: any[];
    conversationThread: any[];
  };
  planData?: {
    query: string;
    generatedSystemPrompt: string;
    generatedUserQuery: string;
    llmInfo: any;
  };
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

export function FixResponseDialog({ isOpen, onClose, messageData, planData, showSuccess, showError }: FixResponseDialogProps) {
  const [explanation, setExplanation] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { getToken } = useAuth();
  
  const MAX_LENGTH = 2000;
  const remainingChars = MAX_LENGTH - explanation.length;
  
  const handleSend = async () => {
    if (!explanation.trim()) {
      setError('Please provide an explanation');
      return;
    }
    
    setIsSending(true);
    setError(null);
    
    try {
      // Get ID token for user authentication
      const idToken = await getToken();
      if (!idToken) {
        throw new Error('Not authenticated. Please log in.');
      }
      
      // Get Google OAuth access token for Sheets API
      const googleAccessToken = await requestGoogleAuth();
      const apiBase = await getCachedApiBase();
      
      console.log('🔑 Token check:', {
        hasIdToken: !!idToken,
        hasGoogleToken: !!googleAccessToken,
        googleTokenPrefix: googleAccessToken.substring(0, 20)
      });
      
      // Call backend API to log report
      const requestBody: any = {
        explanation: explanation.trim(),
        timestamp: new Date().toISOString()
      };
      
      if (messageData) {
        requestBody.messageData = {
          messageId: messageData.messageId,
          messageContent: messageData.messageContent,
          llmApiCalls: messageData.llmApiCalls,
          evaluations: messageData.evaluations || [],
          conversationThread: messageData.conversationThread
        };
      }
      
      if (planData) {
        requestBody.planData = planData;
        requestBody.feedbackType = 'negative';
      }
      
      const response = await fetch(`${apiBase}/report-error`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
          'X-Google-Access-Token': googleAccessToken  // Google OAuth token for Sheets API
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      // Success!
      setExplanation('');
      onClose();
      showSuccess('📝 Report submitted successfully! Thank you for your feedback.');
      
    } catch (err) {
      console.error('Failed to submit error report:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit report. Please try again.';
      setError(errorMessage);
      showError(`Failed to submit report: ${errorMessage}`);
    } finally {
      setIsSending(false);
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 z-10">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚩</span>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Report Response Issue
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        
        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Privacy Notice */}
          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800 text-sm">
            <p className="text-blue-900 dark:text-blue-100">
              ℹ️ <strong>Privacy Notice:</strong> Your report will include this conversation's 
              full context and will be reviewed by the development team to improve the system. 
              Please do not include sensitive personal information in your explanation.
            </p>
          </div>
          
          <p className="text-gray-700 dark:text-gray-300">
            Help us improve! Describe what went wrong with this response:
          </p>
          
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value.slice(0, MAX_LENGTH))}
            placeholder="Examples:&#10;• Response was factually incorrect about...&#10;• Did not answer my actual question&#10;• Hallucinated information&#10;• Ignored previous context&#10;• Missing important details"
            className="w-full h-48 px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            autoFocus
          />
          
          <div className="flex justify-between items-center text-sm">
            <span className={`${
              remainingChars < 100 
                ? 'text-orange-600 dark:text-orange-400 font-medium' 
                : 'text-gray-500 dark:text-gray-400'
            }`}>
              {remainingChars} characters remaining
            </span>
          </div>
          
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800">
              <p className="text-red-900 dark:text-red-100 text-sm">
                ⚠️ {error}
              </p>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-gray-900 flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            disabled={isSending}
            className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={isSending || !explanation.trim()}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSending ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>Sending...</span>
              </>
            ) : (
              <>
                <span>📤</span>
                <span>Send Report</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
