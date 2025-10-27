# ENV File Compression Plan

## Executive Summary

This plan addresses compression of environment variables to reduce AWS Lambda deployment size. The current `.env.example` file is 379 lines with variable names averaging 30+ characters. This plan provides a systematic approach to:

1. **Shorten all variable names** to minimal length (60-70% reduction)
2. **Update all code references** across backend, frontend, and scripts
3. **Filter Lambda-needed variables** from UI-only variables
4. **Automate the entire process** to avoid context exhaustion

## 1. Current State Analysis

### 1.1. Environment File Statistics

- **File**: `.env.example` (379 lines)
- **Estimated Variables**: ~80-100 distinct variables (including indexed providers)
- **Average Variable Name Length**: 30-35 characters
- **Current Size**: Approaching AWS Lambda's 4KB limit

### 1.2. Variable Categories

| Category | Current Prefix | Example | Count | Lambda? | UI? |
|----------|---------------|---------|-------|---------|-----|
| Authentication | `ALLOWED_`, `ACCESS_` | `ALLOWED_EMAILS` | 2 | ✅ | ❌ |
| Google OAuth | `GOOGLE_CLIENT_`, `OAUTH_` | `GOOGLE_CLIENT_ID` | 3 | ✅ | ✅ |
| Proxy | `WEBSHARE_PROXY_` | `WEBSHARE_PROXY_USERNAME` | 2 | ✅ | ❌ |
| Provider Config | `LLAMDA_LLM_PROXY_PROVIDER_` | `LLAMDA_LLM_PROXY_PROVIDER_TYPE_0` | ~60 | ✅ | ❌ |
| Tool Config | `MAX_`, `DISABLE_`, `MEDIA_` | `MAX_TOOL_ITERATIONS` | 3 | ✅ | ❌ |
| Features | `ENABLE_`, `USE_`, `PUPPETEER_` | `ENABLE_GUARDRAILS` | 3 | ✅ | ❌ |
| Models | `GROQ_`, `OPENAI_`, `REASONING_` | `GROQ_MODEL` | 5 | ✅ | ❌ |
| API Keys | `*_API_KEY`, `*_API_TOKEN` | `OPENAI_API_KEY` | 6 | ✅ | ❌ |
| Image Gen Flags | `ENABLE_IMAGE_GENERATION_` | `ENABLE_IMAGE_GENERATION_OPENAI` | 4 | ✅ | ❌ |
| Circuit Breaker | `CIRCUIT_BREAKER_` | `CIRCUIT_BREAKER_FAILURE_THRESHOLD` | 2 | ✅ | ❌ |
| Google Sheets | `GOOGLE_SHEETS_*` | `GOOGLE_SHEETS_LOG_SPREADSHEET_ID` | 5 | ✅ | ❌ |
| PayPal | `PAYPAL_*`, `MIN_CREDIT_` | `PAYPAL_CLIENT_ID` | 5 | ✅ | ❌ |
| AWS | `AWS_*` | `AWS_LAMBDA_FUNCTION_MEMORY_SIZE` | 1 | ✅ | ❌ |
| RAG/Database | `LIBSQL_`, `RAG_` | `LIBSQL_URL` | 4 | ✅ | ❌ |
| Token Limits | `MAX_TOKENS_*` | `MAX_TOKENS_PLANNING` | 7 | ✅ | ❌ |
| Cache | `CACHE_TTL_*` | `CACHE_TTL_SEARCH` | 5 | ✅ | ❌ |
| Profit Margins | `*_PROFIT_MARGIN` | `LLM_PROFIT_MARGIN` | 2 | ✅ | ❌ |
| Development | `LOCAL_LAMBDA`, `NODE_ENV` | `LOCAL_LAMBDA` | 2 | ✅ | ❌ |
| UI/Frontend | `VITE_*` | `VITE_API_BASE` | 5 | ❌ | ✅ |

**Total**: ~130 variables (including indexed providers)

### 1.3. Code Reference Locations

**Backend (Lambda - `process.env.*`)**:
- `src/endpoints/*.js` - 15 files
- `src/services/*.js` - 2 files
- `src/utils/*.js` - 6 files
- `src/tools/*.js` - 2 files
- `src/scrapers/*.js` - 7 files
- `src/rag/*.js` - 3 files
- `src/config/*.js` - 4 files
- `src/*.js` - 12 files
- **Total**: ~200+ references

**Frontend (UI - `import.meta.env.*`)**:
- `ui-new/src/components/*.tsx` - 7 files
- `ui-new/src/utils/*.ts` - 4 files
- `ui-new/src/contexts/*.tsx` - 3 files
- `ui-new/src/services/*.ts` - 2 files
- `ui-new/src/*.tsx` - 2 files
- **Total**: ~50+ references

**Deployment Scripts**:
- `scripts/deploy-env.sh` - Reads ALL variables from `.env`
- `scripts/run-local-lambda.js` - Uses `LOCAL_LAMBDA_PORT`, `NODE_ENV`, `USE_HTTPS`
- `scripts/build-docs.sh` - Uses `LAMBDA_URL` (derived from config)
- `scripts/*.js` - Various Google Sheets scripts
- **Total**: ~30+ references

## 2. Variable Renaming Strategy

### 2.1. Naming Principles

1. **Maximize Compression**: Reduce character count by 60-70%
2. **Maintain Clarity**: Keep enough context for debugging
3. **Preserve Grouping**: Use prefixes to group related variables
4. **Avoid Collisions**: Ensure no duplicate shortened names

### 2.2. Compression Patterns

