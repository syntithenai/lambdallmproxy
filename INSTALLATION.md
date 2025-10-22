# Installation Guide

Complete guide for setting up the Lambda LLM Proxy project for local development.

## Prerequisites

- **Operating System**: Linux, macOS, or WSL2 on Windows
- **Node.js**: Version 20.19+ or 22.12+ (required)
- **npm**: Comes with Node.js
- **Git**: For cloning the repository
- **AWS CLI**: Optional, only needed for Lambda deployment

## Quick Install (Recommended)

For most users, this is all you need:

```bash
# 1. Clone the repository
git clone https://github.com/syntithenai/lambdallmproxy.git
cd lambdallmproxy

# 2. Run complete setup
make setup

# 3. Edit your API keys
nano .env

# 4. Start development
make dev
```

That's it! Open http://localhost:8081 in your browser.

## Step-by-Step Installation

### Step 1: Install Node.js 20+

Check if you have Node.js 20+ installed:

```bash
node --version
```

If you see `v20.x.x` or higher, skip to Step 2.

#### Option A: Install Node.js using nvm (Recommended)

nvm allows you to easily switch between Node.js versions.

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash

# Reload your shell configuration
source ~/.bashrc   # or source ~/.zshrc for zsh

# Install Node.js 20
nvm install 20

# Set Node.js 20 as default
nvm use 20
nvm alias default 20

# Verify installation
node --version     # Should show v20.x.x
npm --version      # Should show v10.x.x
```

#### Option B: Install Node.js using system package manager

**Ubuntu/Debian:**
```bash
# Add NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Install Node.js
sudo apt-get install -y nodejs

# Verify installation
node --version     # Should show v20.x.x
```

**macOS (using Homebrew):**
```bash
# Install or upgrade Node.js
brew install node@20

# Link Node.js 20
brew link node@20

# Verify installation
node --version     # Should show v20.x.x
```

### Step 2: Clone the Repository

```bash
# Clone from GitHub
git clone https://github.com/syntithenai/lambdallmproxy.git

# Navigate into the directory
cd lambdallmproxy
```

### Step 3: Verify Node.js Version

Before installing dependencies, verify you have the correct Node.js version:

```bash
make check-node
```

This will show:
- ✅ Node.js version (must be 20+)
- ✅ npm version
- ❌ Error message with upgrade instructions if version is too old

### Step 4: Install Dependencies

**Option A - Automated Setup (Recommended):**

```bash
make setup
```

This single command will:
- Check Node.js version
- Install backend dependencies (with `--legacy-peer-deps` flag)
- Install UI dependencies
- Create `.env` file from `.env.example`
- Show next steps

**Option B - Manual Installation:**

```bash
# Install backend dependencies
make install-backend

# Install UI dependencies
make install-ui

# Or install both at once
make install
```

### Step 5: Configure Environment Variables

```bash
# Copy example configuration
cp .env.example .env

# Edit with your preferred editor
nano .env   # or vim, code, etc.
```

**Minimum required configuration:**

```bash
# At least one LLM provider (get free API keys)
LLAMDA_LLM_PROXY_PROVIDER_TYPE_0=groq-free
LLAMDA_LLM_PROXY_PROVIDER_KEY_0=gsk_your-groq-key-here

# Or use OpenAI
LLAMDA_LLM_PROXY_PROVIDER_TYPE_1=openai
LLAMDA_LLM_PROXY_PROVIDER_KEY_1=sk-proj-your-openai-key-here

# Or use Gemini (free tier available)
LLAMDA_LLM_PROXY_PROVIDER_TYPE_2=gemini-free
LLAMDA_LLM_PROXY_PROVIDER_KEY_2=AIza-your-gemini-key-here
```

**Get free API keys:**
- Groq: https://console.groq.com/keys (fastest, free tier)
- OpenAI: https://platform.openai.com/api-keys (paid)
- Gemini: https://makersuite.google.com/app/apikey (free tier)

### Step 6: Start Development Environment

```bash
make dev
```

This starts two servers:
- **Backend Lambda server**: http://localhost:3000
- **UI dev server**: http://localhost:8081

Both have hot reload enabled - file changes automatically restart/refresh.

### Step 7: Test the Application

1. Open http://localhost:8081 in your browser
2. Check browser console (F12) for: `🏠 Using local Lambda server at http://localhost:3000`
3. Try sending a test message: "Hello, how are you?"

