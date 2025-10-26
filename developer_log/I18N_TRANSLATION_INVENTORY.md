# Internationalization Translation Inventory

**Date**: October 26, 2025  
**Status**: Planning Phase  
**Languages**: 10 (en, es, fr, de, nl, pt, ru, zh, ja, ar)

## Overview

This document provides a comprehensive inventory of all UI strings requiring translation across the application. This planning phase ensures systematic coverage before implementation.

## Completed Components ✅

### LoginScreen (11 files modified)
- **Status**: ✅ Complete
- **Translation Keys**: 3 new keys added
- **Files Updated**: All 10 language files + component
- **Keys Added**:
  - `auth.researchAgent` - "Research Agent"
  - `auth.tagline` - "AI-powered research assistant"
  - `auth.secureAuth` - "Secure authentication powered by Google"

## Components Requiring Translation

### 1. SettingsModal (~1000+ lines, 8 tabs)

**Priority**: HIGH (Primary user configuration interface)

#### Tab 1: General
- [x] Existing: "Settings" (title)
- [ ] "General" (tab name)
- [ ] "Configure general application settings" (description)
- [ ] "Interface Language" (label)
- [ ] "Select your preferred language for the user interface" (help text)
- [ ] Language dropdown already uses t() ✓

#### Tab 2: Provider Settings
- [ ] "Provider" (tab name)
- [ ] "AI Provider Configuration" (section title)
- [ ] "Configure your AI model providers and API keys" (description)
- [ ] "Model Selection" (section title)
- [ ] "Choose your preferred AI models for different tasks" (description)
- [ ] "Optimization Strategy" (section title)
- [ ] "Choose how to optimize model selection" (description)
- [ ] "💰 Cheapest" (option title)
- [ ] "Use the most cost-effective models available" (option description)
- [ ] "⚖️ Balanced" (option title)
- [ ] "Balance between cost and performance" (option description)
- [ ] "🚀 Best Performance" (option title)
- [ ] "Use the highest performing models regardless of cost" (option description)
- [ ] Provider-specific sections (Groq, OpenAI, Anthropic, Google, etc.)
- [ ] "API Key" (label - appears ~10 times for different providers)
- [ ] "Enter your [Provider] API key" (placeholder - varies by provider)
- [ ] "Get API key" (link text - appears multiple times)
- [ ] "Enable [Provider]" (checkbox label - appears multiple times)

#### Tab 3: Cloud Storage
- [ ] "Cloud" (tab name)
- [ ] "Cloud Storage Configuration" (section title)
- [ ] "Configure cloud storage for transcriptions and embeddings" (description)
- [ ] "Google Cloud Storage" (section title)
- [ ] "Service Account JSON" (label)
- [ ] "Paste your GCS service account JSON here" (placeholder)
- [ ] "Bucket Name" (label)
- [ ] "Enter your GCS bucket name" (placeholder)
- [ ] "Upload Files to GCS" (checkbox label)
- [ ] "Automatically upload transcription files to Google Cloud Storage" (help text)

#### Tab 4: Tools
- [ ] "Tools" (tab name)
- [ ] "External Tools Configuration" (section title)
- [ ] "Enable and configure external tools and integrations" (description)
- [ ] "Web Search" (checkbox label)
- [ ] "Enable DuckDuckGo web search" (help text)
- [ ] "Web Scraping" (checkbox label)
- [ ] "Enable web page content extraction" (help text)
- [ ] "JavaScript Execution" (checkbox label)
- [ ] "Enable JavaScript code execution" (help text)
- [ ] "⚠️ Warning: Only enable if you trust the AI responses" (warning text)
- [ ] "Python Execution" (checkbox label)
- [ ] "Enable Python code execution" (help text)

#### Tab 5: Proxy Settings
- [ ] "Proxy" (tab name)
- [ ] "Proxy Configuration" (section title)
- [ ] "Configure HTTP/HTTPS proxy settings" (description)
- [ ] "Enable Proxy" (checkbox label)
- [ ] "Use proxy for web requests" (help text)
- [ ] "Proxy URL" (label)
- [ ] "http://proxy.example.com:8080" (placeholder)
- [ ] "Proxy Username" (label)
- [ ] "Optional" (placeholder/help text)
- [ ] "Proxy Password" (label)

