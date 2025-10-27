import React, { useState, useEffect, useRef } from 'react';
import { markWelcomeWizardComplete } from '../utils/auth';

interface WelcomeWizardProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
}

interface TourStep {
  id: string;
  type: 'modal' | 'spotlight';
  title: string;
  content: string;
  targetSelector?: string;
  tooltipPosition?: 'top' | 'bottom' | 'left' | 'right';
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    type: 'modal',
    title: '👋 Welcome to Research Agent!',
    content: `Your AI-powered research assistant with:
• 🌐 Real-time web search
• 📊 Advanced planning tools
• 💾 Knowledge management (SWAG)
• 🎙️ Voice & transcription
• 📈 Cost tracking & billing

Ready to explore? Let's take a quick tour! (2 minutes)`,
  },
  {
    id: 'chat',
    type: 'spotlight',
    title: '💬 Start Here: Chat Interface',
    content: `This is your main workspace. Ask questions, request research, or use tools like web search, transcription, and more.

Try: "Search for the latest AI news and summarize it"`,
    targetSelector: 'textarea[placeholder*="message"]',
    tooltipPosition: 'top',
  },
  {
    id: 'swag',
    type: 'spotlight',
    title: '💎 SWAG: Your Knowledge Base',
    content: `Save and organize important information:
• Capture chat responses as snippets
• Upload documents for quick reference
• Tag and search your content
• Generate embeddings for semantic search

All stored locally in your browser for privacy!`,
    targetSelector: 'button[title*="Swag" i]',
    tooltipPosition: 'bottom',
  },
  {
    id: 'settings',
    type: 'spotlight',
    title: '⚙️ Settings & AI Providers',
    content: `Customize your experience:
• Add your own API keys for $0 cost
• Enable/disable tools (search, transcription, etc.)
• Configure RAG (semantic search) settings
• Manage display preferences

Start with free providers, add your keys later!`,
    targetSelector: 'button[aria-label*="Settings" i]',
    tooltipPosition: 'bottom',
  },
  {
    id: 'billing',
    type: 'spotlight',
    title: '💰 Billing & Usage Tracking',
    content: `Transparent cost management:
• $0.50 welcome bonus for new users
• Real-time usage tracking per request
• Detailed cost breakdown by provider
• No hidden fees - pay only for what you use

View your balance anytime in the Billing page.`,
    targetSelector: 'button[title*="Billing" i]',
    tooltipPosition: 'bottom',
  },
  {
    id: 'planning',
    type: 'spotlight',
    title: '📋 Planning & Todos',
    content: `Break complex tasks into structured plans:
• Multi-step research workflows
• Auto-generated action items
• Persistent todo tracking
• Transfer between planning and chat

Perfect for research projects and learning paths!`,
    targetSelector: 'button[title*="Planning" i]',
    tooltipPosition: 'bottom',
  },
  {
    id: 'complete',
    type: 'modal',
    title: '🎉 You\'re All Set!',
    content: `You now know the essentials. Here are some quick tips:

💡 Quick Actions:
• Press "/" to see example prompts
• Use voice input for hands-free interaction
• Save important responses to SWAG
• Enable Planning for complex research

Need help? Visit the Help page anytime!`,
  },
];