If you see a response, congratulations! Your setup is complete. 🎉

## Troubleshooting

### Issue: "Node.js version too old"

**Symptom**: `make check-node` shows error about Node.js version

**Solution**: Upgrade to Node.js 20+ using the instructions in Step 1

### Issue: "Cannot find module 'express'" or "vite: not found"

**Symptom**: `make dev` crashes immediately with module not found errors

**Solution**: Dependencies weren't installed correctly. Run:
```bash
make install
```

### Issue: "ERESOLVE unable to resolve dependency tree"

**Symptom**: npm install fails with dependency conflict errors

**Solution**: The `make install` commands use `--legacy-peer-deps` flag automatically. If you're running npm manually, use:
```bash
npm install --legacy-peer-deps
```

### Issue: Backend running but UI shows "Connection refused"

**Symptom**: UI loads but can't connect to backend

**Solution**:
1. Make sure backend started **before** opening UI
2. Hard refresh browser: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
3. Check browser console for connection errors

### Issue: "Port already in use"

**Symptom**: Error message about port 3000 or 8081 already in use

**Solution**: Kill existing processes:
```bash
pkill -f "node scripts/run-local-lambda" || true
pkill -f "vite" || true

# Then restart
make dev
```

### Issue: Vite fails with "crypto.hash is not a function"

**Symptom**: UI server crashes with crypto error

**Solution**: This means you're using Node.js 18 or older. Upgrade to Node.js 20+ (see Step 1)

### Issue: "File is not defined" error from undici

**Symptom**: Backend crashes with `File is not defined` error

**Solution**: This means you're using Node.js 18 or older. Upgrade to Node.js 20+ (see Step 1)

## Uninstalling / Cleaning Up

To completely remove all installed dependencies and start fresh:

```bash
# Remove all dependencies
rm -rf node_modules ui-new/node_modules

# Remove lock files
rm -f package-lock.json ui-new/package-lock.json

# Remove built files
rm -rf docs/

# Then reinstall
make install
```

## Next Steps

After successful installation:

1. **Configure API Keys**: Edit `.env` with your provider API keys
2. **Start Developing**: Run `make dev` to start both servers
3. **Read the Docs**: Check `README.md` for usage guide
4. **Explore Commands**: Run `make help` to see all available commands
5. **Deploy to Lambda**: When ready, see deployment section in `README.md`

## Getting Help

- **General Issues**: Check `SETUP_STATUS.md` for common problems
- **Development Guide**: See `.github/copilot-instructions.md`
- **API Documentation**: See `developer_logs/ENDPOINTS_README.md`
- **GitHub Issues**: https://github.com/syntithenai/lambdallmproxy/issues

## System Requirements

### Minimum Requirements
- Node.js 20.19+
- 4 GB RAM
- 2 GB free disk space
- Internet connection for API calls

### Recommended Requirements
- Node.js 20.19+ or 22.12+
- 8 GB RAM
- 5 GB free disk space
- Fast internet connection

## Supported Platforms

- ✅ Ubuntu 20.04+ / Debian 11+
- ✅ macOS 12+ (Monterey or newer)
- ✅ WSL2 on Windows 10/11
- ✅ Other Linux distributions with Node.js 20+

## Installation Time

Typical installation times:
- Node.js installation: 2-5 minutes
- Dependency installation: 3-5 minutes
- First-time build: 1-2 minutes
- **Total**: ~10 minutes

## Disk Space Usage

- Backend dependencies: ~500 MB
- UI dependencies: ~400 MB
- Built assets: ~50 MB
- **Total**: ~1 GB