#### Tab 6: Location Services
- [ ] "Location" (tab name)
- [ ] "Location Services" (section title)
- [ ] "Configure location for localized search results" (description)
- [ ] "Enable Location Services" (checkbox label)
- [ ] "Use your location for better search results" (help text)
- [ ] "Country" (label)
- [ ] "Select your country" (dropdown placeholder)
- [ ] Country names (50+ countries in dropdown)
- [ ] "Region/State" (label)
- [ ] "Select your region" (placeholder)

#### Tab 7: Text-to-Speech (TTS)
- [ ] "TTS" (tab name)
- [ ] "Text-to-Speech Configuration" (section title)
- [ ] "Configure voice settings for AI responses" (description)
- [ ] "Enable TTS" (checkbox label)
- [ ] "Automatically read AI responses aloud" (help text)
- [ ] "Voice Provider" (label)
- [ ] "OpenAI" / "Google" / "Browser" (dropdown options)
- [ ] "Voice" (label)
- [ ] "Select voice" (placeholder)
- [ ] "Speed" (label)
- [ ] "Pitch" (label)
- [ ] "Volume" (label)
- [ ] "Test Voice" (button)

#### Tab 8: RAG (Retrieval-Augmented Generation)
- [ ] "RAG" (tab name)
- [ ] "RAG Configuration" (section title)
- [ ] "Configure knowledge base and document retrieval" (description)
- [ ] "Enable RAG" (checkbox label)
- [ ] "Use document retrieval to enhance responses" (help text)
- [ ] "Embedding Model" (label)
- [ ] "Select embedding model" (dropdown)
- [ ] "Chunk Size" (label)
- [ ] "Number of tokens per chunk" (help text)
- [ ] "Overlap" (label)
- [ ] "Chunk overlap size" (help text)
- [ ] "Top K Results" (label)
- [ ] "Number of documents to retrieve" (help text)
- [ ] "Knowledge Base" (section title)
- [ ] "Manage your knowledge base documents" (description)
- [ ] "Upload Documents" (button)
- [ ] "Supported formats: PDF, TXT, MD, DOCX" (help text)

#### Common Elements (All Tabs)
- [ ] "Save Settings" (button - appears on all tabs)
- [ ] "Reset to Defaults" (button - appears on some tabs)
- [ ] "Settings saved successfully!" (success toast)
- [ ] "Failed to save settings" (error toast)
- [ ] "Are you sure?" (confirmation dialog)
- [ ] "Close" (button - X icon aria-label)

**Estimated Translation Keys**: 80-100

---

### 2. PlanningDialog

**Priority**: MEDIUM-HIGH (Research planning interface)

#### Main Dialog
- [ ] "Research Planning" (title)
- [ ] "Generate AI Research Plan" (subtitle)
- [ ] "Close" (button aria-label)

#### Query Input
- [ ] "Research Topic" (label)
- [ ] "What would you like to research?" (placeholder)
- [ ] "Enter your research question or topic" (help text)

#### Options
- [ ] "Search Depth" (label)
- [ ] "Quick" / "Standard" / "Deep" (radio options)
- [ ] "Number of sources" (label)
- [ ] "Include web search" (checkbox)
- [ ] "Include academic sources" (checkbox)
- [ ] "Include news sources" (checkbox)

#### Plan Display
- [ ] "Generated Plan" (section title)
- [ ] "Research Steps" (subsection)
- [ ] "Sources to Explore" (subsection)
- [ ] "Estimated Time" (label)
- [ ] "Start Research" (button)
- [ ] "Regenerate Plan" (button)
- [ ] "Edit Plan" (button)
- [ ] "Save Plan" (button)

#### Status Messages
- [ ] "Generating research plan..." (loading)
- [ ] "Plan generated successfully!" (success)
- [ ] "Failed to generate plan" (error)
- [ ] "No plan available" (empty state)
- [ ] "Please enter a research topic" (validation error)