| Pattern | Old Example | New Example | Savings |
|---------|-------------|-------------|---------|
| **Remove Redundancy** | `LLAMDA_LLM_PROXY_PROVIDER_TYPE_0` | `P_T0` | 32 → 4 (87%) |
| **Abbreviate Words** | `ALLOWED_EMAILS` | `ALLOW_EM` | 14 → 8 (43%) |
| **Shorten Prefixes** | `GOOGLE_CLIENT_ID` | `GGL_CID` | 16 → 7 (56%) |
| **Use Single Letters** | `MAX_TOOL_ITERATIONS` | `MAX_ITER` | 18 → 8 (56%) |
| **Drop Redundant Parts** | `ENABLE_IMAGE_GENERATION_OPENAI` | `IMG_OPENAI` | 31 → 10 (68%) |
| **Indexed Variables** | `LLAMDA_LLM_PROXY_PROVIDER_KEY_0` | `P_K0` | 30 → 4 (87%) |

### 2.3. Complete Variable Mapping

```javascript
{
  // Authentication & Access (2 variables)
  "ALLOWED_EMAILS": "ALLOW_EM",
  "ACCESS_SECRET": "ACC_SEC",

  // Google OAuth (3 variables)
  "GOOGLE_CLIENT_ID": "GGL_CID",
  "GOOGLE_CLIENT_SECRET": "GGL_SEC",
  "OAUTH_REDIRECT_URI": "OAUTH_URI",

  // Proxy (2 variables)
  "WEBSHARE_PROXY_USERNAME": "PXY_USER",
  "WEBSHARE_PROXY_PASSWORD": "PXY_PASS",

  // Provider Configuration (8 fields × N providers = ~60 variables)
  "LLAMDA_LLM_PROXY_PROVIDER_TYPE_": "P_T",      // + index
  "LLAMDA_LLM_PROXY_PROVIDER_KEY_": "P_K",       // + index
  "LLAMDA_LLM_PROXY_PROVIDER_ENDPOINT_": "P_E",  // + index
  "LLAMDA_LLM_PROXY_PROVIDER_MODEL_": "P_M",     // + index
  "LLAMDA_LLM_PROXY_PROVIDER_RATE_LIMIT_": "P_RL", // + index
  "LLAMDA_LLM_PROXY_PROVIDER_ALLOWED_MODELS_": "P_AM", // + index
  "LLAMDA_LLM_PROXY_PROVIDER_IMAGE_MAX_QUALITY_": "P_IQ", // + index
  "LLAMDA_LLM_PROXY_PROVIDER_PRIORITY_": "P_P",  // + index

  // Tool Configuration (3 variables)
  "MAX_TOOL_ITERATIONS": "MAX_ITER",
  "DISABLE_YOUTUBE_TRANSCRIPTION": "NO_YT_TRANS",
  "MEDIA_DOWNLOAD_TIMEOUT": "MED_TIMEOUT",

  // Features (3 variables)
  "ENABLE_GUARDRAILS": "EN_GUARD",
  "USE_PUPPETEER": "USE_PPT",
  "PUPPETEER_LAMBDA_ARN": "PPT_ARN",

  // Model Configs (5 variables)
  "GROQ_MODEL": "GROQ_MDL",
  "OPENAI_MODEL": "OPENAI_MDL",
  "GROQ_REASONING_MODELS": "GROQ_REASON",
  "REASONING_EFFORT": "REASON_EFF",
  "OPENAI_API_BASE": "OPENAI_BASE",

  // API Keys (6 variables)
  "OPENAI_API_KEY": "OPENAI_KEY",
  "GROQ_API_KEY": "GROQ_KEY",
  "GEMINI_API_KEY": "GEMINI_KEY",
  "TOGETHER_API_KEY": "TOGETHER_KEY",
  "REPLICATE_API_TOKEN": "REPLICATE_KEY",
  "ELEVENLABS_API_KEY": "ELEVENLABS_KEY",

  // Image Generation Flags (4 variables)
  "ENABLE_IMAGE_GENERATION_OPENAI": "IMG_OPENAI",
  "ENABLE_IMAGE_GENERATION_TOGETHER": "IMG_TOGETHER",
  "ENABLE_IMAGE_GENERATION_REPLICATE": "IMG_REPLICATE",
  "ENABLE_IMAGE_GENERATION_GEMINI": "IMG_GEMINI",

  // Circuit Breaker (2 variables)
  "CIRCUIT_BREAKER_FAILURE_THRESHOLD": "CB_THRESH",
  "CIRCUIT_BREAKER_TIMEOUT_MS": "CB_TIMEOUT",

  // Google Sheets Logging (5 variables)
  "GOOGLE_SHEETS_LOG_SPREADSHEET_ID": "GS_SHEET_ID",
  "GOOGLE_SHEETS_LOG_SPREADSHEET_IDS": "GS_SHEET_IDS",
  "GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL": "GS_EMAIL",
  "GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY": "GS_KEY",
  "GOOGLE_SHEETS_LOG_SHEET_NAME": "GS_NAME",
  "GOOGLE_SHEETS_CREDENTIALS": "GS_CREDS",
  "GOOGLE_SHEETS_SPREADSHEET_ID": "GS_ID",

  // PayPal (5 variables)
  "PAYPAL_CLIENT_ID": "PP_CID",
  "PAYPAL_CLIENT_SECRET": "PP_SEC",
  "PAYPAL_MODE": "PP_MODE",
  "MIN_CREDIT_PURCHASE": "MIN_CREDIT",
  "PAYPAL_SUCCESS_URL": "PP_SUCCESS",
  "PAYPAL_CANCEL_URL": "PP_CANCEL",

  // AWS (1 variable)
  "AWS_LAMBDA_FUNCTION_MEMORY_SIZE": "AWS_MEM",
  "AWS_LAMBDA_FUNCTION_NAME": "AWS_FN",
  "AWS_EXECUTION_ENV": "AWS_EXEC",
  "AWS_REGION": "AWS_RGN",

  // RAG/Database (4 variables)
  "LIBSQL_URL": "DB_URL",
  "LIBSQL_AUTH_TOKEN": "DB_TOKEN",
  "USE_LIBSQL": "USE_DB",
  "RAG_EMBEDDING_MODEL": "RAG_MDL",
  "RAG_EMBEDDING_PROVIDER": "RAG_PROV",

  // Token Limits (7 variables)
  "MAX_TOKENS_PLANNING": "TOK_PLAN",
  "MAX_TOKENS_TOOL_SYNTHESIS": "TOK_SYNTH",
  "MAX_TOKENS_LOW_COMPLEXITY": "TOK_LOW",
  "MAX_TOKENS_MEDIUM_COMPLEXITY": "TOK_MED",
  "MAX_TOKENS_HIGH_COMPLEXITY": "TOK_HIGH",
  "MAX_TOKENS_MATH_RESPONSE": "TOK_MATH",
  "MAX_TOKENS_FINAL_RESPONSE": "TOK_FINAL",

  // Cache (5 variables)
  "CACHE_TTL_SEARCH": "CACHE_SRCH",
  "CACHE_TTL_TRANSCRIPTIONS": "CACHE_TRANS",
  "CACHE_TTL_SCRAPES": "CACHE_SCRP",
  "CACHE_TTL_RAG_QUERIES": "CACHE_RAG",
  "CACHE_TTL_RAG_EMBEDDINGS": "CACHE_EMB",

  // Profit Margins (3 variables)
  "LLM_PROFIT_MARGIN": "LLM_MARGIN",
  "LAMBDA_PROFIT_MARGIN": "LAM_MARGIN",
  "DISABLE_CREDIT_CHECKS": "NO_CREDIT_CHK",

  // Development (2 variables)
  "LOCAL_LAMBDA": "LOCAL",
  "LOCAL_LAMBDA_PORT": "LOCAL_PORT",
  "NODE_ENV": "ENV",

  // System Prompts (3 variables)
  "SYSTEM_PROMPT_SEARCH": "SYS_SRCH",
  "SYSTEM_PROMPT_DIGEST_ANALYST": "SYS_DIGEST",
  "FINAL_TEMPLATE": "TPL_FINAL",

  // Other (5 variables)
  "TAVILY_API_KEY": "TAVILY_KEY",
  "PYTHON_VENV_PATH": "PYTHON_VENV",
  "HEADLESS": "HEADLESS",
  "DEVTOOLS": "DEVTOOLS",
  "SLOW_MO": "SLOWMO",
  "CREDIT_CACHE_TTL_MS": "CR_TTL",
  "CREDIT_CACHE_MAX_SIZE": "CR_MAX",
  "MAX_TODO_AUTO_ITERATIONS": "MAX_TODO",

  // UI/Frontend (VITE_ prefix remains for Vite compatibility)
  "VITE_API_BASE": "VITE_API",
  "VITE_LAMBDA_URL": "VITE_LAM",
  "VITE_LOCAL_LAMBDA_URL": "VITE_LOCAL",
  "VITE_GOOGLE_CLIENT_ID": "VITE_GGL_CID",
  "VITE_PAYPAL_CLIENT_ID": "VITE_PP_CID",
  "VITE_API_ENDPOINT": "VITE_EP",
  "VITE_BACKEND_URL": "VITE_BACK"
}
```

