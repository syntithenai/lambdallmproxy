# Internationalization (i18n) Implementation - Complete Documentation

**Date**: October 26, 2025  
**Status**: Backend Complete, Frontend Foundation Ready  
**Languages Supported**: English (en), Spanish (es), French (fr), German (de), Chinese (zh), Japanese (ja), Arabic (ar)

## Overview

This document describes the complete internationalization implementation for the Lambda LLM Proxy project. The implementation consists of two main components:

1. **Backend Language Control**: LLM responses adapt to user's language preference
2. **Frontend UI Translation**: User interface translates to selected language

## 📋 What's Completed

### ✅ Backend Implementation (100% Complete)

#### 1. Language Instruction System (`src/utils/languageInstructions.js`)

```javascript
// Get language-specific instruction in native language
const instruction = getLanguageInstruction('es');
// Returns: "Siempre responde en español, usando un lenguaje natural y claro."
```

**Supported Languages**:
- English (en): "Always respond in English..."
- Spanish (es): "Siempre responde en español..."
- French (fr): "Réponds toujours en français..."
- German (de): "Antworte immer auf Deutsch..."
- Chinese (zh): "始终用中文回答..."
- Japanese (ja): "常に日本語で返信してください..."
- Arabic (ar): "أجب دائمًا باللغة العربية..."

#### 2. Chat Endpoint Integration (`src/endpoints/chat.js`)

**Request Body**:
```javascript
{
  "messages": [...],
  "providers": {...},
  "language": "es"  // User's preferred language
}
```

**Implementation Details**:
- Extracts `language` parameter from request body (defaults to 'en')
- Generates language instruction using `getLanguageInstruction()`
- Injects instruction into system prompts in 3 scenarios:
  1. Merging existing system messages
  2. Creating new system message with location context
  3. Creating default system message
- Only injects if language is not English (optimization)

**Example System Prompt Injection**:
```
You are a helpful AI assistant...

**LANGUAGE INSTRUCTION**: Siempre responde en español, usando un lenguaje natural y claro.
```

#### 3. Planning Endpoint Integration (`src/endpoints/planning.js`)

**Request Body**:
```javascript
{
  "query": "research AI safety",
  "providers": {...},
  "language": "fr"  // User's preferred language
}
```

**Implementation Details**:
- Added `language` parameter to `generatePlan()` function signature (8th parameter)
- Injects language instruction into enhanced system/user prompts for all query types:
  - **Simple queries**: Direct answers
  - **Overview queries**: Research with search strategies
  - **Long-form queries**: Document creation
  - **Clarification queries**: Follow-up questions
  - **Guidance queries**: Multi-step workflows
  - **Forced guidance**: Override to OVERVIEW mode

**Injection Points**:
- `enhancedSystemPrompt`: LLM's role and instructions
- `enhancedUserPrompt` (overview/long-form): User's formatted request

### ✅ Frontend API Integration (100% Complete)

#### 1. Chat Requests (`ui-new/src/components/ChatTab.tsx`)

**Regular Chat Request**:
```typescript
const requestPayload: any = {
  providers: enabledProviders,
  messages: cleanedMessages,
  temperature: 0.7,
  stream: true,
  optimization: settings.optimization || 'cheap',
  language: settings.language || 'en'  // ✅ Language parameter
};
```

**Continuation Request**:
```typescript
const requestPayload: any = {
  providers: enabledProviders,
  messages: continueContext.messages,
  temperature: 0.7,
  stream: true,
  isContinuation: true,
  optimization: settings.optimization || 'cheap',
  language: settings.language || 'en'  // ✅ Language parameter
};
```

#### 2. Planning Requests (`ui-new/src/utils/api.ts`)

**Function Signature Update**:
```typescript
export const generatePlan = async (
  query: string,
  token: string,
  providers: Array<{...}>,
  model: string | undefined,
  onEvent: (event: string, data: any) => void,
  onComplete?: () => void,
  onError?: (error: Error) => void,
  options?: {
    temperature?: number;
    maxTokens?: number;
    reasoningDepth?: number;
    clarificationAnswers?: string;
    previousContext?: any;
    signal?: AbortSignal;
    forcePlan?: boolean;
    language?: string;  // ✅ New parameter
  }
): Promise<void>
```

**Request Body Construction**:
```typescript
const requestBody: any = { 
  query,
  providers: providersMap
};

// Add language preference
if (options?.language) {
  requestBody.language = options.language;
}
```

#### 3. Planning Hook Integration (`ui-new/src/hooks/usePlanningGeneration.ts`)

