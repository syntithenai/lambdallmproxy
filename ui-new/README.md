# Lambda Proxy UI - React Application

Modern React UI for Lambda LLM Proxy with Chat, Planning, and Search capabilities.

## 🚀 Quick Start

### 1. Configure Lambda Endpoint

**IMPORTANT**: Set your Lambda endpoint URL **before building**:

```bash
# Copy example config
cp .env.example .env

# Edit .env and set VITE_API_BASE
nano .env
```

**Options**:
- **Same-origin** (Lambda serves UI): `VITE_API_BASE=`
- **API Gateway**: `VITE_API_BASE=https://abc123.execute-api.region.amazonaws.com/prod`
- **Function URL**: `VITE_API_BASE=https://abc123.lambda-url.region.on.aws`
- **Custom Domain**: `VITE_API_BASE=https://api.yourdomain.com`

### 2. Install & Build

```bash
npm install
npm run build
```

Output → `../docs/` directory

## 📡 How Endpoints Work

The `VITE_API_BASE` is **compiled into JavaScript** at build time:

```typescript
// src/utils/api.ts
const API_BASE = import.meta.env.VITE_API_BASE || '';

fetch(`${API_BASE}/proxy`, ...)      // Chat
fetch(`${API_BASE}/planning`, ...)   // Planning
fetch(`${API_BASE}/search`, ...)     // Search
```

**Must rebuild after changing .env!**

## 📚 Documentation

- **Endpoint Config**: `../LAMBDA_ENDPOINT_CONFIG.md` (detailed guide)
- **Quick Start**: `../QUICK_START.md`
- **Full Docs**: `../UI_REBUILD_COMPLETE.md`

---

Built with React 19 + TypeScript + Vite + Tailwind CSS