**Total Estimated Savings**: 
- Old: ~130 variables × 30 avg chars = ~3,900 characters
- New: ~130 variables × 10 avg chars = ~1,300 characters
- **Reduction**: ~67% (2,600 characters saved)

## 3. Lambda vs UI Variable Separation

### 3.1. Lambda-Only Variables (Deploy to AWS Lambda)

```javascript
[
  "ALLOW_EM",          // ALLOWED_EMAILS
  "ACC_SEC",           // ACCESS_SECRET
  "GGL_CID",           // GOOGLE_CLIENT_ID
  "GGL_SEC",           // GOOGLE_CLIENT_SECRET
  "OAUTH_URI",         // OAUTH_REDIRECT_URI
  "PXY_USER",          // WEBSHARE_PROXY_USERNAME
  "PXY_PASS",          // WEBSHARE_PROXY_PASSWORD
  "P_T*",              // All provider TYPE variables
  "P_K*",              // All provider KEY variables
  "P_E*",              // All provider ENDPOINT variables
  "P_M*",              // All provider MODEL variables
  "P_RL*",             // All provider RATE_LIMIT variables
  "P_AM*",             // All provider ALLOWED_MODELS variables
  "P_IQ*",             // All provider IMAGE_MAX_QUALITY variables
  "P_P*",              // All provider PRIORITY variables
  "MAX_ITER",          // MAX_TOOL_ITERATIONS
  "NO_YT_TRANS",       // DISABLE_YOUTUBE_TRANSCRIPTION
  "MED_TIMEOUT",       // MEDIA_DOWNLOAD_TIMEOUT
  "EN_GUARD",          // ENABLE_GUARDRAILS
  "USE_PPT",           // USE_PUPPETEER
  "PPT_ARN",           // PUPPETEER_LAMBDA_ARN
  "GROQ_MDL",          // GROQ_MODEL
  "OPENAI_MDL",        // OPENAI_MODEL
  "GROQ_REASON",       // GROQ_REASONING_MODELS
  "REASON_EFF",        // REASONING_EFFORT
  "OPENAI_BASE",       // OPENAI_API_BASE
  "OPENAI_KEY",        // OPENAI_API_KEY
  "GROQ_KEY",          // GROQ_API_KEY
  "GEMINI_KEY",        // GEMINI_API_KEY
  "TOGETHER_KEY",      // TOGETHER_API_KEY
  "REPLICATE_KEY",     // REPLICATE_API_TOKEN
  "ELEVENLABS_KEY",    // ELEVENLABS_API_KEY
  "IMG_OPENAI",        // ENABLE_IMAGE_GENERATION_OPENAI
  "IMG_TOGETHER",      // ENABLE_IMAGE_GENERATION_TOGETHER
  "IMG_REPLICATE",     // ENABLE_IMAGE_GENERATION_REPLICATE
  "IMG_GEMINI",        // ENABLE_IMAGE_GENERATION_GEMINI
  "CB_THRESH",         // CIRCUIT_BREAKER_FAILURE_THRESHOLD
  "CB_TIMEOUT",        // CIRCUIT_BREAKER_TIMEOUT_MS
  "GS_SHEET_ID",       // GOOGLE_SHEETS_LOG_SPREADSHEET_ID
  "GS_SHEET_IDS",      // GOOGLE_SHEETS_LOG_SPREADSHEET_IDS
  "GS_EMAIL",          // GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL
  "GS_KEY",            // GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY
  "GS_NAME",           // GOOGLE_SHEETS_LOG_SHEET_NAME
  "GS_CREDS",          // GOOGLE_SHEETS_CREDENTIALS
  "GS_ID",             // GOOGLE_SHEETS_SPREADSHEET_ID
  "PP_CID",            // PAYPAL_CLIENT_ID
  "PP_SEC",            // PAYPAL_CLIENT_SECRET
  "PP_MODE",           // PAYPAL_MODE
  "MIN_CREDIT",        // MIN_CREDIT_PURCHASE
  "PP_SUCCESS",        // PAYPAL_SUCCESS_URL
  "PP_CANCEL",         // PAYPAL_CANCEL_URL
  "AWS_MEM",           // AWS_LAMBDA_FUNCTION_MEMORY_SIZE
  "DB_URL",            // LIBSQL_URL
  "DB_TOKEN",          // LIBSQL_AUTH_TOKEN
  "USE_DB",            // USE_LIBSQL
  "RAG_MDL",           // RAG_EMBEDDING_MODEL
  "RAG_PROV",          // RAG_EMBEDDING_PROVIDER
  "TOK_PLAN",          // MAX_TOKENS_PLANNING
  "TOK_SYNTH",         // MAX_TOKENS_TOOL_SYNTHESIS
  "TOK_LOW",           // MAX_TOKENS_LOW_COMPLEXITY
  "TOK_MED",           // MAX_TOKENS_MEDIUM_COMPLEXITY
  "TOK_HIGH",          // MAX_TOKENS_HIGH_COMPLEXITY
  "TOK_MATH",          // MAX_TOKENS_MATH_RESPONSE
  "TOK_FINAL",         // MAX_TOKENS_FINAL_RESPONSE
  "CACHE_SRCH",        // CACHE_TTL_SEARCH
  "CACHE_TRANS",       // CACHE_TTL_TRANSCRIPTIONS
  "CACHE_SCRP",        // CACHE_TTL_SCRAPES
  "CACHE_RAG",         // CACHE_TTL_RAG_QUERIES
  "CACHE_EMB",         // CACHE_TTL_RAG_EMBEDDINGS
  "LLM_MARGIN",        // LLM_PROFIT_MARGIN
  "LAM_MARGIN",        // LAMBDA_PROFIT_MARGIN
  "NO_CREDIT_CHK",     // DISABLE_CREDIT_CHECKS
  "LOCAL",             // LOCAL_LAMBDA
  "ENV",               // NODE_ENV
  "SYS_SRCH",          // SYSTEM_PROMPT_SEARCH
  "SYS_DIGEST",        // SYSTEM_PROMPT_DIGEST_ANALYST
  "TPL_FINAL",         // FINAL_TEMPLATE
  "TAVILY_KEY",        // TAVILY_API_KEY
  "PYTHON_VENV",       // PYTHON_VENV_PATH
  "CR_TTL",            // CREDIT_CACHE_TTL_MS
  "CR_MAX",            // CREDIT_CACHE_MAX_SIZE
  "MAX_TODO"           // MAX_TODO_AUTO_ITERATIONS
]
```

