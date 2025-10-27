# Welcome Wizard - First-Time User Onboarding Plan

## Overview

Create an interactive, cancellable welcome wizard that appears **only once** on a user's first login to highlight key features and guide them through the application's core capabilities.

**Key Requirements**:
- ✅ Shows **only once** per user (first login only)
- ✅ **Cancellable** at any step
- ✅ Highlights key features and components
- ✅ Non-intrusive, modern design
- ✅ Mobile-responsive
- ✅ Dark mode compatible
- ✅ Skippable with "Skip Tour" option

---

## Current Authentication & State Management

### User Authentication Flow

**File**: `ui-new/src/contexts/AuthContext.tsx`

**Current Flow**:
1. User logs in with Google OAuth → `login(credential)` called
2. JWT decoded to extract user info (`email`, `name`, `picture`, `sub`)
3. Auth state saved to localStorage:
   - `google_user` - User object
   - `google_access_token` - JWT token
   - `google_token_expiration` - Expiry timestamp
4. `isAuthenticated` set to `true`
5. `App.tsx` detects authentication → Shows main UI

**First Login Detection**:
- Currently **no tracking** of whether user has logged in before
- Need to add localStorage flag: `has_completed_welcome_wizard`

---

## Wizard Architecture

### Design Philosophy

**Inspiration**: Modern product tours (Linear, Notion, Vercel)
- **Progressive disclosure**: Show features one at a time
- **Interactive**: Click to highlight actual UI elements
- **Contextual**: Explain features in place, not in abstract
- **Lightweight**: 5-7 steps max, ~2 minutes to complete
- **Value-focused**: Emphasize what user can do, not how

### Wizard Type: **Spotlight Tour**

**Why?** 
- More engaging than modal-only tours
- Users see actual UI elements being highlighted
- Better retention than video or text-heavy intros
- Can be skipped but encourages exploration

**Alternative Considered**:
- ❌ Multi-page wizard (too slow, disconnected from UI)
- ❌ Video tutorial (passive, not interactive)
- ✅ Spotlight tour with tooltips (interactive, fast, contextual)

---

## Feature Highlights (Tour Steps)

### Step 1: Welcome & Overview
**Type**: Modal overlay (no spotlight)

**Content**:
```
👋 Welcome to Research Agent!

Your AI-powered research assistant with:
• 🌐 Real-time web search
• 📊 Advanced planning tools
• 💾 Knowledge management (Swag)
• 🎙️ Voice & transcription
• 📈 Cost tracking & billing

Ready to explore? Let's take a quick tour! (2 minutes)

[Skip Tour]  [Start Tour]
```

**UI**:
- Centered modal with gradient background
- Large friendly emoji/icon
- Clear value propositions
- Two prominent buttons
- Semi-transparent backdrop

---

### Step 2: Chat Interface
**Spotlight**: Chat input textarea at bottom

**Tooltip Position**: Above input

**Content**:
```
💬 Start Here: Chat Interface

This is your main workspace. Ask questions, request research,
or use tools like web search, transcription, and more.

Try: "Search for the latest AI news and summarize it"

[Back]  [Next]
```

**Highlight**:
- Pulse animation on chat input box
- Arrow pointing from tooltip to input
- Dim rest of UI (spotlight effect)

---

### Step 3: Planning & Todos
**Spotlight**: "Create a Plan" button (if visible in chat)

**Tooltip Position**: Below button

**Content**:
```
📋 Planning Wizard & Todos

Break complex tasks into structured plans with:
• Multi-step research workflows
• Auto-generated action items
• Persistent todo tracking
• Transfer between planning and chat

Perfect for: Research projects, learning paths, multi-step tasks

[Back]  [Next]
```

**Note**: If Planning button not visible initially, skip this step or show after first message

---

### Step 4: Swag (Knowledge Base)
**Spotlight**: Swag button in header

**Tooltip Position**: Below button