#### Research Steps Display
- [ ] "Step {number}" (step title prefix)
- [ ] "Duration: {time}" (duration label)
- [ ] "Tools: {list}" (tools label)
- [ ] "Expected Outcome" (subsection)

**Estimated Translation Keys**: 50-60

---

### 3. BillingPage

**Priority**: MEDIUM (Financial tracking)

#### Page Header
- [ ] "Billing & Usage" (title)
- [ ] "Track your API usage and costs" (subtitle)

#### Summary Cards
- [ ] "Total Cost" (card title)
- [ ] "This Month" (period label)
- [ ] "Last Month" (period label)
- [ ] "Total API Calls" (metric)
- [ ] "Average Cost per Call" (metric)
- [ ] "Most Used Provider" (metric)
- [ ] "Most Expensive Model" (metric)

#### Usage Breakdown
- [ ] "Usage by Provider" (section title)
- [ ] "Provider" (table column)
- [ ] "Calls" (table column)
- [ ] "Cost" (table column)
- [ ] "Average" (table column)
- [ ] "Last Used" (table column)

#### Charts
- [ ] "Daily Usage" (chart title)
- [ ] "Cost Breakdown" (chart title)
- [ ] "Model Distribution" (chart title)

#### Filters
- [ ] "Time Period" (filter label)
- [ ] "Today" / "This Week" / "This Month" / "All Time" (filter options)
- [ ] "Provider Filter" (label)
- [ ] "All Providers" (dropdown default)

#### Export
- [ ] "Export to CSV" (button)
- [ ] "Export to JSON" (button)
- [ ] "Download Report" (button)

#### Empty States
- [ ] "No usage data available" (empty message)
- [ ] "Start using the application to see billing information" (empty help text)

#### Billing Details
- [ ] "Cost per 1K tokens" (label)
- [ ] "Input tokens" (label)
- [ ] "Output tokens" (label)
- [ ] "Total tokens" (label)

**Estimated Translation Keys**: 35-40

---

### 4. ChatTab (Largest Component)

**Priority**: HIGHEST (Main user interface)

#### Chat Header
- [ ] "New Chat" (button)
- [ ] "Clear History" (button)
- [ ] "Export Chat" (button)
- [ ] "Settings" (button)
- [ ] "{count} messages" (message counter)

#### Message Input
- [ ] "Type your message here..." (placeholder)
- [ ] "Send" (button)
- [ ] "Shift + Enter for new line" (help text)
- [ ] "Press Enter to send" (help text)

#### Message Actions
- [ ] "Copy" (button)
- [ ] "Regenerate" (button)
- [ ] "Edit" (button)
- [ ] "Delete" (button)
- [ ] "Speak" (button - TTS)
- [ ] "Stop Speaking" (button)
- [ ] "Copied!" (toast message)

#### Status Messages
- [ ] "Thinking..." (loading state)
- [ ] "Generating response..." (loading state)
- [ ] "Searching the web..." (tool status)
- [ ] "Scraping webpage..." (tool status)
- [ ] "Executing code..." (tool status)
- [ ] "Reading documents..." (RAG status)
- [ ] "Retrieving from knowledge base..." (RAG status)

#### Tool Indicators
- [ ] "🔍 Web Search" (tool badge)
- [ ] "📄 Web Scrape" (tool badge)
- [ ] "💻 Code Execution" (tool badge)
- [ ] "📚 Knowledge Base" (tool badge)
- [ ] "🔊 Text-to-Speech" (tool badge)

#### Error Messages
- [ ] "Failed to send message" (error)
- [ ] "Network error. Please try again." (error)
- [ ] "Rate limit exceeded. Please wait..." (error)
- [ ] "Invalid API key. Check settings." (error)
- [ ] "Message is too long" (validation error)
- [ ] "No API key configured" (configuration error)

#### Streaming Indicators
- [ ] "●" or "Typing..." (streaming indicator)
- [ ] "Stop Generation" (button during streaming)
- [ ] "Continue" (button for rate-limited response)