**Total Lambda Variables**: ~80-100 (including indexed providers)

### 3.2. UI-Only Variables (NOT deployed to Lambda)

```javascript
[
  "VITE_API",          // VITE_API_BASE
  "VITE_LAM",          // VITE_LAMBDA_URL
  "VITE_LOCAL",        // VITE_LOCAL_LAMBDA_URL
  "VITE_GGL_CID",      // VITE_GOOGLE_CLIENT_ID
  "VITE_PP_CID",       // VITE_PAYPAL_CLIENT_ID
  "VITE_EP",           // VITE_API_ENDPOINT
  "VITE_BACK"          // VITE_BACKEND_URL
]
```

**Total UI Variables**: 7

### 3.3. Shared Variables (Both Lambda and UI)

```javascript
[
  "GGL_CID"            // GOOGLE_CLIENT_ID (OAuth)
]
```

**Note**: `GOOGLE_CLIENT_ID` is used in both backend (auth verification) and frontend (OAuth flow), but accessed differently:
- Backend: `process.env.GGL_CID`
- Frontend: `import.meta.env.VITE_GGL_CID`

**Solution**: Keep separate variables with different prefixes:
- Lambda: `GGL_CID` (from `GOOGLE_CLIENT_ID`)
- UI: `VITE_GGL_CID` (from `VITE_GOOGLE_CLIENT_ID`)

