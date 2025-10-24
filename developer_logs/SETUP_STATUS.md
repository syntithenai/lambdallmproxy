# Local Development Setup Guide

**Date**: October 22, 2025  
**Status**: ✅ Complete - Ready for Development

## 🚀 Quick Start (First Time Setup)

If you've just cloned the repository, run:

```bash
make setup
```

This single command will:
1. ✅ Check that Node.js 20+ is installed
2. ✅ Install all backend dependencies
3. ✅ Install all UI dependencies
4. ✅ Create .env file from .env.example (if needed)

Then start developing:

```bash
make dev
```

Open http://localhost:8081 in your browser!

---

## 📋 Detailed Installation Guide

### Step 1: Check Node.js Version

```bash
make check-node
```

**Required**: Node.js v20.19+ or v22.12+

If you need to upgrade Node.js, the command will show you instructions.

### Step 2: Install Dependencies

**Option A - Install Everything** (recommended):
```bash
make install
```

**Option B - Install Separately**:
```bash
make install-backend    # Install backend dependencies only
make install-ui         # Install UI dependencies only
```

### Step 3: Configure Environment

```bash
# Copy example configuration
cp .env.example .env

# Edit with your API keys
nano .env   # or use your preferred editor
```

### Step 4: Start Development

```bash
make dev
```

This starts:
- 📍 Backend Lambda server: http://localhost:3000
- 📍 UI dev server: http://localhost:8081

---

## ❌ Previous Issues (Now Fixed)

### What Was Wrong

1. **No automated setup** - Manual installation was error-prone
2. **Node.js version not checked** - Failed silently with Node 18
3. **Dependency conflicts** - `@langchain/core` version mismatch
4. **Missing --legacy-peer-deps** - npm install failed without it
5. **No clear instructions** - Users had to figure out the sequence

### What's Fixed

1. ✅ **`make setup`** - Single command for complete setup
2. ✅ **`make check-node`** - Validates Node.js 20+ before installing
3. ✅ **`make install`** - Installs all dependencies with correct flags
4. ✅ **Auto-cleanup** - Removes old node_modules before reinstalling
5. ✅ **Clear error messages** - Shows exactly what to do if Node.js is wrong
6. ✅ **Helpful next steps** - Tells you what to do after installation

---

## 🔧 Troubleshooting

### Issue: "Node.js version too old"

Run the upgrade commands shown by `make check-node`:

```bash
# Using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
nvm alias default 20
```

Then run `make install` again.

### Issue: "Cannot find module 'express'" or "vite: not found"

Dependencies weren't installed correctly. Run:

```bash
make install
```

### Issue: Backend doesn't connect to UI

1. Make sure backend started **before** opening UI
2. Hard refresh browser: Ctrl+Shift+R (or Cmd+Shift+R on Mac)
3. Check browser console for: `🏠 Using local Lambda server at http://localhost:3000`

### Issue: "Port already in use"

Kill existing processes:

```bash
pkill -f "node scripts/run-local-lambda" || true
pkill -f "vite" || true
make dev
```

---

## 📚 Available Commands

### Installation & Setup
```bash
make check-node          # Check Node.js version (requires 20+)
make setup               # Complete first-time setup (recommended)
make install             # Install all dependencies
make install-backend     # Install backend dependencies only
make install-ui          # Install UI dependencies only
```

### Local Development
```bash
make dev                 # Start both backend and UI with hot reload
make run-lambda-local    # Start only backend server on port 3000
make serve-ui            # Start only UI dev server on port 8081
```

### Production Deployment
```bash
make deploy-lambda-fast  # Deploy backend code only (~10 sec)
make deploy-lambda       # Full backend deploy with dependencies
make deploy-ui           # Build and deploy UI to GitHub Pages
make deploy-env          # Deploy .env variables to Lambda
```

### Utilities
```bash
make logs                # View recent CloudWatch logs
make logs-tail           # Tail CloudWatch logs (live)
make help                # Show all available commands
```

---

## ⚠️ Important Notes

1. **Local-First Development**: Always develop locally, only deploy when production-ready
2. **Environment Variables**: `.env` file is local-only, use `make deploy-env` to sync to Lambda
3. **Sample Files**: Local Lambda server serves samples from `ui-new/public/samples/`
4. **Hot Reload**: Both backend and UI automatically reload on file changes
5. **Puppeteer**: Runs locally in visible browser mode (HEADLESS=false) for easier debugging

---

## 📖 Additional Resources

- **All Commands**: Run `make help`
- **Project Documentation**: See `README.md`
- **Development Guidelines**: See `.github/copilot-instructions.md`
- **API Endpoints**: See `developer_logs/ENDPOINTS_README.md`
- **Developer Logs**: See `developer_logs/` directory