#### Chat History
- [ ] "Today" (date group)
- [ ] "Yesterday" (date group)
- [ ] "Last 7 Days" (date group)
- [ ] "Last 30 Days" (date group)
- [ ] "Older" (date group)
- [ ] "Load more messages" (pagination)
- [ ] "No chat history" (empty state)

#### Conversation Management
- [ ] "Save Conversation" (button)
- [ ] "Load Conversation" (button)
- [ ] "Delete Conversation" (button)
- [ ] "Are you sure you want to delete this conversation?" (confirmation)
- [ ] "Conversation saved!" (success toast)
- [ ] "Conversation deleted" (success toast)

#### Model Selection (in chat)
- [ ] "Model:" (label)
- [ ] "Provider:" (label)
- [ ] "Change model" (link/button)
- [ ] "Using {provider}/{model}" (status text)

#### Advanced Features
- [ ] "System Prompt" (label)
- [ ] "Temperature" (label)
- [ ] "Max Tokens" (label)
- [ ] "Top P" (label)
- [ ] "Frequency Penalty" (label)
- [ ] "Presence Penalty" (label)
- [ ] "Show Advanced Options" (toggle)
- [ ] "Hide Advanced Options" (toggle)

#### File Attachments
- [ ] "Attach file" (button)
- [ ] "Supported formats: {formats}" (help text)
- [ ] "File uploaded successfully" (success)
- [ ] "File too large. Max size: {size}" (error)
- [ ] "Unsupported file type" (error)
- [ ] "Remove attachment" (button)

#### Search in Chat
- [ ] "Search messages..." (input placeholder)
- [ ] "{count} results" (search result counter)
- [ ] "No results found" (empty search)
- [ ] "Clear search" (button)

#### Tokens/Cost Display
- [ ] "Tokens used: {count}" (metric)
- [ ] "Estimated cost: ${amount}" (metric)
- [ ] "Input: {count} / Output: {count}" (token breakdown)

#### Keyboard Shortcuts Help
- [ ] "Keyboard Shortcuts" (modal title)
- [ ] "Ctrl/Cmd + Enter" - "Send message" (shortcut)
- [ ] "Ctrl/Cmd + K" - "New chat" (shortcut)
- [ ] "Ctrl/Cmd + /" - "Toggle shortcuts" (shortcut)
- [ ] "Esc" - "Cancel generation" (shortcut)

#### Continuation/Rate Limiting
- [ ] "Response paused due to rate limit" (warning)
- [ ] "Continue in {time}..." (countdown)
- [ ] "Continue Now" (button)
- [ ] "Waiting for rate limit..." (status)

#### Code Blocks
- [ ] "Copy code" (button in code block)
- [ ] "Run code" (button - if execution enabled)
- [ ] "Language: {lang}" (code language label)
- [ ] "Code copied!" (toast)

#### Citations/Sources
- [ ] "Sources" (section title)
- [ ] "Source {number}" (source label)
- [ ] "View source" (link)
- [ ] "From web search" (source type)
- [ ] "From knowledge base" (source type)

**Estimated Translation Keys**: 150-200+

---

## Additional Components (Lower Priority)

### 5. GitHubLink Component
- [ ] "View on GitHub" (link text)
- [ ] "Fork on GitHub" (link text)
- [ ] "Star on GitHub" (link text)

**Estimated Keys**: 3-5

### 6. Header/Navigation
- [ ] "Research Agent" (app name)
- [ ] "Chat" (nav link)
- [ ] "Planning" (nav link)
- [ ] "Billing" (nav link)
- [ ] "Settings" (nav link)
- [ ] "Sign Out" (button)

**Estimated Keys**: 6-8

### 7. Toast Notifications (Global)
- [ ] "Success!" (generic success)
- [ ] "Error!" (generic error)
- [ ] "Warning!" (generic warning)
- [ ] "Info" (generic info)

**Estimated Keys**: 4

---

## Translation Key Organization Strategy

### Proposed Namespace Structure

