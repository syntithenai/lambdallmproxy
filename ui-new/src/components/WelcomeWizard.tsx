import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
  navigateTo?: string; // Page to navigate to for this step
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    type: 'modal',
    title: '👋 Welcome!',
    content: `Your AI research assistant is ready!

Let's explore the key features in under 2 minutes.`,
    navigateTo: '/',
  },
  {
    id: 'chat',
    type: 'spotlight',
    title: '💬 Chat Interface',
    content: `Ask questions, get research, use web search & transcription.`,
    targetSelector: 'textarea[placeholder*="message"]',
    tooltipPosition: 'top',
    navigateTo: '/',
  },
  {
    id: 'voice',
    type: 'spotlight',
    title: '🎙️ Voice Input',
    content: `Speak your questions hands-free!`,
    targetSelector: 'button[aria-label*="voice" i], button[title*="voice" i]',
    tooltipPosition: 'left',
    navigateTo: '/',
  },
  {
    id: 'swag',
    type: 'spotlight',
    title: '💎 SWAG Storage',
    content: `Save & organize important info. Tag, search, and embed content locally!`,
    targetSelector: 'button[title*="Swag" i]',
    tooltipPosition: 'left',
    navigateTo: '/',
  },
  {
    id: 'nav-billing',
    type: 'spotlight',
    title: '💰 Navigate to Billing',
    content: `Click this button to view billing & usage.`,
    targetSelector: 'button[aria-label*="Billing" i], a[href="/billing"]',
    tooltipPosition: 'right',
    navigateTo: '/',
  },
  {
    id: 'billing',
    type: 'spotlight',
    title: '💰 Billing & Usage',
    content: `Track costs & usage. $0.50 welcome bonus included!`,
    targetSelector: '.billing-page, .billing-header, .billing-title h1, .transactions-table, .summary-cards',
    tooltipPosition: 'bottom',
    navigateTo: '/billing',
  },
  {
    id: 'feed',
    type: 'spotlight',
    title: '📰 Content Feed',
    content: `Discover curated articles, tutorials & insights. Filter by your saved Swag tags.`,
    targetSelector: '.bg-white.border-b.border-gray-200.sticky h1, .text-2xl.font-bold.text-gray-900',
    tooltipPosition: 'bottom',
    navigateTo: '/feed',
  },
  {
    id: 'quiz',
    type: 'spotlight',
    title: '🧠 Quiz Mode',
    content: `Test your knowledge with AI-generated quizzes. Generate from Feed articles or selected SWAG content.`,
    targetSelector: '[data-testid="quiz-page-title"], .quiz-page-header, h1.text-3xl.font-bold',
    tooltipPosition: 'bottom',
    navigateTo: '/quiz',
  },
  {
    id: 'image-editor',
    type: 'spotlight',
    title: '🎨 Image Editor',
    content: `Create & edit images with AI assistance. Generate, modify, and save images.`,
    targetSelector: 'h1.text-xl.font-bold.text-gray-900',
    tooltipPosition: 'bottom',
    navigateTo: '/image-editor',
  },
  {
    id: 'settings',
    type: 'spotlight',
    title: '⚙️ Settings',
    content: `Customize tools, themes & preferences.`,
    targetSelector: 'h1.text-3xl.font-bold.text-gray-900, h1.dark\\:text-gray-100',
    tooltipPosition: 'bottom',
    navigateTo: '/settings',
  },
  {
    id: 'complete',
    type: 'modal',
    title: '🎉 All Set!',
    content: `You're ready to go!

Enjoy your AI assistant!`,
    navigateTo: '/',
  },
];