**Hook Parameter**:
```typescript
interface UsePlanningGenerationProps {
  query: string;
  getToken: () => Promise<string | null>;
  enabledProviders: any[];
  onSuccess: (...) => void;
  onError: (error: string) => void;
  onClarificationNeeded?: (...) => void;
  clarificationAnswers?: string;
  previousContext?: any;
  language?: string;  // ✅ New parameter
}
```

**Passing to API**:
```typescript
await generatePlan(
  query,
  token,
  enabledProviders,
  undefined,
  (event, data) => {...},
  () => {...},
  (error) => {...},
  {
    clarificationAnswers,
    previousContext,
    signal: abortControllerRef.current.signal,
    language  // ✅ Passed to backend
  }
);
```

#### 4. Planning Dialog Integration (`ui-new/src/components/PlanningDialog.tsx`)

**Regular Planning Request**:
```typescript
await generatePlan(
  query,
  token,
  enabledProviders,
  undefined,
  (event, data) => {...},
  () => {...},
  (error) => {...},
  {
    language: settings.language || 'en'  // ✅ From settings
  }
);
```

**Force Plan Request**:
```typescript
await generatePlan(
  query,
  token,
  enabledProviders,
  undefined,
  (event, data) => {...},
  () => {...},
  (error) => {...},
  {
    clarificationAnswers: autoAnswers,
    previousContext: result,
    forcePlan: true,
    language: settings.language || 'en'  // ✅ From settings
  }
);
```

### ✅ Frontend i18n Infrastructure (100% Complete)

#### 1. Dependencies Installed
```json
{
  "i18next": "^23.x",
  "react-i18next": "^14.x",
  "i18next-browser-languagedetector": "^8.x"
}
```

#### 2. Configuration (`ui-new/src/i18n/config.ts`)

```typescript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import all language resources
import enTranslations from './locales/en.json';
import esTranslations from './locales/es.json';
// ... fr, de, zh, ja, ar

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslations },
      es: { translation: esTranslations },
      // ... other languages
    },
    fallbackLng: 'en',
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage']
    },
    interpolation: {
      escapeValue: false  // React handles escaping
    }
  });
```

#### 3. Language Detection & Persistence

**Detection Order**:
1. **localStorage** (`i18nextLng` key)
2. **Browser navigator** language

**Settings Integration** (`ui-new/src/contexts/SettingsContext.tsx`):
```typescript
const defaultSettings: Settings = {
  language: 'en',  // ISO 639-1 code
  // ... other settings
};
```

**Persistence**: Language choice stored in `localStorage` via `useLocalStorage` hook

#### 4. Settings Interface (`ui-new/src/types/provider.ts`)

```typescript
export interface Settings {
  language?: string;  // ISO 639-1 code: en, es, fr, de, zh, ja, ar
  // ... other fields
}
```

#### 5. Language Selector UI (`ui-new/src/components/SettingsModal.tsx`)

**General Tab**:
- New "General" tab in Settings modal
- Language dropdown with native language names:
  - "English"
  - "Español - Spanish"
  - "Français - French"
  - "Deutsch - German"
  - "中文 - Chinese"
  - "日本語 - Japanese"
  - "العربية - Arabic"

**Language Change Handler**:
```typescript
const handleLanguageChange = (lang: string) => {
  i18n.changeLanguage(lang);
  setSettings({ ...settings, language: lang });
};
```

#### 6. RTL Support (`ui-new/src/App.tsx`)

```typescript
// Sync language changes with i18n
useEffect(() => {
  if (settings.language && i18n.language !== settings.language) {
    i18n.changeLanguage(settings.language);
  }
}, [settings.language, i18n]);

// Set document direction for RTL languages
useEffect(() => {
  const rtlLanguages = ['ar', 'he', 'fa'];
  if (rtlLanguages.includes(i18n.language)) {
    document.documentElement.dir = 'rtl';
  } else {
    document.documentElement.dir = 'ltr';
  }
  document.documentElement.lang = i18n.language;
}, [i18n.language]);
```

**RTL Languages Supported**:
- Arabic (ar)
- Hebrew (he)
- Persian/Farsi (fa)

#### 7. Locale Formatters (`ui-new/src/utils/formatters.ts`)

```typescript
// Date formatting
export function formatDate(date: Date, locale: string = 'en'): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

// Number formatting
export function formatNumber(
  num: number,
  locale: string = 'en',
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(locale, options).format(num);
}

// Currency formatting
export function formatCurrency(
  amount: number,
  locale: string = 'en',
  currency: string = 'USD'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency
  }).format(amount);
}

// Relative time formatting
export function formatRelativeTime(
  date: Date,
  locale: string = 'en'
): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (diffDays > 0) return rtf.format(-diffDays, 'day');
  if (diffHours > 0) return rtf.format(-diffHours, 'hour');
  if (diffMins > 0) return rtf.format(-diffMins, 'minute');
  return rtf.format(-diffSecs, 'second');
}

// File size formatting
export function formatFileSize(bytes: number, locale: string = 'en'): string

// Percentage formatting
export function formatPercentage(value: number, locale: string = 'en'): string
```