```json
{
  "common": { /* Common UI elements */ },
  "auth": { /* Authentication */ },
  "chat": { /* Chat interface */ },
  "planning": { /* Planning dialog */ },
  "settings": {
    "general": { /* General settings tab */ },
    "provider": { /* Provider settings */ },
    "cloud": { /* Cloud storage */ },
    "tools": { /* Tools configuration */ },
    "proxy": { /* Proxy settings */ },
    "location": { /* Location services */ },
    "tts": { /* Text-to-speech */ },
    "rag": { /* RAG configuration */ }
  },
  "billing": { /* Billing page */ },
  "languages": { /* Language names */ },
  "errors": { /* Error messages */ },
  "validation": { /* Validation messages */ },
  "notifications": { /* Toast/notification messages */ },
  "tooltips": { /* Help text and tooltips */ }
}
```

---

## Implementation Strategy

### Phase 1: High-Impact Components (Priority Order)
1. **ChatTab** - Main user interface (~150-200 keys)
   - Most visible to users
   - Highest usage frequency
   - Complex with many states and messages

2. **SettingsModal** - Primary configuration (~80-100 keys)
   - Critical for user setup
   - Multiple tabs need systematic approach
   - Many repeated patterns (labels, help text)

### Phase 2: Supporting Components
3. **PlanningDialog** (~50-60 keys)
   - Important feature but less frequent use
   - Clear structure and scope

4. **BillingPage** (~35-40 keys)
   - Important but viewed less frequently
   - Mostly metrics and labels

### Phase 3: Minor Components
5. **GitHubLink, Header, Notifications** (~15-20 keys total)
   - Quick wins
   - Small scope

---

## Quality Assurance Checklist

### Per Component
- [ ] All visible strings converted to t()
- [ ] All aria-labels and accessibility text translated
- [ ] All placeholder text translated
- [ ] All button labels translated
- [ ] All error messages translated
- [ ] All help/tooltip text translated

### Per Language
- [ ] English (en) - Complete base translations
- [ ] Spanish (es) - Professional translations
- [ ] French (fr) - Professional translations
- [ ] German (de) - Professional translations
- [ ] Dutch (nl) - Professional translations
- [ ] Portuguese (pt) - Professional translations
- [ ] Russian (ru) - Professional translations
- [ ] Chinese (zh) - Professional translations
- [ ] Japanese (ja) - Professional translations
- [ ] Arabic (ar) - Professional translations + RTL testing

### Testing
- [ ] Language switching works without page reload
- [ ] All strings render correctly in all languages
- [ ] RTL languages (Arabic) display correctly
- [ ] No untranslated strings visible
- [ ] No missing translation keys in console
- [ ] Long translations don't break layouts
- [ ] Special characters render correctly (Chinese, Arabic, Cyrillic)

---

## Estimated Total Translation Keys

| Component | Keys | Status |
|-----------|------|--------|
| LoginScreen | 3 | ✅ Complete |
| SettingsModal | 80-100 | 📋 Planned |
| ChatTab | 150-200 | 📋 Planned |
| PlanningDialog | 50-60 | 📋 Planned |
| BillingPage | 35-40 | 📋 Planned |
| Minor Components | 15-20 | 📋 Planned |
| **TOTAL** | **333-423** | **In Progress** |

---

## Next Steps

1. ✅ Review and approve this inventory
2. ⏳ Implement ChatTab translations (highest priority)
3. ⏳ Implement SettingsModal translations
4. ⏳ Implement remaining components
5. ⏳ Update all 10 language files with new keys
6. ⏳ Test all languages thoroughly
7. ⏳ Deploy to production

---

## Notes

- **English (en)** will serve as the base translation file
- All other languages will be translated from English
- Professional translation review recommended for production deployment
- Consider using translation services (DeepL, Google Translate) for initial drafts
- Native speaker review recommended for final translations
- RTL (Right-to-Left) testing critical for Arabic
- CJK (Chinese, Japanese, Korean) character rendering needs verification
- Consider context-specific translations (e.g., "Save" as button vs. "Save" as noun)

---

**Document Status**: Planning Complete - Ready for Implementation  
**Last Updated**: October 26, 2025
