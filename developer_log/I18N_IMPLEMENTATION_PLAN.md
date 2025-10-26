# Internationalization (i18n) Implementation Plan

**Date**: October 26, 2025  
**Objective**: Add multi-language support to the Research Agent application with language selector in Settings

**Enhanced Features**:
- ✨ Auto-language detection from first message
- 🎤 Voice input with multilingual transcription
- 🌍 Regional dialects as first-class language options
- 💾 Translation memory for consistency
- 🔊 Whisper support for 99+ languages

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Technology Stack](#2-technology-stack)
3. [Implementation Phases](#3-implementation-phases)
4. [Workflow: How Language Selection Affects Everything](#4-workflow-how-language-selection-affects-everything)
5. [Backend Changes Summary](#5-backend-changes-summary)
6. [Translation Workflow](#6-translation-workflow)
7. [Testing Strategy](#7-testing-strategy)
8. [Performance Considerations](#8-performance-considerations)
9. [Rollout Plan](#9-rollout-plan)
10. [Potential Issues & Solutions](#10-potential-issues--solutions)
11. [Estimated Timeline](#11-estimated-timeline)
12. [Success Metrics](#12-success-metrics)
13. [Enhanced Features](#13-enhanced-features)
    - A. Auto-Detect Language from First Message
    - B. Voice Input/Output with Language Support
    - C. Regional Dialects as First-Class Language Choices
14. [Future Enhancements](#14-future-enhancements)
15. [Conclusion](#conclusion)

---

## 1. Executive Summary

This plan outlines how to implement full internationalization (i18n) for the Research Agent app, including:
- Frontend UI text translation
- Backend LLM responses in target language
- Date/number formatting per locale
- RTL (right-to-left) language support

**Key Insight**: Since this app uses LLMs for most content, we need a hybrid approach:
1. **UI i18n**: Translate static UI elements (buttons, labels, menus)
2. **LLM i18n**: Instruct LLMs to respond in the user's selected language via system prompts

---

## 2. Technology Stack

### Frontend i18n Library: **react-i18next**
**Why**: Industry standard, minimal bundle size (~10KB), React hooks support, lazy loading

```bash
npm install i18next react-i18next i18next-browser-languagedetector
```

### Alternative Considered: **react-intl** (rejected - heavier, more complex for our needs)

---

## 3. Implementation Phases

### Phase 1: Setup & Configuration (2-3 hours)

#### A. Install Dependencies
```bash
cd ui-new
npm install i18next react-i18next i18next-browser-languagedetector
```

#### B. Create i18n Configuration
**File**: `ui-new/src/i18n/config.ts`
```typescript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translations
import enTranslations from './locales/en.json';
import esTranslations from './locales/es.json';
import frTranslations from './locales/fr.json';
import deTranslations from './locales/de.json';
import zhTranslations from './locales/zh.json';
import jaTranslations from './locales/ja.json';
import arTranslations from './locales/ar.json';

i18n
  .use(LanguageDetector) // Auto-detect user language
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslations },
      es: { translation: esTranslations },
      fr: { translation: frTranslations },
      de: { translation: deTranslations },
      zh: { translation: zhTranslations },
      ja: { translation: jaTranslations },
      ar: { translation: arTranslations }
    },
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false // React already escapes
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage']
    }
  });

export default i18n;
```

#### C. Initialize in App Entry Point
**File**: `ui-new/src/main.tsx`
```typescript
import './i18n/config'; // Add this import at the top
```

---

### Phase 2: Translation Files Structure (1-2 hours)

#### Translation File Organization
```
ui-new/src/i18n/
├── config.ts
└── locales/
    ├── en.json (English - Base)
    ├── es.json (Spanish)
    ├── fr.json (French)
    ├── de.json (German)
    ├── zh.json (Chinese)
    ├── ja.json (Japanese)
    └── ar.json (Arabic - RTL)
```

#### Example Translation File Structure
**File**: `ui-new/src/i18n/locales/en.json`
```json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "close": "Close",
    "loading": "Loading...",
    "error": "Error",
    "success": "Success"
  },
  "auth": {
    "signIn": "Sign in with Google",
    "signOut": "Sign Out",
    "authRequired": "Authentication required",
    "tokenExpired": "Your session has expired. Please sign in again."
  },
  "chat": {
    "placeholder": "Type your message here...",
    "send": "Send",
    "retry": "Retry",
    "stop": "Stop",
    "thinking": "Thinking...",
    "generating": "Generating response..."
  },
  "planning": {
    "title": "Research Planning",
    "query": "Research Query",
    "generatePlan": "Generate Plan",
    "savePlan": "Save Plan",
    "transferToChat": "Transfer to Chat",
    "clearAll": "Clear All"
  },
  "settings": {
    "title": "Settings",
    "language": "Language",
    "selectLanguage": "Select Language",
    "providers": "Providers",
    "cloudSync": "Cloud Sync",
    "billing": "Billing"
  },
  "languages": {
    "en": "English",
    "es": "Español",
    "fr": "Français",
    "de": "Deutsch",
    "zh": "中文",
    "ja": "日本語",
    "ar": "العربية"
  }
}
```

---

### Phase 3: Add Language Selector to Settings (1 hour)

**File**: `ui-new/src/contexts/SettingsContext.tsx`

Add language field to Settings interface:
```typescript
export interface Settings {
  // ... existing fields ...
  language: string; // New field: ISO 639-1 language code (en, es, fr, etc.)
}

const defaultSettings: Settings = {
  // ... existing defaults ...
  language: 'en'
};
```

**File**: `ui-new/src/components/SettingsModal.tsx`

Add language selector UI:
```tsx
import { useTranslation } from 'react-i18next';

export const SettingsModal: React.FC<Props> = () => {
  const { t, i18n } = useTranslation();
  const { settings, setSettings } = useSettings();

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang); // Update i18next
    setSettings({ ...settings, language: lang }); // Persist to settings
  };

  return (
    <div className="settings-section">
      <h3>{t('settings.language')}</h3>
      <select 
        value={settings.language}
        onChange={(e) => handleLanguageChange(e.target.value)}
        className="select-field"
      >
        <option value="en">{t('languages.en')}</option>
        <option value="es">{t('languages.es')}</option>
        <option value="fr">{t('languages.fr')}</option>
        <option value="de">{t('languages.de')}</option>
        <option value="zh">{t('languages.zh')}</option>
        <option value="ja">{t('languages.ja')}</option>
        <option value="ar">{t('languages.ar')}</option>
      </select>
    </div>
  );
};
```

---

### Phase 4: Translate UI Components (3-4 hours)

#### Example Component Translation
**Before**:
```tsx
<button>Generate Plan</button>
<p>Please sign in with Google to continue</p>
```

**After**:
```tsx
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();

<button>{t('planning.generatePlan')}</button>
<p>{t('auth.signInPrompt')}</p>
```

#### Priority Components to Translate
1. **Header/Navigation** (ChatTab, SettingsModal)
2. **Authentication** (GoogleLoginButton, auth messages)
3. **Chat Interface** (ChatTab, message placeholders)
4. **Planning** (PlanningDialog, PlanningTab)
5. **Settings** (SettingsModal, all tabs)
6. **Error Messages** (ToastManager, error states)

---

### Phase 5: LLM Response Language Control (CRITICAL - 2 hours)

This is where we ensure **LLM responses** are in the target language.

#### A. Add Language to Chat Requests
**File**: `ui-new/src/components/ChatTab.tsx`

```typescript
const { settings } = useSettings();
const { t, i18n } = useTranslation();

const sendMessage = async (content: string) => {
  // Inject language instruction into system prompt
  const languageInstruction = getLanguageInstruction(settings.language);
  
  const systemPrompt = generatedSystemPromptFromPlanning || 
    settings.systemPrompt || 
    `You are a helpful research assistant. ${languageInstruction}`;

  await sendChatMessageStreaming({
    model: selectedModel,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
      { role: 'user', content }
    ],
    // ... rest of request
  });
};
```

#### B. Language Instruction Helper
**File**: `ui-new/src/i18n/languageInstructions.ts`

```typescript
export const getLanguageInstruction = (langCode: string): string => {
  const instructions: Record<string, string> = {
    'en': 'Always respond in English.',
    'es': 'Siempre responde en español.',
    'fr': 'Répondez toujours en français.',
    'de': 'Antworte immer auf Deutsch.',
    'zh': '始终用中文回复。',
    'ja': '常に日本語で応答してください。',
    'ar': 'قم دائمًا بالرد باللغة العربية.'
  };
  
  return instructions[langCode] || instructions['en'];
};

export const getLanguageName = (langCode: string): string => {
  const names: Record<string, string> = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'zh': 'Chinese',
    'ja': 'Japanese',
    'ar': 'Arabic'
  };
  
  return names[langCode] || 'English';
};
```

#### C. Update Backend Planning Endpoint
**File**: `src/endpoints/planning.js`

Add language parameter to planning requests:
```javascript
const body = JSON.parse(event.body || '{}');
const userLanguage = body.language || 'en'; // Get language from request

// Add to system prompt for planning LLM
const planningSystemPrompt = `You are a research planning assistant.
${getLanguageInstruction(userLanguage)}
Generate a comprehensive research plan...`;
```

#### D. Update All Tool Calls
**File**: `src/tools.js`

For tools that return text (search, scrape), add language context:
```javascript
// In search tool
const searchPrompt = `Summarize these search results in ${getLanguageName(userLanguage)}...`;

// In scrape tool  
const scrapePrompt = `Extract key information from this webpage in ${getLanguageName(userLanguage)}...`;
```

---

### Phase 6: Locale-Specific Formatting (1 hour)

#### A. Date Formatting
**File**: `ui-new/src/utils/formatters.ts`

```typescript
import { useTranslation } from 'react-i18next';

export const formatDate = (date: Date, locale: string): string => {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

export const formatNumber = (num: number, locale: string): string => {
  return new Intl.NumberFormat(locale).format(num);
};

export const formatCurrency = (amount: number, locale: string, currency: string = 'USD'): string => {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency
  }).format(amount);
};
```

#### B. Use in Components
```tsx
const { i18n } = useTranslation();

// Dates
<span>{formatDate(new Date(tx.timestamp), i18n.language)}</span>

// Numbers (token counts)
<span>{formatNumber(totalTokens, i18n.language)}</span>

// Currency
<span>{formatCurrency(cost, i18n.language)}</span>
```

---

### Phase 7: RTL (Right-to-Left) Support (2 hours)

For Arabic and Hebrew support:

#### A. Add Direction Attribute
**File**: `ui-new/src/App.tsx`

```tsx
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const App = () => {
  const { i18n } = useTranslation();
  
  useEffect(() => {
    // Set document direction based on language
    const direction = ['ar', 'he', 'fa'].includes(i18n.language) ? 'rtl' : 'ltr';
    document.documentElement.dir = direction;
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  return <div>{/* app content */}</div>;
};
```

#### B. Update CSS for RTL
**File**: `ui-new/src/index.css`

```css
/* RTL-aware margins */
[dir="rtl"] .ml-2 {
  margin-right: 0.5rem;
  margin-left: 0;
}

[dir="rtl"] .mr-2 {
  margin-left: 0.5rem;
  margin-right: 0;
}

/* RTL-aware padding */
[dir="rtl"] .pl-4 {
  padding-right: 1rem;
  padding-left: 0;
}

[dir="rtl"] .pr-4 {
  padding-left: 1rem;
  padding-right: 0;
}

/* RTL-aware text alignment */
[dir="rtl"] .text-left {
  text-align: right;
}

[dir="rtl"] .text-right {
  text-align: left;
}
```

---

### Phase 8: Translation Memory System (2-3 hours)

**Translation Memory (TM)** is a database that stores previously translated text segments (sentences, phrases, technical terms) to ensure consistency across translations and reduce translation effort.

**What it does**:
- Stores all translations in a reusable database
- Checks for exact or similar matches before translating
- Ensures consistent terminology (e.g., "Settings" always → "Configuración")
- Reduces retranslation of common phrases
- Tracks frequency to prioritize important terms

**How it works**:
```
New text → Check TM → Found? → Reuse translation
                   → Not found? → Translate → Store in TM
```

**Storage Architecture**:
- **Client-side**: IndexedDB for fast local access and offline support
- **Server-side**: Google Sheets (`translation_memory` sheet in RAG spreadsheet)
- **Sync**: Bidirectional sync on app load and periodic background sync
- **Why not Lambda file storage**: Lambda containers are ephemeral and lose filesystem data on reset

#### A. Translation Memory Implementation

**File**: `ui-new/src/services/translation-memory.ts` (Client-side)

```typescript
// IndexedDB-based Translation Memory for browser storage
class TranslationMemory {
  private dbName = 'LambdaLLMProxy';
  private storeName = 'translationMemory';
  private db: IDBDatabase | null = null;

  async init() {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('sourceText', 'sourceText', { unique: false });
          store.createIndex('targetLang', 'targetLang', { unique: false });
          store.createIndex('lastUsed', 'lastUsed', { unique: false });
        }
      };
    });
  }

  // Get translation from IndexedDB
  async get(sourceText: string, targetLang: string): Promise<string | null> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const id = `${sourceText}::${targetLang}`;
      const request = store.get(id);
      
      request.onsuccess = () => {
        const entry = request.result;
        if (entry) {
          // Update frequency and last used
          entry.frequency++;
          entry.lastUsed = new Date().toISOString();
          store.put(entry);
          resolve(entry.translation);
        } else {
          resolve(null);
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  // Store new translation in IndexedDB
  async set(sourceText: string, targetLang: string, translation: string, context = '') {
    if (!this.db) await this.init();
    
    return new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const id = `${sourceText}::${targetLang}`;
      
      const entry = {
        id,
        sourceText,
        targetLang,
        translation,
        context,
        frequency: 1,
        lastUsed: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      
      store.put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // Find similar translations (fuzzy matching)
  async findSimilar(sourceText: string, targetLang: string, threshold = 0.8): Promise<Array<{source: string, translation: string, similarity: number, frequency: number}>> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const index = store.index('targetLang');
      const request = index.openCursor(IDBKeyRange.only(targetLang));
      const results: Array<any> = [];
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const entry = cursor.value;
          const similarity = this.calculateSimilarity(sourceText, entry.sourceText);
          if (similarity >= threshold) {
            results.push({
              source: entry.sourceText,
              translation: entry.translation,
              similarity,
              frequency: entry.frequency
            });
          }
          cursor.continue();
        } else {
          resolve(results.sort((a, b) => b.similarity - a.similarity));
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    const longerLength = longer.length;
    if (longerLength === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longerLength - distance) / longerLength;
  }

  levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[str2.length][str1.length];
  }

  // Sync with Google Sheets
  async syncToGoogleSheets(authToken: string) {
    if (!this.db) await this.init();
    
    const allEntries = await this.getAllEntries();
    
    const response = await fetch('/rag/sync-translation-memory', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ entries: allEntries })
    });
    
    if (!response.ok) {
      throw new Error('Failed to sync Translation Memory to Google Sheets');
    }
    
    console.log(`✅ Synced ${allEntries.length} TM entries to Google Sheets`);
  }

  async syncFromGoogleSheets(authToken: string) {
    const response = await fetch('/rag/translation-memory', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to load Translation Memory from Google Sheets');
    }
    
    const { entries } = await response.json();
    
    if (!this.db) await this.init();
    
    // Merge entries (keep highest frequency)
    const tx = this.db!.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    
    for (const entry of entries) {
      const existing = await new Promise<any>((resolve) => {
        const req = store.get(entry.id);
        req.onsuccess = () => resolve(req.result);
      });
      
      if (!existing || existing.frequency < entry.frequency) {
        store.put(entry);
      }
    }
    
    console.log(`✅ Synced ${entries.length} TM entries from Google Sheets`);
  }

  private async getAllEntries(): Promise<any[]> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

export default TranslationMemory;
```

#### B. Backend Translation Memory Sync

**File**: `src/endpoints/rag.js` (Add new endpoints)

```javascript
// GET /rag/translation-memory - Retrieve TM from Google Sheets
async function getTranslationMemory(event) {
  const authResult = await authenticateRequest(event);
  if (!authResult.success) {
    return createErrorResponse(401, authResult.error);
  }

  try {
    const spreadsheetId = process.env.RAG_SPREADSHEET_ID;
    const sheetName = 'translation_memory';
    const range = `${sheetName}!A2:H`; // Skip header row
    
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
      {
        headers: { 'Authorization': `Bearer ${authResult.accessToken}` }
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to read Translation Memory sheet');
    }
    
    const data = await response.json();
    const rows = data.values || [];
    
    const entries = rows.map(row => ({
      id: row[0],
      sourceText: row[1],
      targetLang: row[2],
      translation: row[3],
      context: row[4] || '',
      frequency: parseInt(row[5]) || 1,
      lastUsed: row[6],
      createdAt: row[7]
    }));
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries })
    };
  } catch (error) {
    console.error('Error loading Translation Memory:', error);
    return createErrorResponse(500, 'Failed to load Translation Memory');
  }
}

// POST /rag/sync-translation-memory - Upload TM to Google Sheets
async function syncTranslationMemory(event) {
  const authResult = await authenticateRequest(event);
  if (!authResult.success) {
    return createErrorResponse(401, authResult.error);
  }

  try {
    const { entries } = JSON.parse(event.body);
    
    const spreadsheetId = process.env.RAG_SPREADSHEET_ID;
    const sheetName = 'translation_memory';
    
    // Ensure sheet exists
    await ensureSheetExists(spreadsheetId, sheetName, authResult.accessToken, [
      'ID', 'Source Text', 'Target Language', 'Translation', 
      'Context', 'Frequency', 'Last Used', 'Created At'
    ]);
    
    // Convert entries to rows
    const rows = entries.map(e => [
      e.id,
      e.sourceText,
      e.targetLang,
      e.translation,
      e.context || '',
      e.frequency,
      e.lastUsed,
      e.createdAt
    ]);
    
    // Clear and write (or merge based on ID)
    const range = `${sheetName}!A2:H`;
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=RAW`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authResult.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values: rows })
      }
    );
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, synced: entries.length })
    };
  } catch (error) {
    console.error('Error syncing Translation Memory:', error);
    return createErrorResponse(500, 'Failed to sync Translation Memory');
  }
}
```

#### C. Integration with Translation Workflow

**Client-side usage**:

```typescript
// ui-new/src/hooks/useTranslation.ts
import { useEffect } from 'react';
import TranslationMemory from '../services/translation-memory';
import { useAuth } from '../contexts/AuthContext';

export function useTranslationMemory() {
  const { authToken } = useAuth();
  const tm = new TranslationMemory();

  useEffect(() => {
    // Sync from Google Sheets on app load
    if (authToken) {
      tm.syncFromGoogleSheets(authToken).catch(console.error);
    }

    // Periodic sync every 5 minutes
    const interval = setInterval(() => {
      if (authToken) {
        tm.syncToGoogleSheets(authToken).catch(console.error);
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [authToken]);

  return tm;
}
```

**Backend batch translation with TM**:
```

#### C. Batch Translation Script

**File**: `scripts/batch-translate.js`

```javascript
const { TranslationMemory } = require('./translation-memory');
const fs = require('fs').promises;
const path = require('path');

async function batchTranslateFile(sourceLang, targetLang) {
  const tm = new TranslationMemory();
  await tm.load();

  // Load source translation file
  const sourcePath = path.join(__dirname, `../ui-new/src/i18n/locales/${sourceLang}.json`);
  const sourceData = JSON.parse(await fs.readFile(sourcePath, 'utf-8'));

  // Create target translation object
  const targetData = {};

  // Recursively translate all keys
  async function translateObject(sourceObj, targetObj, parentKey = '') {
    for (const [key, value] of Object.entries(sourceObj)) {
      const fullKey = parentKey ? `${parentKey}.${key}` : key;
      
      if (typeof value === 'string') {
        // Check TM first
        const existing = tm.get(value, targetLang);
        if (existing) {
          console.log(`💾 TM HIT [${fullKey}]: "${value}" -> "${existing}"`);
          targetObj[key] = existing;
        } else {
          // Translate and store
          console.log(`🔄 Translating [${fullKey}]: "${value}"`);
          const translation = await llmTranslate(value, targetLang);
          targetObj[key] = translation;
          tm.set(value, targetLang, translation, fullKey);
          
          // Save TM after each translation to preserve progress
          await tm.save();
        }
      } else if (typeof value === 'object' && value !== null) {
        targetObj[key] = {};
        await translateObject(value, targetObj[key], fullKey);
      }
    }
  }

  await translateObject(sourceData, targetData);

  // Save translated file
  const targetPath = path.join(__dirname, `../ui-new/src/i18n/locales/${targetLang}.json`);
  await fs.writeFile(targetPath, JSON.stringify(targetData, null, 2));
  console.log(`✅ Saved ${targetLang}.json`);

  await tm.save();
  console.log(`💾 Translation Memory updated with ${tm.memory.size} entries`);
}

// Usage: node scripts/batch-translate.js en es
const [sourceLang, targetLang] = process.argv.slice(2);
if (!sourceLang || !targetLang) {
  console.error('Usage: node batch-translate.js <source-lang> <target-lang>');
  console.error('Example: node batch-translate.js en es');
  process.exit(1);
}

batchTranslateFile(sourceLang, targetLang).catch(console.error);
```

**Benefits of Translation Memory**:
- ✅ **Consistency**: Technical terms translated uniformly
- ✅ **Efficiency**: ~50-70% TM hit rate after initial translation
- ✅ **Quality**: Reuses verified translations
- ✅ **Cost savings**: Reduces LLM API calls significantly
- ✅ **Maintenance**: Easy to update specific terms globally

---

## 4. Workflow: How Language Selection Affects Everything

### User Journey
1. User opens Settings → Language
2. Selects "Spanish" from dropdown
3. **Immediate Effects**:
   - All UI text changes to Spanish
   - `i18n.language` updates to `'es'`
   - `settings.language` persists to localStorage
   - Document direction stays LTR (unless Arabic selected)

4. **On Next Chat Message**:
   - System prompt includes: "Siempre responde en español"
   - LLM generates response in Spanish
   - All tool results (search, scrape) are also in Spanish

5. **On Next Planning Request**:
   - Planning LLM receives Spanish instruction
   - Research plan generated in Spanish
   - System prompt and user query in Spanish

### Data Flow
```
User selects language
    ↓
Settings Context updates
    ↓
i18next changes language
    ↓
UI re-renders with new translations
    ↓
Next API request includes language parameter
    ↓
Backend injects language instruction into system prompt
    ↓
LLM responds in target language
```

---

## 5. Backend Changes Summary

### A. Accept Language Parameter
All endpoints that use LLMs should accept `language` parameter:

**Chat Endpoint** (`src/endpoints/chat.js`):
```javascript
const body = JSON.parse(event.body || '{}');
const userLanguage = body.language || 'en';

// Inject into system message
messages[0].content += `\n\n${getLanguageInstruction(userLanguage)}`;
```

**Planning Endpoint** (`src/endpoints/planning.js`):
```javascript
const userLanguage = body.language || 'en';
const systemPrompt = `Research planning assistant. ${getLanguageInstruction(userLanguage)}...`;
```

**Search Endpoint** (`src/endpoints/search.js`):
```javascript
const userLanguage = body.language || 'en';
// Use in summary prompts
```

### B. Add Language Instruction Helper
**File**: `src/utils/languageInstructions.js`

```javascript
function getLanguageInstruction(langCode) {
  const instructions = {
    'en': 'Always respond in English.',
    'es': 'Siempre responde en español.',
    'fr': 'Répondez toujours en français.',
    'de': 'Antworte immer auf Deutsch.',
    'zh': '始终用中文回复。',
    'ja': '常に日本語で応答してください。',
    'ar': 'قم دائمًا بالرد باللغة العربية.'
  };
  
  return instructions[langCode] || instructions['en'];
}

function getLanguageName(langCode) {
  const names = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'zh': 'Chinese',
    'ja': 'Japanese',
    'ar': 'Arabic'
  };
  
  return names[langCode] || 'English';
}

module.exports = {
  getLanguageInstruction,
  getLanguageName
};
```

---

## 6. Translation Workflow

### Initial Translation
1. **Start with English** (`en.json`) - complete all keys
2. **Use GPT-4 to translate** to other languages:
   ```
   Prompt: "Translate this JSON file from English to [target language]. 
   Maintain the exact same keys, only translate the values. 
   Preserve placeholders like {{name}}."
   ```
3. **Review translations** with native speakers or professional service

### Ongoing Maintenance
- Add new keys to `en.json` first
- Run translation script/service for other languages
- Mark untranslated strings with `[UNTRANSLATED]` prefix

---

## 7. Testing Strategy

### Manual Testing Checklist
- [ ] Switch language in Settings
- [ ] Verify UI text updates immediately
- [ ] Send chat message, verify LLM responds in target language
- [ ] Generate research plan, verify plan is in target language
- [ ] Check date/number formatting matches locale
- [ ] Test RTL layout for Arabic
- [ ] Verify language persists after page refresh

### Automated Testing
```typescript
// Example test
import { render } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from './i18n/config';

it('renders in Spanish when language is es', () => {
  i18n.changeLanguage('es');
  const { getByText } = render(
    <I18nextProvider i18n={i18n}>
      <ChatTab />
    </I18nextProvider>
  );
  expect(getByText('Enviar')).toBeInTheDocument(); // "Send" in Spanish
});
```

---

## 8. Performance Considerations

### Bundle Size Impact
- `i18next`: ~10KB gzipped
- `react-i18next`: ~5KB gzipped
- Translation files: ~2-5KB per language (lazy loaded)

### Lazy Loading Translations
```typescript
// Only load when needed
i18n.use(HttpBackend).init({
  backend: {
    loadPath: '/locales/{{lng}}.json'
  },
  react: {
    useSuspense: false
  }
});
```

### Caching Strategy
- Translation files cached by browser
- Use versioned URLs for cache busting: `/locales/en.json?v=1.0.0`

---

## 9. Rollout Plan

### Phase 1: Core Languages (Week 1)
- English (en) - Base
- Spanish (es) - 2nd largest user base
- French (fr) - European market

### Phase 2: Asian Languages (Week 2)
- Chinese (zh) - Simplified
- Japanese (ja)

### Phase 3: Additional Languages (Week 3)
- German (de)
- Arabic (ar) - RTL testing

### Phase 4: User-Requested Languages (Ongoing)
- Monitor analytics for user language preferences
- Add languages based on demand

---

## 10. Potential Issues & Solutions

### Issue 1: LLM Doesn't Respect Language Instruction
**Solution**: Make language instruction more prominent in system prompt:
```
IMPORTANT: You MUST respond in [language name]. 
All text, explanations, and tool results must be in [language name].
```

### Issue 2: Mixed Language in Tool Results
**Solution**: Post-process tool results with translation LLM call:
```javascript
if (toolResult.language !== userLanguage) {
  toolResult.content = await translateText(toolResult.content, userLanguage);
}
```

### Issue 3: RTL Layout Breaks UI
**Solution**: Use logical CSS properties:
```css
/* Instead of margin-left */
margin-inline-start: 1rem;

/* Instead of padding-right */
padding-inline-end: 0.5rem;
```

---

## 11. Estimated Timeline

| Phase | Duration | Complexity |
|-------|----------|------------|
| 1. Setup & Config | 2-3 hours | Low |
| 2. Translation Files (with regional dialects) | 2-3 hours | Low-Medium |
| 3. Language Selector (with dialect support) | 1-2 hours | Low |
| 4. UI Translation | 3-4 hours | Medium |
| 5. LLM Language Control | 2 hours | High |
| 6. Locale Formatting (dialect-aware) | 1-2 hours | Low-Medium |
| 7. RTL Support | 2 hours | Medium |
| 8. Translation Memory System | 2-3 hours | Medium |
| 9. Auto-Language Detection | 2-3 hours | Medium |
| 10. Voice Input with Language Support | 3-4 hours | Medium-High |
| **TOTAL** | **22-29 hours** | **Medium-High** |

**Note**: Regional dialect support adds ~30% to translation time. Translation Memory reduces ongoing translation effort by 50-70%.

---

## 12. Success Metrics

- [ ] Language selector works in Settings with regional dialect options
- [ ] UI text changes immediately on language switch
- [ ] LLM responses are 95%+ in target language and dialect
- [ ] Translation Memory achieves 50-70% hit rate after initial translations
- [ ] Consistent terminology across all translations (verified via TM)
- [ ] Auto-language detection sets language on first message
- [ ] Voice input transcribes in user's selected language
- [ ] Whisper correctly handles 99+ languages automatically
- [ ] Dates/numbers/currency formatted correctly per regional locale
- [ ] RTL languages (Arabic, Hebrew) display correctly
- [ ] Language preference persists across sessions
- [ ] Regional dialects (en-US vs en-GB, es-ES vs es-MX) work correctly
- [ ] No translation keys missing (fallback to English if needed)

---

## 14. Future Enhancements

### 1. Voice Output (TTS) with Language Detection

**Automatically detect the language of text before generating TTS audio** to ensure natural pronunciation.

**Challenge**: When user's UI language is English but LLM response contains Spanish text, TTS should use Spanish voice, not English voice reading Spanish words.

**Solution**: Detect language of each text segment before TTS synthesis.

#### Implementation

**File**: `ui-new/src/services/tts.ts`

```typescript
import { detectLanguage } from './language-detector';

async function speakText(text: string, uiLanguage: string) {
  // Detect actual language of the text (may differ from UI language)
  const detectedLang = await detectLanguage(text);
  
  console.log(`🔊 TTS: UI language=${uiLanguage}, Detected language=${detectedLang}`);
  
  // Use detected language for TTS voice selection
  const voice = selectVoiceForLanguage(detectedLang);
  
  const response = await fetch('/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      language: detectedLang, // Use detected, not UI language
      voice: voice
    })
  });
  
  const audioBlob = await response.blob();
  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);
  audio.play();
}

// Client-side language detection using franc (fast, offline)
async function detectLanguage(text: string): Promise<string> {
  // Import franc for language detection
  const franc = await import('franc');
  
  const langCode = franc.franc(text, { minLength: 10 });
  
  // Map franc ISO 639-3 codes to our language codes
  const langMap: Record<string, string> = {
    'eng': 'en',
    'spa': 'es',
    'fra': 'fr',
    'deu': 'de',
    'ita': 'it',
    'por': 'pt',
    'rus': 'ru',
    'jpn': 'ja',
    'kor': 'ko',
    'zho': 'zh',
    'ara': 'ar',
    'hin': 'hi',
    'ben': 'bn',
    'tur': 'tr'
  };
  
  return langMap[langCode] || 'en'; // Fallback to English
}

function selectVoiceForLanguage(lang: string): string {
  // Map language to OpenAI TTS voices or regional variants
  const voiceMap: Record<string, string> = {
    'en': 'alloy',      // English
    'es': 'nova',       // Spanish
    'fr': 'shimmer',    // French
    'de': 'fable',      // German
    'it': 'onyx',       // Italian
    'pt': 'echo',       // Portuguese
    'ja': 'alloy',      // Japanese (use neutral voice)
    'zh': 'nova',       // Chinese
    'ar': 'fable',      // Arabic
    'hi': 'shimmer',    // Hindi
    'ru': 'echo'        // Russian
  };
  
  return voiceMap[lang] || 'alloy'; // Default voice
}
```

**Backend TTS Endpoint** (`src/endpoints/tts.js`):

```javascript
async function handleTTS(event) {
  const { text, language, voice } = JSON.parse(event.body);
  
  console.log(`🔊 TTS Request: language=${language}, voice=${voice}, text length=${text.length}`);
  
  // Call OpenAI TTS API
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'tts-1',
      voice: voice,
      input: text,
      speed: 1.0
    })
  });
  
  const audioBuffer = await response.arrayBuffer();
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Disposition': 'inline'
    },
    body: Buffer.from(audioBuffer).toString('base64'),
    isBase64Encoded: true
  };
}
```

**Benefits**:
- ✅ Natural pronunciation in multi-language conversations
- ✅ Automatic language switching (no manual selection)
- ✅ Works with code-switching (mixed languages in single message)
- ✅ Fast client-side detection (franc library, ~50KB)

**Package Installation**:
```bash
cd ui-new
npm install franc
```

---

### 2. Real-time Translation of Search Results

Translate search results from foreign websites on-the-fly.

---

### 3. Mixed-Language Support

User writes in English, LLM responds in Spanish (explicit language override).

---

### 4. Language Learning Mode

Explain technical terms in both source and target languages.

---

### 5. Automatic Translation Quality Scoring

Use back-translation to validate translation quality and consistency.

---

## Conclusion

This comprehensive i18n implementation provides:
- ✅ Full UI translation with react-i18next
- ✅ **Regional dialect support** as first-class citizens (en-US, en-GB, es-ES, es-MX, etc.)
- ✅ **Auto-language detection** from first user message
- ✅ **Voice input with language awareness** (microphone button)
- ✅ **Whisper transcription** supporting 99+ languages automatically
- ✅ **Translation Memory with IndexedDB + Google Sheets sync** for consistency
- ✅ **TTS with automatic language detection** for natural pronunciation
- ✅ LLM responses in target language/dialect via system prompts
- ✅ Locale-aware formatting (dates, numbers, currency by region)
- ✅ RTL support for Arabic/Hebrew with regional variants
- ✅ Persistent language preference
- ✅ Minimal performance impact (~20KB total with dialects)

**Key Innovations**:
1. **System prompt injection** ensures LLM responses match UI language
2. **Automatic language detection** eliminates manual selection for most users
3. **Regional dialects treated equally** to major languages for authentic experience
4. **Whisper's multilingual capability** provides seamless voice input across all languages
5. **Translation Memory with cloud sync** maintains consistency across devices
6. **TTS language detection** ensures natural pronunciation regardless of UI language

**Language Coverage**:
- **14 regional dialects** covering major markets
- **99+ languages** supported via Whisper transcription
- **Automatic detection** for frictionless onboarding