**Usage**:
```typescript
import { formatDate, formatCurrency, formatRelativeTime } from '../utils/formatters';

// In component
const { i18n } = useTranslation();
const formattedDate = formatDate(new Date(), i18n.language);
const formattedPrice = formatCurrency(29.99, i18n.language, 'USD');
const timeAgo = formatRelativeTime(message.timestamp, i18n.language);
```

#### 8. Translation Files

**English Base** (`ui-new/src/i18n/locales/en.json`):
- 150+ translation keys
- 11 categories: common, auth, chat, planning, settings, languages, billing, errors, swag, tts, playlist, tools
- Complete coverage of core UI elements

**Other Languages** (`es.json`, `fr.json`, `de.json`, `zh.json`, `ja.json`, `ar.json`):
- Partial translations (~40% coverage)
- Core UI elements translated
- Needs expansion for full coverage

### ✅ Git Commits

1. **bc13dcd**: "chore: commit pre-i18n changes"
2. **3885908**: "deploy: UI deployment to GitHub Pages"
3. **290eab2**: "feat(i18n): add internationalization foundation"
4. **92a5673**: "feat(i18n): inject language instructions into chat endpoint system prompts"
5. **2ce941c**: "feat(i18n): add language support to planning endpoint"
6. **5aa4eec**: "feat(i18n): integrate language parameter into frontend API calls"
7. **94f4b55**: "feat(i18n): add expanded chat translation keys"

## 🚧 What's Remaining

### ❌ Frontend UI Translation (0% Complete)

**Scope**: Convert ~200+ hardcoded English strings to use `t()` function

**Components Requiring Translation**:

1. **ChatTab.tsx** (7622 lines) - LARGEST COMPONENT
   - Message placeholders, buttons, tooltips
   - Error messages, confirmation dialogs
   - Tool execution status messages
   - MCP server UI strings
   - Voice input/recording strings
   - File upload/paste strings

2. **SettingsModal.tsx**
   - Tab labels, field labels, descriptions
   - Validation messages, help text
   - Provider configuration strings

3. **LoginScreen.tsx**
   - Welcome messages, login prompts
   - Authentication error messages

4. **PlanningDialog.tsx**
   - Planning prompts, status messages
   - Clarification UI, guidance mode strings

5. **BillingPage.tsx**
   - Pricing information, usage statistics
   - Transaction history labels

6. **Smaller Components**:
   - PlanningPage, SwagPage, Header, Footer
   - Progress indicators, info dialogs
   - Toast messages, error dialogs

**Estimated Effort**: 6-8 hours for comprehensive conversion

## 📖 How to Use i18n (For Developers)

### 1. Adding Translation Keys

**Edit** `ui-new/src/i18n/locales/en.json`:
```json
{
  "chat": {
    "newFeature": "This is a new feature",
    "anotherString": "Another translatable string"
  }
}
```

**Update other language files** with translations (or leave English as fallback).

### 2. Using Translations in Components

```typescript
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t, i18n } = useTranslation();
  
  return (
    <div>
      <h1>{t('chat.newFeature')}</h1>
      <button onClick={() => i18n.changeLanguage('es')}>
        Switch to Spanish
      </button>
    </div>
  );
}
```

### 3. Using Locale Formatters

```typescript
import { useTranslation } from 'react-i18next';
import { formatDate, formatCurrency } from '../utils/formatters';

function MyComponent() {
  const { i18n } = useTranslation();
  
  const formattedDate = formatDate(new Date(), i18n.language);
  const formattedPrice = formatCurrency(99.99, i18n.language, 'USD');
  
  return (
    <div>
      <p>Date: {formattedDate}</p>
      <p>Price: {formattedPrice}</p>
    </div>
  );
}
```

### 4. Adding New Languages

1. **Create translation file**: `ui-new/src/i18n/locales/pt.json` (Portuguese example)
2. **Import in config**: `ui-new/src/i18n/config.ts`
   ```typescript
   import ptTranslations from './locales/pt.json';
   // Add to resources
   pt: { translation: ptTranslations }
   ```
3. **Add to Settings interface**: `ui-new/src/types/provider.ts`
   ```typescript
   language?: string; // ISO 639-1 code: en, es, fr, de, zh, ja, ar, pt
   ```
4. **Add to language selector**: `ui-new/src/components/SettingsModal.tsx`
   ```tsx
   <option value="pt">Português - Portuguese</option>
   ```