**Content**:
```
💎 Swag: Your Knowledge Base

Save and organize important information:
• Capture chat responses as snippets
• Upload documents for quick reference
• Tag and search your content
• Generate embeddings for semantic search

All stored locally in your browser for privacy!

[Back]  [Next]
```

**Highlight**:
- Point to Swag button in header
- Show count badge if snippets exist: "0 snippets"

---

### Step 5: Settings & Providers
**Spotlight**: Settings button (gear icon)

**Tooltip Position**: Below button

**Content**:
```
⚙️ Settings & AI Providers

Customize your experience:
• Add your own API keys for $0 cost
• Enable/disable tools (search, transcription, etc.)
• Configure RAG (semantic search) settings
• Manage display preferences

Start with free providers, add your keys later!

[Back]  [Next]
```

---

### Step 6: Billing & Credits
**Spotlight**: Billing button or credit display

**Tooltip Position**: Below button

**Content**:
```
💰 Billing & Usage Tracking

Transparent cost management:
• $0.50 welcome bonus for new users
• Real-time usage tracking per request
• Detailed cost breakdown by provider
• No hidden fees - pay only for what you use

View your balance anytime in the Billing page.

[Back]  [Next]
```

---

### Step 7: You're Ready!
**Type**: Modal overlay (no spotlight)

**Content**:
```
🎉 You're All Set!

You now know the essentials. Here are some quick tips:

💡 Quick Actions:
• Press "/" to see example prompts
• Use voice input for hands-free interaction
• Save important responses to Swag
• Enable Planning for complex research

Need help? Visit the Help page anytime!

[Start Using Research Agent]
```

**UI**:
- Celebratory design with confetti animation (optional)
- List of quick tips
- Single prominent CTA button
- Option to "Show me examples" → Opens ExamplesModal

---

## Implementation Plan

### Phase 1: State Management & Tracking (15 minutes)

#### 1.1 Add Welcome Wizard State Tracking

**File**: `ui-new/src/utils/auth.ts` (extend existing auth utilities)

**Add new functions**:
```typescript
// Check if user has completed welcome wizard
export const hasCompletedWelcomeWizard = (): boolean => {
  const completed = localStorage.getItem('has_completed_welcome_wizard');
  return completed === 'true';
};

// Mark welcome wizard as completed
export const markWelcomeWizardCompleted = (): void => {
  localStorage.setItem('has_completed_welcome_wizard', 'true');
  localStorage.setItem('welcome_wizard_completed_at', new Date().toISOString());
};

// Reset wizard (for testing or re-onboarding)
export const resetWelcomeWizard = (): void => {
  localStorage.removeItem('has_completed_welcome_wizard');
  localStorage.removeItem('welcome_wizard_completed_at');
};

// Check if this is user's first login ever
export const isFirstLogin = (user: GoogleUser): boolean => {
  // Check if we have a record of this user email
  const userHistory = localStorage.getItem('user_login_history');
  if (!userHistory) {
    return true;
  }
  
  try {
    const history: string[] = JSON.parse(userHistory);
    return !history.includes(user.email);
  } catch {
    return true;
  }
};

// Record user login
export const recordUserLogin = (user: GoogleUser): void => {
  const userHistory = localStorage.getItem('user_login_history');
  let history: string[] = [];
  
  if (userHistory) {
    try {
      history = JSON.parse(userHistory);
    } catch {
      history = [];
    }
  }
  
  if (!history.includes(user.email)) {
    history.push(user.email);
    localStorage.setItem('user_login_history', JSON.stringify(history));
  }
};
```

**Why localStorage?**
- Simple, no backend changes needed
- User-specific (tied to browser/device)
- Persists across sessions
- Can be reset for testing

**Edge Cases**:
- User clears localStorage → Wizard shows again (acceptable)
- User switches browsers → Wizard shows again (acceptable)
- User uses incognito → Wizard shows every time (acceptable, unavoidable)