export const WelcomeWizard: React.FC<WelcomeWizardProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlightPosition, setSpotlightPosition] = useState<DOMRect | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const step = TOUR_STEPS[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === TOUR_STEPS.length - 1;

  // Navigate when step changes
  useEffect(() => {
    if (!isOpen) return;
    if (step.navigateTo) {
      navigate(step.navigateTo);
      
      // Scroll to top for nav-billing step
      if (step.id === 'nav-billing') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [isOpen, currentStep, step.navigateTo, navigate, step.id]);

  // Calculate spotlight position with retry logic
  useEffect(() => {
    if (!isOpen || step.type !== 'spotlight' || !step.targetSelector) {
      setSpotlightPosition(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setSpotlightPosition(null);
    let attemptCount = 0;
    const maxAttempts = 10; // Try for 3 seconds total

    const updatePosition = () => {
      const target = document.querySelector(step.targetSelector!);
      if (target) {
        const rect = target.getBoundingClientRect();
        setSpotlightPosition(rect);
        setIsSearching(false);
        return true;
      }
      return false;
    };

    // Try immediately
    if (updatePosition()) {
      return;
    }

    // Retry with increasing delays if element not found
    const retryInterval = setInterval(() => {
      attemptCount++;
      if (updatePosition() || attemptCount >= maxAttempts) {
        clearInterval(retryInterval);
        if (attemptCount >= maxAttempts) {
          // eslint-disable-next-line no-console
          console.warn(`Spotlight target not found after ${maxAttempts} attempts: ${step.targetSelector}`);
          setIsSearching(false);
          
          // Auto-advance for content pages that fail to load
          // Give user 2 seconds to see the fallback UI before auto-skipping
          const autoAdvanceSteps = ['feed', 'billing', 'quiz', 'image-editor', 'settings'];
          if (autoAdvanceSteps.includes(step.id)) {
            setTimeout(() => {
              handleNext();
            }, 2000);
          }
        }
      }
    }, 300);

    // Update on window resize
    const handleResize = () => {
      if (spotlightPosition) {
        updatePosition();
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      clearInterval(retryInterval);
      window.removeEventListener('resize', handleResize);
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
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 transform transition-all duration-300 scale-100 border-4 border-gray-900 dark:border-gray-100">
            <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-3 uppercase tracking-tight">
              {step.title}
            </h2>
            <div className="text-gray-700 dark:text-gray-300 whitespace-pre-line mb-5 text-base leading-snug">
              {step.content}
            </div>

            {/* Progress dots */}
            <div className="flex justify-center gap-2 mb-5">
              {TOUR_STEPS.map((_, index) => (
                <div
                  key={index}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    index === currentStep
                      ? 'w-8 bg-blue-600 dark:bg-blue-400'
                      : index < currentStep
                      ? 'w-2 bg-green-500 dark:bg-green-400'
                      : 'w-2 bg-gray-400 dark:bg-gray-600'
                  }`}
                />
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex justify-between items-center gap-4">
              <button
                onClick={handleSkip}
                className="px-3 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors text-xs font-bold uppercase"
              >
                Skip Tour
              </button>
              <div className="flex gap-2">
                {!isFirstStep && (
                  <button
                    onClick={handleBack}
                    className="px-4 py-2 bg-gray-300 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-600 transition-colors font-bold text-xs uppercase"
                  >
                    Back
                  </button>
                )}
                <button
                  onClick={handleNext}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-bold text-xs uppercase shadow-lg shadow-blue-500/30"
                >
                  {isFirstStep ? 'Start' : isLastStep ? 'Done' : 'Next'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comic-style tooltip for spotlight steps */}
      {step.type === 'spotlight' && spotlightPosition && (
        <div
          ref={tooltipRef}
          className="absolute transform transition-all duration-300"
          style={{
            ...getTooltipPosition(spotlightPosition, step.tooltipPosition || 'top'),
            zIndex: 10000,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Comic-style caption box */}
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border-4 border-gray-900 dark:border-gray-100 px-6 py-4 max-w-xs">
            {/* Tapered tail pointing to element */}
            <svg
              className="absolute"
              style={getTailPosition(step.tooltipPosition || 'top', spotlightPosition)}
              width="40"
              height="40"
              viewBox="0 0 40 40"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {getTailPath()}
            </svg>

            <div className="relative z-10">
              <h3 className="text-lg font-black text-gray-900 dark:text-white mb-2 uppercase tracking-tight">
                {step.title}
              </h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug mb-3">
                {step.content}
              </p>

              {/* Progress dots */}
              <div className="flex justify-center gap-1.5 mb-3">
                {TOUR_STEPS.map((_, index) => (
                  <div
                    key={index}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      index === currentStep
                        ? 'w-6 bg-blue-600 dark:bg-blue-400'
                        : index < currentStep
                        ? 'w-1.5 bg-green-500 dark:bg-green-400'
                        : 'w-1.5 bg-gray-400 dark:bg-gray-600'
                    }`}
                  />
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex justify-between items-center gap-2">
                <button
                  onClick={handleSkip}
                  className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors font-bold uppercase"
                >
                  Skip
                </button>
                <div className="flex gap-2">
                  {!isFirstStep && (
                    <button
                      onClick={handleBack}
                      className="px-3 py-1.5 bg-gray-300 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-600 transition-colors font-bold text-xs uppercase"
                    >
                      Back
                    </button>
                  )}
                  <button
                    onClick={handleNext}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-bold text-xs uppercase shadow-lg"
                  >
                    {isLastStep ? 'Done' : 'Next'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading indicator while searching for target */}
      {step.type === 'spotlight' && !spotlightPosition && isSearching && (
        <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-md border-4 border-gray-900 dark:border-gray-100">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
              <p className="text-gray-600 dark:text-gray-400 text-sm font-bold uppercase">
                Loading...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tooltip for steps without target (after search timeout) */}
      {step.type === 'spotlight' && !spotlightPosition && !isSearching && (
        <div className="absolute inset-0 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-md border-4 border-gray-900 dark:border-gray-100">
            <div className="text-center mb-4">
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 font-bold">
                ⚠️ Element not found
              </p>
              <p className="text-gray-500 dark:text-gray-500 text-xs">
                This feature may not be available on this page.
              </p>
            </div>
            <div className="flex justify-center gap-3">
              <button
                onClick={handleBack}
                className="px-4 py-2 bg-gray-300 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-600 transition-colors font-bold text-xs uppercase"
              >
                Back
              </button>
              <button
                onClick={handleNext}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-bold text-xs uppercase"
              >
                Skip
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

// Helper functions for tooltip positioning with comic-style tails
function getTooltipPosition(targetRect: DOMRect, position: string): React.CSSProperties {
  const padding = 50; // Increased padding for tail
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const tooltipMaxWidth = 320; // max-w-xs

  let style: React.CSSProperties = {};

  switch (position) {
    case 'top':
      style = {
        left: Math.min(Math.max(targetRect.left + targetRect.width / 2, tooltipMaxWidth / 2 + 16), viewportWidth - tooltipMaxWidth / 2 - 16),
        top: targetRect.top - padding,
        transform: 'translate(-50%, -100%)',
      };
      break;
    case 'bottom':
      style = {
        left: Math.min(Math.max(targetRect.left + targetRect.width / 2, tooltipMaxWidth / 2 + 16), viewportWidth - tooltipMaxWidth / 2 - 16),
        top: targetRect.bottom + padding,
        transform: 'translate(-50%, 0)',
      };
      break;
    case 'left':
      style = {
        left: targetRect.left - padding,
        top: Math.min(Math.max(targetRect.top + targetRect.height / 2, 120), viewportHeight - 120),
        transform: 'translate(-100%, -50%)',
      };
      break;
    case 'right':
      style = {
        left: targetRect.right + padding,
        top: Math.min(Math.max(targetRect.top + targetRect.height / 2, 120), viewportHeight - 120),
        transform: 'translate(0, -50%)',
      };
      break;
    default:
      style = {
        left: Math.min(Math.max(targetRect.left + targetRect.width / 2, tooltipMaxWidth / 2 + 16), viewportWidth - tooltipMaxWidth / 2 - 16),
        top: targetRect.top - padding,
        transform: 'translate(-50%, -100%)',
      };
  }

  return style;
}

// Position the tapered tail SVG to point accurately at the target element
function getTailPosition(position: string, targetRect: DOMRect): React.CSSProperties {
  const tooltipMaxWidth = 320;
  const viewportWidth = window.innerWidth;
  
  // Calculate where the tooltip will be positioned
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const tooltipLeft = Math.min(
    Math.max(targetCenterX, tooltipMaxWidth / 2 + 16),
    viewportWidth - tooltipMaxWidth / 2 - 16
  );
  
  // Calculate the offset of the target from the tooltip center
  const offsetFromCenter = targetCenterX - tooltipLeft;
  // Convert to percentage of tooltip width (clamped to stay within tooltip bounds)
  const percentOffset = Math.max(-40, Math.min(40, (offsetFromCenter / tooltipMaxWidth) * 100));
  
  switch (position) {
    case 'top':
      return { 
        bottom: '-36px', 
        left: `calc(50% + ${percentOffset}%)`, 
        transform: 'translateX(-50%)',
      };
    case 'bottom':
      return { 
        top: '-36px', 
        left: `calc(50% + ${percentOffset}%)`, 
        transform: 'translateX(-50%) rotate(180deg)',
      };
    case 'left':
      return { 
        right: '-36px', 
        top: '50%', 
        transform: 'translateY(-50%) rotate(-90deg)',
      };
    case 'right':
      return { 
        left: '-36px', 
        top: '50%', 
        transform: 'translateY(-50%) rotate(90deg)',
      };
    default:
      return { 
        bottom: '-36px', 
        left: `calc(50% + ${percentOffset}%)`, 
        transform: 'translateX(-50%)',
      };
  }
}

// Create tapered comic-style tail SVG path
function getTailPath(): React.ReactNode {
  // Tapered tail pointing downward (adjusts with rotation in getTailPosition)
  return (
    <>
      {/* Border (outer) */}
      <path
        d="M 10 2 Q 15 10, 20 2 L 20 30 Q 20 35, 15 38 L 15 38 Q 10 35, 10 30 Z"
        className="fill-gray-900 dark:fill-gray-100"
        strokeWidth="0"
      />
      {/* Fill (inner) */}
      <path
        d="M 12 4 Q 15 10, 18 4 L 18 29 Q 18 33, 15 35 L 15 35 Q 12 33, 12 29 Z"
        className="fill-white dark:fill-gray-800"
        strokeWidth="0"
      />
    </>
  );
}