5. **Add to languages object**: `ui-new/src/i18n/locales/en.json`
   ```json
   "languages": {
     "pt": "Português"
   }
   ```
6. **Add backend instruction**: `src/utils/languageInstructions.js`
   ```javascript
   case 'pt':
     return 'Sempre responda em português, usando linguagem natural e clara.';
   ```

## 🧪 Testing i18n Implementation

### Backend Language Testing (Ready Now)

1. **Start local dev server**:
   ```bash
   make dev
   ```

2. **Open UI** at `http://localhost:5173`

3. **Sign in** with Google

4. **Change language** in Settings → General → Language

5. **Send chat message** - LLM should respond in selected language

6. **Test planning** - Planning prompts should be in selected language

### Frontend UI Testing (After UI Translation Complete)

1. **Switch language** in Settings

2. **Verify all UI strings** translate correctly

3. **Check RTL layout** for Arabic:
   - Text direction right-to-left
   - UI elements mirror horizontally
   - Scrollbars on left side

4. **Test all pages**: Chat, Planning, Settings, Billing, Knowledge Base

5. **Test all dialogs**: Load Chat, Planning Dialog, MCP Servers, etc.

### Locale Formatter Testing

1. **Change language** to French

2. **Check date format**: Should use French conventions

3. **Check number format**: Should use French decimal separator (`,`)

4. **Check currency**: Should adapt to locale

## 🚀 Deployment

### Current State (Ready to Deploy)

**Backend Language Control**: ✅ Fully implemented and tested locally

**Steps to Deploy**:

1. **Deploy Backend**:
   ```bash
   make deploy-lambda-fast
   ```

2. **Deploy Frontend**:
   ```bash
   make deploy-ui
   ```

3. **Test on Production**:
   - Change language in Settings
   - Verify LLM responses adapt to language
   - Test planning with different languages

### Future Deployment (After UI Translation)

**Frontend UI Translation**: ❌ Not yet implemented

**Steps After UI Translation Complete**:

1. **Build and test locally**:
   ```bash
   cd ui-new
   npm run dev
   ```

2. **Verify all languages work**

3. **Deploy**:
   ```bash
   make deploy-ui
   ```

## 📝 Development Workflow

### Local-First Development Reminder

⚠️ **IMPORTANT**: We develop locally, NOT in production

**After Backend Code Changes**:
```bash
make dev  # Restart local server
```

**NOT**:
```bash
make deploy-lambda  # Only when production-ready
```

### Adding New i18n Features

1. **Add translation keys** to `en.json`
2. **Use `t()` function** in component
3. **Test locally** by switching languages
4. **Translate to other languages** (or leave English fallback)
5. **Commit** with descriptive message
6. **Deploy** when feature complete

## 🎯 Next Steps

### Option A: Deploy Backend Now (Recommended)

**Pros**:
- Test language-aware LLM responses in production
- Get user feedback on language quality
- Backend fully functional

**Steps**:
1. `make deploy-lambda-fast` - Deploy language-aware backend
2. `make deploy-ui` - Deploy current UI (with language selector)
3. Test LLM language responses
4. Iterate on UI translation separately

### Option B: Complete UI Translation First

**Pros**:
- Complete i18n experience in one deployment
- All strings translated together

**Steps**:
1. Convert ChatTab strings (~4 hours)
2. Convert other components (~3 hours)
3. Expand translation files (~1 hour)
4. Test all languages (~1 hour)
5. Deploy backend + frontend together

### Option C: Hybrid Approach

**Pros**:
- Deploy backend immediately
- Add UI translations incrementally
- Continuous improvement

**Steps**:
1. Deploy backend now
2. Convert high-impact components (ChatTab, Settings)
3. Deploy UI update
4. Convert remaining components iteratively
5. Deploy UI updates as ready

## 📚 References

- **i18next Documentation**: https://www.i18next.com/
- **react-i18next Documentation**: https://react.i18next.com/
- **Intl API (Locale Formatting)**: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl
- **ISO 639-1 Language Codes**: https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes
- **RTL Web Development**: https://rtlstyling.com/

## ✅ Summary

**What Works Now**:
- ✅ Backend sends LLM language instructions
- ✅ LLMs respond in user's selected language
- ✅ Language selector in Settings UI
- ✅ RTL support for Arabic/Hebrew
- ✅ Locale-aware formatters ready
- ✅ Translation infrastructure complete

**What's Pending**:
- ❌ UI string conversion (200+ strings across components)
- ❌ Full translation coverage for all 7 languages
- ❌ Production deployment

**Recommendation**: **Deploy backend now** (Option A) to test language-aware LLM responses, then add UI translations iteratively.