## 4. Automated Implementation Script

### 4.1. Script Design: `scripts/compress-env.js`

**Purpose**: Automate the entire renaming process to avoid context exhaustion.

**Features**:
1. Read variable mapping from JSON
2. Search and replace in all code files
3. Update `.env.example` file
4. Create backup before changes
5. Validate all replacements
6. Generate change report

**Pseudocode**:

```javascript
const fs = require('fs');
const path = require('path');
const glob = require('glob');

// 1. Load variable mapping
const VARIABLE_MAP = require('./env-variable-map.json');

// 2. Define file patterns to search
const FILE_PATTERNS = [
  'src/**/*.js',
  'ui-new/src/**/*.{ts,tsx}',
  'scripts/**/*.{sh,js}',
  '.env.example'
];

// 3. Backup original files
function createBackup() {
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const backupDir = `.backup-${timestamp}`;
  fs.mkdirSync(backupDir, { recursive: true });
  
  FILE_PATTERNS.forEach(pattern => {
    glob.sync(pattern).forEach(file => {
      const dest = path.join(backupDir, file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(file, dest);
    });
  });
  
  console.log(`✅ Backup created: ${backupDir}`);
  return backupDir;
}

// 4. Search and replace in files
function replaceInFiles(oldVar, newVar) {
  const results = { files: [], occurrences: 0 };
  
  FILE_PATTERNS.forEach(pattern => {
    glob.sync(pattern).forEach(file => {
      let content = fs.readFileSync(file, 'utf8');
      const originalContent = content;
      
      // Backend: process.env.OLD_VAR → process.env.NEW_VAR
      const backendRegex = new RegExp(`process\\.env\\.${oldVar}`, 'g');
      content = content.replace(backendRegex, `process.env.${newVar}`);
      
      // Frontend: import.meta.env.OLD_VAR → import.meta.env.NEW_VAR
      const frontendRegex = new RegExp(`import\\.meta\\.env\\.${oldVar}`, 'g');
      content = content.replace(frontendRegex, `import.meta.env.${newVar}`);
      
      // .env file: OLD_VAR= → NEW_VAR=
      if (file.endsWith('.env') || file.endsWith('.env.example')) {
        const envRegex = new RegExp(`^${oldVar}=`, 'gm');
        content = content.replace(envRegex, `${newVar}=`);
        
        // Also update comments
        const commentRegex = new RegExp(`# ${oldVar}`, 'g');
        content = content.replace(commentRegex, `# ${newVar}`);
      }
      
      // Shell scripts: ${OLD_VAR} → ${NEW_VAR}
      if (file.endsWith('.sh')) {
        const shellRegex = new RegExp(`\\$\\{${oldVar}\\}`, 'g');
        content = content.replace(shellRegex, `\${${newVar}}`);
        
        const shellRegex2 = new RegExp(`\\$${oldVar}\\b`, 'g');
        content = content.replace(shellRegex2, `$${newVar}`);
      }
      
      if (content !== originalContent) {
        fs.writeFileSync(file, content, 'utf8');
        const count = (originalContent.match(new RegExp(oldVar, 'g')) || []).length;
        results.files.push(file);
        results.occurrences += count;
      }
    });
  });
  
  return results;
}