export const WelcomeWizard: React.FC<WelcomeWizardProps> = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlightPosition, setSpotlightPosition] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const step = TOUR_STEPS[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === TOUR_STEPS.length - 1;

  // Calculate spotlight position
  useEffect(() => {
    if (!isOpen || step.type !== 'spotlight' || !step.targetSelector) {
      setSpotlightPosition(null);
      return;
    }

    const updatePosition = () => {
      const target = document.querySelector(step.targetSelector!);
      if (target) {
        const rect = target.getBoundingClientRect();
        setSpotlightPosition(rect);
      } else {
        console.warn(`Spotlight target not found: ${step.targetSelector}`);
        setSpotlightPosition(null);
      }
    };

    // Wait a bit for UI to render
    const timeout = setTimeout(updatePosition, 100);

    // Update on window resize
    window.addEventListener('resize', updatePosition);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, step, currentStep]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleSkip();
      } else if (e.key === 'ArrowRight' && !isLastStep) {
        handleNext();
      } else if (e.key === 'ArrowLeft' && !isFirstStep) {
        handleBack();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isOpen, currentStep]);

  const handleNext = () => {
    if (isLastStep) {
      handleComplete();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (!isFirstStep) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSkip = () => {
    markWelcomeWizardComplete();
    onClose();
  };

  const handleComplete = () => {
    markWelcomeWizardComplete();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black transition-opacity duration-300"
        style={{ opacity: step.type === 'modal' ? 0.75 : 0.6 }}
        onClick={handleSkip}
      >
        {/* Spotlight cutout */}
        {step.type === 'spotlight' && spotlightPosition && (
          <div
            className="absolute pointer-events-none transition-all duration-500 ease-out"
            style={{
              top: spotlightPosition.top - 8,
              left: spotlightPosition.left - 8,
              width: spotlightPosition.width + 16,
              height: spotlightPosition.height + 16,
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
              borderRadius: '12px',
              animation: 'pulse-spotlight 2s ease-in-out infinite',
            }}
          />
        )}
      </div>

      {/* Modal Content */}
      {step.type === 'modal' && (
        <div className="absolute inset-0 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full p-8 transform transition-all duration-300 scale-100">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              {step.title}
            </h2>
            <div className="text-gray-700 dark:text-gray-300 whitespace-pre-line mb-8 text-lg leading-relaxed">
              {step.content}
            </div>

            {/* Progress dots */}
            <div className="flex justify-center gap-2 mb-6">
              {TOUR_STEPS.map((_, index) => (
                <div
                  key={index}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    index === currentStep
                      ? 'w-8 bg-blue-600 dark:bg-blue-400'
                      : index < currentStep
                      ? 'w-2 bg-green-500 dark:bg-green-400'
                      : 'w-2 bg-gray-300 dark:bg-gray-600'
                  }`}
                />
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex justify-between items-center gap-4">
              <button
                onClick={handleSkip}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors text-sm font-medium"
              >
                Skip Tour
              </button>
              <div className="flex gap-3">
                {!isFirstStep && (
                  <button
                    onClick={handleBack}
                    className="px-5 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
                  >
                    Back
                  </button>
                )}
                <button
                  onClick={handleNext}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium shadow-lg shadow-blue-500/30"
                >
                  {isFirstStep ? 'Start Tour' : isLastStep ? 'Start Using Research Agent' : 'Next'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tooltip for spotlight steps */}
      {step.type === 'spotlight' && spotlightPosition && (
        <div
          ref={tooltipRef}
          className="absolute bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-md transform transition-all duration-300"
          style={{
            ...getTooltipPosition(spotlightPosition, step.tooltipPosition || 'top'),
            zIndex: 10000,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Arrow */}
          <div
            className="absolute w-4 h-4 bg-white dark:bg-gray-800 transform rotate-45"
            style={getArrowPosition(step.tooltipPosition || 'top')}
          />

          <div className="relative z-10">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
              {step.title}
            </h3>
            <div className="text-gray-700 dark:text-gray-300 whitespace-pre-line mb-6 leading-relaxed">
              {step.content}
            </div>

            {/* Progress indicator */}
            <div className="flex justify-center gap-2 mb-4">
              {TOUR_STEPS.map((_, index) => (
                <div
                  key={index}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    index === currentStep
                      ? 'w-6 bg-blue-600 dark:bg-blue-400'
                      : index < currentStep
                      ? 'w-1.5 bg-green-500 dark:bg-green-400'
                      : 'w-1.5 bg-gray-300 dark:bg-gray-600'
                  }`}
                />
              ))}
            </div>

            {/* Navigation buttons */}
            <div className="flex justify-between items-center gap-4">
              <button
                onClick={handleSkip}
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors font-medium"
              >
                Skip
              </button>
              <div className="flex gap-3">
                <button
                  onClick={handleBack}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium text-sm"
                  disabled={isFirstStep}
                >
                  Back
                </button>
                <button
                  onClick={handleNext}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium text-sm shadow-lg shadow-blue-500/30"
                >
                  {isLastStep ? 'Complete' : 'Next'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tooltip for steps without target */}
      {step.type === 'spotlight' && !spotlightPosition && (
        <div className="absolute inset-0 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-md">
            <div className="text-center mb-4">
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                Target element not found. It may not be visible yet.
              </p>
            </div>
            <div className="flex justify-center gap-3">
              <button
                onClick={handleBack}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium text-sm"
              >
                Back
              </button>
              <button
                onClick={handleNext}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium text-sm"
              >
                Skip & Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS for spotlight pulse animation */}
      <style>{`
        @keyframes pulse-spotlight {
          0%, 100% {
            box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.6);
          }
          50% {
            box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.7);
          }
        }
      `}</style>
    </div>
  );
};

// Helper functions for tooltip positioning
function getTooltipPosition(targetRect: DOMRect, position: string): React.CSSProperties {
  const padding = 20;

  switch (position) {
    case 'top':
      return {
        left: targetRect.left + targetRect.width / 2,
        top: targetRect.top - padding,
        transform: 'translate(-50%, -100%)',
      };
    case 'bottom':
      return {
        left: targetRect.left + targetRect.width / 2,
        top: targetRect.bottom + padding,
        transform: 'translate(-50%, 0)',
      };
    case 'left':
      return {
        left: targetRect.left - padding,
        top: targetRect.top + targetRect.height / 2,
        transform: 'translate(-100%, -50%)',
      };
    case 'right':
      return {
        left: targetRect.right + padding,
        top: targetRect.top + targetRect.height / 2,
        transform: 'translate(0, -50%)',
      };
    default:
      return {};
  }
}

function getArrowPosition(position: string): React.CSSProperties {
  switch (position) {
    case 'top':
      return { bottom: '-8px', left: '50%', transform: 'translateX(-50%) rotate(45deg)' };
    case 'bottom':
      return { top: '-8px', left: '50%', transform: 'translateX(-50%) rotate(45deg)' };
    case 'left':
      return { right: '-8px', top: '50%', transform: 'translateY(-50%) rotate(45deg)' };
    case 'right':
      return { left: '-8px', top: '50%', transform: 'translateY(-50%) rotate(45deg)' };
    default:
      return {};
  }
}