---

#### 1.2 Integrate with AuthContext

**File**: `ui-new/src/contexts/AuthContext.tsx`

**Modify `login()` function** (~line 39):

```typescript
const login = useCallback((credential: string) => {
  try {
    const decoded = decodeJWT(credential);
    if (!decoded || !decoded.email) {
      console.error('Login failed: Invalid token or missing user info');
      return;
    }
    
    const user: GoogleUser = {
      email: decoded.email,
      name: decoded.name,
      picture: decoded.picture,
      sub: decoded.sub
    };
    
    saveAuthState(user, credential);
    
    // Track user login for first-time detection
    recordUserLogin(user);
    
    setAuthState({
      user,
      accessToken: credential,
      isAuthenticated: true
    });
    
    console.log('User logged in:', user.email);
  } catch (error) {
    console.error('Login failed:', error);
  }
}, []);
```

**Why here?**
- Centralized login logic
- Executes on both new and returning user logins
- Already has user object available

---

### Phase 2: Welcome Wizard Component (45 minutes)

#### 2.1 Create WelcomeWizard Component

**File**: `ui-new/src/components/WelcomeWizard.tsx` (NEW)

```typescript
import React, { useState, useEffect, useRef } from 'react';
import { hasCompletedWelcomeWizard, markWelcomeWizardCompleted } from '../utils/auth';

interface WelcomeWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

interface TourStep {
  id: string;
  type: 'modal' | 'spotlight';
  title: string;
  content: string;
  targetSelector?: string; // CSS selector for spotlight target
  tooltipPosition?: 'top' | 'bottom' | 'left' | 'right';
  action?: {
    label: string;
    onClick: () => void;
  };
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    type: 'modal',
    title: '👋 Welcome to Research Agent!',
    content: `Your AI-powered research assistant with:
• 🌐 Real-time web search
• 📊 Advanced planning tools
• 💾 Knowledge management (Swag)
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
    targetSelector: 'textarea[placeholder*="message"]', // Chat input
    tooltipPosition: 'top',
  },
  {
    id: 'swag',
    type: 'spotlight',
    title: '💎 Swag: Your Knowledge Base',
    content: `Save and organize important information:
• Capture chat responses as snippets
• Upload documents for quick reference
• Tag and search your content
• Generate embeddings for semantic search

All stored locally in your browser for privacy!`,
    targetSelector: 'button[title*="Swag"]',
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
    targetSelector: 'button[aria-label="Settings"]',
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
    targetSelector: 'button[title*="billing"]',
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
• Save important responses to Swag
• Enable Planning for complex research

Need help? Visit the Help page anytime!`,
  },
];

export const WelcomeWizard: React.FC<WelcomeWizardProps> = ({ isOpen, onClose, onComplete }) => {
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
        // Skip to next step if target not found
        handleNext();
      }
    };

    // Initial position
    updatePosition();

    // Update on window resize
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
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
  }, [isOpen, currentStep, isFirstStep, isLastStep]);

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
    markWelcomeWizardCompleted();
    onClose();
  };

  const handleComplete = () => {
    markWelcomeWizardCompleted();
    onComplete();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* Backdrop with spotlight cutout */}
      <div className="absolute inset-0 bg-black transition-opacity duration-300"
        style={{
          opacity: step.type === 'modal' ? 0.75 : 0.6,
        }}
      >
        {/* Spotlight cutout using box-shadow */}
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
        <div className="absolute inset-0 flex items-center justify-center p-4">
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
                >
                  Back
                </button>
                <button
                  onClick={handleNext}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium text-sm shadow-lg shadow-blue-500/30"
                >
                  Next
                </button>
              </div>
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
```

**Features**:
- ✅ Modal and spotlight tour steps
- ✅ Smooth transitions between steps
- ✅ Keyboard navigation (Esc to skip, arrows to navigate)
- ✅ Progress indicators (dots)
- ✅ Responsive tooltip positioning
- ✅ Dark mode support
- ✅ Animated spotlight with pulse effect
- ✅ Skip at any time
- ✅ Auto-skip if target element not found

---

### Phase 3: Integration with App (20 minutes)

#### 3.1 Add WelcomeWizard to App.tsx

**File**: `ui-new/src/App.tsx`

**Import WelcomeWizard** (add to imports, ~line 18):
```typescript
import { WelcomeWizard } from './components/WelcomeWizard';
import { hasCompletedWelcomeWizard, isFirstLogin } from './utils/auth';
```

**Add state for wizard** (in AppContent function, ~line 40):
```typescript
const [showWelcomeWizard, setShowWelcomeWizard] = useState(false);
```

**Check for first-time login** (after authentication check, ~line 215):
```typescript
// Check if user should see welcome wizard
useEffect(() => {
  if (!isAuthenticated || !user) {
    return;
  }

  // Only show wizard if:
  // 1. User is authenticated
  // 2. User hasn't completed wizard before
  // 3. Auth check is complete (to avoid flashing)
  if (hasCheckedAuth && !hasCompletedWelcomeWizard()) {
    // Small delay to let UI render before showing wizard
    const timer = setTimeout(() => {
      setShowWelcomeWizard(true);
    }, 500);
    return () => clearTimeout(timer);
  }
}, [isAuthenticated, user, hasCheckedAuth]);
```

**Render WelcomeWizard** (after SettingsModal, before Navigation Warning Dialog, ~line 615):
```typescript
{/* Welcome Wizard - First time users only */}
<WelcomeWizard
  isOpen={showWelcomeWizard}
  onClose={() => setShowWelcomeWizard(false)}
  onComplete={() => {
    setShowWelcomeWizard(false);
    // Optional: Show examples modal after wizard
    // setShowExamplesModal(true);
  }}
/>
```

**Why after authentication check?**
- Ensures user is fully logged in before showing wizard
- UI is already rendered so spotlight targets exist
- Avoids showing wizard on every page load (only after auth)

---

### Phase 4: Testing & Polish (15 minutes)

#### 4.1 Manual Testing Checklist

- [ ] **First login**: Clear localStorage, login → wizard appears
- [ ] **Skip tour**: Click "Skip Tour" → wizard closes, flag set
- [ ] **Keyboard navigation**: 
  - [ ] Escape key closes wizard
  - [ ] Arrow right/left navigate steps
- [ ] **Complete tour**: Go through all steps → wizard completes
- [ ] **Second login**: Logout, login again → wizard does NOT appear
- [ ] **Spotlight positioning**: 
  - [ ] Chat input highlights correctly
  - [ ] Swag button highlights correctly
  - [ ] Settings button highlights correctly
  - [ ] Billing button highlights correctly
- [ ] **Tooltip placement**: 
  - [ ] Tooltips don't overflow screen
  - [ ] Arrows point to correct targets
- [ ] **Dark mode**: Toggle dark mode → wizard styles adapt
- [ ] **Mobile**: 
  - [ ] Wizard is responsive on small screens
  - [ ] Touch targets are large enough
  - [ ] Text is readable
- [ ] **Missing targets**: If element not found (e.g., Planning button not visible) → skips to next step

#### 4.2 Edge Cases

**Target element not found**:
```typescript
// In useEffect for spotlight positioning
const target = document.querySelector(step.targetSelector!);
if (!target) {
  console.warn(`Spotlight target not found: ${step.targetSelector}`);
  // Auto-skip to next step
  setTimeout(() => handleNext(), 500);
  return;
}
```

**User navigates away during wizard**:
```typescript
// In App.tsx, watch for route changes
useEffect(() => {
  // Close wizard if user navigates away
  if (location.pathname !== '/' && showWelcomeWizard) {
    setShowWelcomeWizard(false);
  }
}, [location.pathname]);
```

**Window resize during spotlight**:
```typescript
// Already handled in WelcomeWizard component
window.addEventListener('resize', updatePosition);
```

---

## Advanced Features (Optional, Future Enhancements)

### 1. Interactive Demo Mode

Allow user to actually **use** features during tour:

```typescript
{
  id: 'chat-demo',
  type: 'interactive',
  title: '💬 Try It: Send a Message',
  content: 'Type a question and press Enter to see the AI respond.',
  targetSelector: 'textarea[placeholder*="message"]',
  action: {
    label: 'Skip Demo',
    validation: () => messages.length > 0, // Wait for user to send message
  }
}
```

**Implementation**:
- Wait for user to perform action (e.g., send message, click button)
- Show "Next" button only after action complete
- Timeout after 30s if no action

---

### 2. Contextual Hints (Post-Wizard)

After wizard completes, show subtle hints on first use:

```typescript
// Show tooltip on first Planning button click
if (isFirstPlanningClick && !localStorage.getItem('planning_tooltip_shown')) {
  showTooltip('💡 Tip: Planning is great for multi-step research tasks!');
  localStorage.setItem('planning_tooltip_shown', 'true');
}
```

**Triggers**:
- First time opening Settings
- First time using Swag
- First time opening Billing
- First time using Planning

---

### 3. Video Tour Alternative

For users who skip wizard, offer video option in Help page:

```typescript
<button onClick={() => setShowWelcomeWizard(true)}>
  📺 Replay Welcome Tour
</button>

<a href="/help#video-tour">
  🎥 Watch 2-Minute Video Tour
</a>
```

---

### 4. Analytics (Optional)

Track wizard completion for insights:

```typescript
// On wizard complete
const analytics = {
  completed: true,
  steps_viewed: currentStep + 1,
  time_spent_seconds: Math.floor((Date.now() - wizardStartTime) / 1000),
  skipped_at_step: null,
};

// Send to analytics endpoint (if exists)
fetch('/api/analytics/wizard', {
  method: 'POST',
  body: JSON.stringify(analytics),
});
```

---

## Rollback Plan

If wizard causes issues:

### Quick Disable

**Option 1: Feature flag**
```typescript
const ENABLE_WELCOME_WIZARD = false; // Set to false to disable

if (ENABLE_WELCOME_WIZARD && hasCheckedAuth && !hasCompletedWelcomeWizard()) {
  setShowWelcomeWizard(true);
}
```

**Option 2: Emergency localStorage flag**
```typescript
// Users can disable via browser console:
localStorage.setItem('disable_welcome_wizard', 'true');

// Check in code:
if (localStorage.getItem('disable_welcome_wizard') === 'true') {
  return null; // Don't show wizard
}
```

### Full Removal

1. Remove `<WelcomeWizard>` from `App.tsx`
2. Remove import statements
3. Delete `ui-new/src/components/WelcomeWizard.tsx`
4. Remove auth utility functions (optional)

---

## Summary

**Implementation Timeline**:
- Phase 1: State Management (15 min)
- Phase 2: WelcomeWizard Component (45 min)
- Phase 3: App Integration (20 min)
- Phase 4: Testing & Polish (15 min)
- **Total**: ~95 minutes (~1.5 hours)

**Key Benefits**:
- ✅ Reduces time-to-value for new users
- ✅ Highlights key differentiating features
- ✅ Non-intrusive (shows once, fully skippable)
- ✅ Modern, engaging UX (spotlight tour)
- ✅ Dark mode compatible
- ✅ Mobile responsive
- ✅ Zero backend changes needed

**Deferred Features** (for later):
- Interactive demo mode
- Contextual post-wizard hints
- Video tour alternative
- Analytics tracking

**Next Steps**:
1. Review plan and approve approach
2. Implement Phase 1-3
3. Test thoroughly (Phase 4)
4. Deploy and monitor user feedback
5. Iterate based on completion rates