// 5. Main execution
async function main() {
  console.log('🔧 ENV Variable Compression Tool');
  console.log('=================================\n');
  
  // Create backup
  const backupDir = createBackup();
  
  // Track changes
  const changes = [];
  let totalFiles = new Set();
  let totalOccurrences = 0;
  
  // Process each variable
  Object.entries(VARIABLE_MAP).forEach(([oldVar, newVar]) => {
    console.log(`📝 Renaming: ${oldVar} → ${newVar}`);
    
    const result = replaceInFiles(oldVar, newVar);
    
    if (result.occurrences > 0) {
      console.log(`   ✅ Updated ${result.occurrences} occurrences in ${result.files.length} files`);
      changes.push({ oldVar, newVar, ...result });
      result.files.forEach(f => totalFiles.add(f));
      totalOccurrences += result.occurrences;
    } else {
      console.log(`   ⚠️  No occurrences found`);
    }
  });
  
  // Generate report
  console.log('\n📊 Summary Report');
  console.log('=================');
  console.log(`Total Variables Renamed: ${changes.length}`);
  console.log(`Total Files Modified: ${totalFiles.size}`);
  console.log(`Total Occurrences Replaced: ${totalOccurrences}`);
  console.log(`Backup Directory: ${backupDir}`);
  
  // Save detailed report
  const reportPath = `env-compression-report-${Date.now()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(changes, null, 2));
  console.log(`\n📄 Detailed report saved: ${reportPath}`);
  
  // Verification
  console.log('\n🔍 Running verification...');
  verifyNoOldVariables();
}

// 6. Verification: Ensure no old variable names remain
function verifyNoOldVariables() {
  const errors = [];
  
  Object.keys(VARIABLE_MAP).forEach(oldVar => {
    FILE_PATTERNS.forEach(pattern => {
      glob.sync(pattern).forEach(file => {
        const content = fs.readFileSync(file, 'utf8');
        
        // Skip VITE_ variables in UI files (they must keep VITE_ prefix)
        if (oldVar.startsWith('VITE_') && file.includes('ui-new/')) {
          return;
        }
        
        if (content.includes(oldVar)) {
          errors.push({ file, variable: oldVar });
        }
      });
    });
  });
  
  if (errors.length > 0) {
    console.log('❌ Verification failed! Old variables still found:');
    errors.forEach(e => console.log(`   ${e.file}: ${e.variable}`));
  } else {
    console.log('✅ Verification passed! All variables renamed successfully.');
  }
}

// Run
main().catch(console.error);
```

### 4.2. Variable Mapping File: `scripts/env-variable-map.json`

```json
{
  "ALLOWED_EMAILS": "ALLOW_EM",
  "ACCESS_SECRET": "ACC_SEC",
  "GOOGLE_CLIENT_ID": "GGL_CID",
  "GOOGLE_CLIENT_SECRET": "GGL_SEC",
  "OAUTH_REDIRECT_URI": "OAUTH_URI",
  "WEBSHARE_PROXY_USERNAME": "PXY_USER",
  "WEBSHARE_PROXY_PASSWORD": "PXY_PASS",
  "MAX_TOOL_ITERATIONS": "MAX_ITER",
  "DISABLE_YOUTUBE_TRANSCRIPTION": "NO_YT_TRANS",
  "MEDIA_DOWNLOAD_TIMEOUT": "MED_TIMEOUT",
  "ENABLE_GUARDRAILS": "EN_GUARD",
  "USE_PUPPETEER": "USE_PPT",
  "PUPPETEER_LAMBDA_ARN": "PPT_ARN",
  "GROQ_MODEL": "GROQ_MDL",
  "OPENAI_MODEL": "OPENAI_MDL",
  "GROQ_REASONING_MODELS": "GROQ_REASON",
  "REASONING_EFFORT": "REASON_EFF",
  "OPENAI_API_BASE": "OPENAI_BASE",
  "OPENAI_API_KEY": "OPENAI_KEY",
  "GROQ_API_KEY": "GROQ_KEY",
  "GEMINI_API_KEY": "GEMINI_KEY",
  "TOGETHER_API_KEY": "TOGETHER_KEY",
  "REPLICATE_API_TOKEN": "REPLICATE_KEY",
  "ELEVENLABS_API_KEY": "ELEVENLABS_KEY",
  "ENABLE_IMAGE_GENERATION_OPENAI": "IMG_OPENAI",
  "ENABLE_IMAGE_GENERATION_TOGETHER": "IMG_TOGETHER",
  "ENABLE_IMAGE_GENERATION_REPLICATE": "IMG_REPLICATE",
  "ENABLE_IMAGE_GENERATION_GEMINI": "IMG_GEMINI",
  "CIRCUIT_BREAKER_FAILURE_THRESHOLD": "CB_THRESH",
  "CIRCUIT_BREAKER_TIMEOUT_MS": "CB_TIMEOUT",
  "GOOGLE_SHEETS_LOG_SPREADSHEET_ID": "GS_SHEET_ID",
  "GOOGLE_SHEETS_LOG_SPREADSHEET_IDS": "GS_SHEET_IDS",
  "GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL": "GS_EMAIL",
  "GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY": "GS_KEY",
  "GOOGLE_SHEETS_LOG_SHEET_NAME": "GS_NAME",
  "GOOGLE_SHEETS_CREDENTIALS": "GS_CREDS",
  "GOOGLE_SHEETS_SPREADSHEET_ID": "GS_ID",
  "PAYPAL_CLIENT_ID": "PP_CID",
  "PAYPAL_CLIENT_SECRET": "PP_SEC",
  "PAYPAL_MODE": "PP_MODE",
  "MIN_CREDIT_PURCHASE": "MIN_CREDIT",
  "PAYPAL_SUCCESS_URL": "PP_SUCCESS",
  "PAYPAL_CANCEL_URL": "PP_CANCEL",
  "AWS_LAMBDA_FUNCTION_MEMORY_SIZE": "AWS_MEM",
  "AWS_LAMBDA_FUNCTION_NAME": "AWS_FN",
  "AWS_EXECUTION_ENV": "AWS_EXEC",
  "AWS_REGION": "AWS_RGN",
  "LIBSQL_URL": "DB_URL",
  "LIBSQL_AUTH_TOKEN": "DB_TOKEN",
  "USE_LIBSQL": "USE_DB",
  "RAG_EMBEDDING_MODEL": "RAG_MDL",
  "RAG_EMBEDDING_PROVIDER": "RAG_PROV",
  "MAX_TOKENS_PLANNING": "TOK_PLAN",
  "MAX_TOKENS_TOOL_SYNTHESIS": "TOK_SYNTH",
  "MAX_TOKENS_LOW_COMPLEXITY": "TOK_LOW",
  "MAX_TOKENS_MEDIUM_COMPLEXITY": "TOK_MED",
  "MAX_TOKENS_HIGH_COMPLEXITY": "TOK_HIGH",
  "MAX_TOKENS_MATH_RESPONSE": "TOK_MATH",
  "MAX_TOKENS_FINAL_RESPONSE": "TOK_FINAL",
  "CACHE_TTL_SEARCH": "CACHE_SRCH",
  "CACHE_TTL_TRANSCRIPTIONS": "CACHE_TRANS",
  "CACHE_TTL_SCRAPES": "CACHE_SCRP",
  "CACHE_TTL_RAG_QUERIES": "CACHE_RAG",
  "CACHE_TTL_RAG_EMBEDDINGS": "CACHE_EMB",
  "LLM_PROFIT_MARGIN": "LLM_MARGIN",
  "LAMBDA_PROFIT_MARGIN": "LAM_MARGIN",
  "DISABLE_CREDIT_CHECKS": "NO_CREDIT_CHK",
  "LOCAL_LAMBDA": "LOCAL",
  "LOCAL_LAMBDA_PORT": "LOCAL_PORT",
  "NODE_ENV": "ENV",
  "SYSTEM_PROMPT_SEARCH": "SYS_SRCH",
  "SYSTEM_PROMPT_DIGEST_ANALYST": "SYS_DIGEST",
  "FINAL_TEMPLATE": "TPL_FINAL",
  "TAVILY_API_KEY": "TAVILY_KEY",
  "PYTHON_VENV_PATH": "PYTHON_VENV",
  "HEADLESS": "HEADLESS",
  "DEVTOOLS": "DEVTOOLS",
  "SLOW_MO": "SLOWMO",
  "CREDIT_CACHE_TTL_MS": "CR_TTL",
  "CREDIT_CACHE_MAX_SIZE": "CR_MAX",
  "MAX_TODO_AUTO_ITERATIONS": "MAX_TODO",
  "VITE_API_BASE": "VITE_API",
  "VITE_LAMBDA_URL": "VITE_LAM",
  "VITE_LOCAL_LAMBDA_URL": "VITE_LOCAL",
  "VITE_GOOGLE_CLIENT_ID": "VITE_GGL_CID",
  "VITE_PAYPAL_CLIENT_ID": "VITE_PP_CID",
  "VITE_API_ENDPOINT": "VITE_EP",
  "VITE_BACKEND_URL": "VITE_BACK"
}
```

### 4.3. Provider Variable Handling

**Challenge**: Provider variables use indexed pattern: `LLAMDA_LLM_PROXY_PROVIDER_TYPE_0`, `LLAMDA_LLM_PROXY_PROVIDER_TYPE_1`, etc.

**Solution**: Extend script to handle indexed variables dynamically:

```javascript
// Special handling for indexed provider variables
function handleProviderVariables() {
  const providerFields = [
    { old: 'LLAMDA_LLM_PROXY_PROVIDER_TYPE_', new: 'P_T' },
    { old: 'LLAMDA_LLM_PROXY_PROVIDER_KEY_', new: 'P_K' },
    { old: 'LLAMDA_LLM_PROXY_PROVIDER_ENDPOINT_', new: 'P_E' },
    { old: 'LLAMDA_LLM_PROXY_PROVIDER_MODEL_', new: 'P_M' },
    { old: 'LLAMDA_LLM_PROXY_PROVIDER_RATE_LIMIT_', new: 'P_RL' },
    { old: 'LLAMDA_LLM_PROXY_PROVIDER_ALLOWED_MODELS_', new: 'P_AM' },
    { old: 'LLAMDA_LLM_PROXY_PROVIDER_IMAGE_MAX_QUALITY_', new: 'P_IQ' },
    { old: 'LLAMDA_LLM_PROXY_PROVIDER_PRIORITY_', new: 'P_P' }
  ];
  
  const maxProviders = 20; // Reasonable upper limit
  
  providerFields.forEach(field => {
    for (let i = 0; i < maxProviders; i++) {
      const oldVar = `${field.old}${i}`;
      const newVar = `${field.new}${i}`;
      
      const result = replaceInFiles(oldVar, newVar);
      
      if (result.occurrences > 0) {
        console.log(`   ✅ ${oldVar} → ${newVar}: ${result.occurrences} occurrences`);
      }
    }
  });
}
```

## 5. Deployment Script Updates

### 5.1. Modify `scripts/deploy-env.sh`

**Current Behavior**: Deploys ALL variables from `.env` to Lambda

**Required Change**: Filter to only Lambda-needed variables

**Implementation**:

```bash
# Add Lambda variable whitelist
LAMBDA_VARS=(
  "ALLOW_EM"
  "ACC_SEC"
  "GGL_CID"
  "GGL_SEC"
  "OAUTH_URI"
  "PXY_USER"
  "PXY_PASS"
  "P_T*"  # Wildcard for indexed provider variables
  "P_K*"
  "P_E*"
  "P_M*"
  "P_RL*"
  "P_AM*"
  "P_IQ*"
  "P_P*"
  "MAX_ITER"
  "NO_YT_TRANS"
  "MED_TIMEOUT"
  # ... (all Lambda-needed variables)
)

# Filter function
is_lambda_var() {
  local var=$1
  for pattern in "${LAMBDA_VARS[@]}"; do
    if [[ "$pattern" == *"*" ]]; then
      # Wildcard match
      prefix=${pattern%\*}
      if [[ "$var" == "$prefix"* ]]; then
        return 0
      fi
    else
      # Exact match
      if [[ "$var" == "$pattern" ]]; then
        return 0
      fi
    fi
  done
  return 1
}

# Modify ENV vars parsing loop
while IFS='=' read -r key value; do
  # ... existing parsing logic ...
  
  # Skip if not a Lambda variable
  if ! is_lambda_var "$key"; then
    echo -e "  ${YELLOW}⊘${NC} $key = ${GRAY}[SKIPPED - UI only]${NC}"
    continue
  fi
  
  # ... existing JSON building logic ...
done < "$ENV_FILE"
```

### 5.2. Update `.env.example` Documentation

Add comments explaining shortened variable names:

```bash
# Authentication & Access
ALLOW_EM=your-email@example.com            # Previously: ALLOWED_EMAILS
ACC_SEC=your-secret-key                    # Previously: ACCESS_SECRET

# Google OAuth
GGL_CID=your-google-client-id              # Previously: GOOGLE_CLIENT_ID
GGL_SEC=your-google-client-secret          # Previously: GOOGLE_CLIENT_SECRET
OAUTH_URI=http://localhost:3000/callback   # Previously: OAUTH_REDIRECT_URI

# Provider Configuration (indexed 0-N)
# Format: P_<FIELD><INDEX>
# Previously: LLAMDA_LLM_PROXY_PROVIDER_<FIELD>_<INDEX>
P_T0=openai                                # TYPE (openai/groq/gemini/together)
P_K0=your-api-key                          # KEY
P_E0=https://api.openai.com/v1             # ENDPOINT
P_M0=gpt-4o-mini                           # MODEL
P_RL0=60                                   # RATE_LIMIT (requests per minute)
P_AM0=gpt-4o,gpt-4o-mini,o1-mini          # ALLOWED_MODELS
P_IQ0=hd                                   # IMAGE_MAX_QUALITY
P_P0=1                                     # PRIORITY

# ... (more examples)
```

## 6. Testing & Validation Strategy

### 6.1. Pre-Implementation Testing

1. **Dry Run Mode**: Script outputs changes without writing files
2. **Sample File Testing**: Test on a few files first
3. **Backup Verification**: Ensure backups are created correctly

### 6.2. Post-Implementation Testing

1. **Code Reference Verification**: 
   - Search for old variable names
   - Ensure all references updated

2. **Lambda Deployment Test**:
   ```bash
   make deploy-env     # Deploy updated variables
   make deploy-lambda  # Deploy code with new variable names
   make logs           # Check for "undefined" errors
   ```

3. **Local Development Test**:
   ```bash
   make dev            # Start local server
   # Test endpoints: /health, /chat, /transcribe
   ```

4. **UI Build Test**:
   ```bash
   cd ui-new
   npm run build       # Ensure Vite builds successfully
   ```

5. **End-to-End Functional Test**:
   - Test authentication (OAuth)
   - Test chat with tools
   - Test transcription
   - Test RAG queries
   - Test billing/PayPal

### 6.3. Rollback Plan

If issues occur:

1. **Restore from backup**:
   ```bash
   cp -r .backup-<timestamp>/* .
   ```

2. **Redeploy old variables**:
   ```bash
   make deploy-env
   ```

3. **Review change report**: Identify failed replacements

## 7. Implementation Checklist

### Phase 1: Preparation
- [ ] Create variable mapping JSON file (`scripts/env-variable-map.json`)
- [ ] Create compression script (`scripts/compress-env.js`)
- [ ] Review and validate all variable mappings
- [ ] Test script in dry-run mode

### Phase 2: Execution
- [ ] Create full project backup
- [ ] Run compression script
- [ ] Verify all changes in report
- [ ] Review critical files manually (auth, tools, config)
- [ ] Update `.env.example` with new variable names and documentation

### Phase 3: Deployment Script Updates
- [ ] Modify `scripts/deploy-env.sh` to filter Lambda-needed variables
- [ ] Test deployment script locally
- [ ] Update Makefile if needed

### Phase 4: Testing
- [ ] Test local development server
- [ ] Test Lambda deployment
- [ ] Test UI build
- [ ] Run end-to-end functional tests
- [ ] Check CloudWatch logs for errors

### Phase 5: Documentation
- [ ] Update README.md with new variable names
- [ ] Update developer_log with implementation notes
- [ ] Document any issues encountered
- [ ] Create migration guide for existing deployments

## 8. Risk Mitigation

### 8.1. Identified Risks

1. **Incomplete Replacements**: Some references might be missed
   - **Mitigation**: Automated verification step in script

2. **Runtime Errors**: Code breaks if variables undefined
   - **Mitigation**: Test in local dev before deploying to Lambda

3. **Deployment Failures**: Lambda deployment might fail
   - **Mitigation**: Incremental deployment (env vars first, then code)

4. **UI Build Failures**: Vite might not find variables
   - **Mitigation**: Test build before deploying to GitHub Pages

5. **Data Loss**: Accidental deletion of important variables
   - **Mitigation**: Comprehensive backups, dry-run testing

### 8.2. Critical Files to Review Manually

1. `src/auth.js` - Authentication logic
2. `src/endpoints/chat.js` - Main chat endpoint
3. `src/tools.js` - Tool execution
4. `src/index.js` - Lambda handler
5. `ui-new/src/utils/api.ts` - API endpoint configuration
6. `ui-new/src/utils/auth.ts` - OAuth flow
7. `scripts/deploy-env.sh` - Deployment script

## 9. Expected Outcomes

### 9.1. File Size Reduction

- **Current `.env` size**: ~379 lines × 40 avg chars/line = ~15,160 bytes
- **Projected size**: ~379 lines × 15 avg chars/line = ~5,685 bytes
- **Reduction**: ~62% (9,475 bytes saved)

### 9.2. Lambda Deployment Impact

- **Current env vars size**: Approaching 4KB limit
- **Projected size**: ~1.5-2KB
- **Headroom**: ~2-2.5KB available for future variables

### 9.3. Maintainability Impact

- **Pros**: Smaller deployment package, faster deployments
- **Cons**: Less readable variable names (mitigated by documentation)

## 10. Next Steps (Post-Approval)

1. User approves this plan
2. Create `scripts/env-variable-map.json` with complete mapping
3. Create `scripts/compress-env.js` automation script
4. Run script in dry-run mode to preview changes
5. Execute script to perform actual replacements
6. Test thoroughly (local dev → Lambda → UI)
7. Deploy updated environment variables and code
8. Document final results

---

**Plan Status**: ✅ READY FOR REVIEW

**Estimated Implementation Time**: 2-3 hours (automated script execution + testing)

**Estimated Manual Review Time**: 30-60 minutes (verify critical files)

**Risk Level**: MEDIUM (comprehensive backups and testing reduce risk)

**Recommended Approach**: Proceed with automated script implementation
