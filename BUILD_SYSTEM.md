# Build System Documentation

This document describes the clean, simple build system for the Lambda LLM Proxy project.

## Overview

The build system uses **bash scripts** in the `scripts/` folder, called by a **Makefile** for convenience.

## Architecture

```
Makefile (simple interface)
    ↓
scripts/ (bash scripts do the work)
    ├── deploy.sh          - Deploy Lambda (full with dependencies)
    ├── deploy-fast.sh     - Deploy Lambda (code only, fast)
    ├── deploy-layer.sh    - Create Lambda layer
    ├── build-docs.sh      - Build React UI to docs/
    └── deploy-docs.sh     - Push docs/ to GitHub Pages
```

## Make Commands

### Lambda Function

| Command | Script | Description | Time |
|---------|--------|-------------|------|
| `make deploy-lambda` | `scripts/deploy.sh` | Full Lambda deployment with dependencies | ~2-3 min |
| `make deploy-lambda-fast` | `scripts/deploy-fast.sh` | Code-only deployment (requires layer) | ~10 sec |
| `make setup-layer` | `scripts/deploy-layer.sh` | Create Lambda layer (one-time setup) | ~2 min |

### UI/Documentation

| Command | Script | Description |
|---------|--------|-------------|
| `make build-ui` | `scripts/build-docs.sh` | Build React app from `ui-new/` to `docs/` |
| `make deploy-ui` | `scripts/build-docs.sh` + `scripts/deploy-docs.sh` | Build and push to GitHub Pages |

### Combined

| Command | Description |
|---------|-------------|
| `make all` | Deploy both Lambda and UI |
| `make clean` | Clean temporary files |
| `make serve` | Serve UI locally on port 8081 |

## Deployment Workflows

### 1. Backend Code Changes (Recommended: Fast Deploy)

```bash
# First time setup (once)
make setup-layer

# After code changes in src/
make deploy-lambda-fast
```

**Why Fast Deploy?**
- ✅ 10 seconds vs 2-3 minutes
- ✅ 89KB vs 27MB package size
- ✅ No timeouts (uses S3)
- ✅ Dependencies in reusable layer

### 2. Backend Dependency Changes

```bash
# When package.json changes
make deploy-lambda
```

### 3. Frontend Changes

```bash
# Edit files in ui-new/src/
# Then build and deploy:
make deploy-ui
```

### 4. Development Mode

```bash
# Frontend hot reload
cd ui-new && npm run dev

# Test locally
make serve  # http://localhost:8081
```

## Script Details

### scripts/deploy.sh
- **Purpose**: Full Lambda deployment with dependencies
- **Package**: All code + node_modules (~27MB)
- **Time**: ~2-3 minutes
- **Use When**: First deployment or package.json changes

### scripts/deploy-fast.sh
- **Purpose**: Rapid deployment for code changes
- **Package**: Code only (~89KB)
- **Time**: ~10 seconds
- **Requires**: Lambda layer created by `deploy-layer.sh`
- **Use When**: Any code change in src/ (most common)

### scripts/deploy-layer.sh
- **Purpose**: Create Lambda layer with dependencies
- **Time**: ~2 minutes
- **Run**: Once before using fast deploy
- **Output**: Creates `.deployment-config` with layer ARN

### scripts/build-docs.sh
- **Purpose**: Build React UI from `ui-new/` to `docs/`
- **Input**: `ui-new/src/` (React/TypeScript/Vite)
- **Output**: `docs/` (static HTML/JS/CSS)
- **Command**: Runs `npm run build` in ui-new/

### scripts/deploy-docs.sh
- **Purpose**: Commit and push docs/ to GitHub
- **Options**:
  - `--build` - Run build-docs.sh first
  - `-m "message"` - Custom commit message
  - `-r origin` - Remote name
  - `-b branch` - Branch name

## Directory Structure

```
lambdallmproxy/
├── Makefile              # Simple interface
├── scripts/              # Bash scripts
│   ├── deploy.sh         # Lambda full deploy
│   ├── deploy-fast.sh    # Lambda fast deploy
│   ├── deploy-layer.sh   # Create Lambda layer
│   ├── build-docs.sh     # Build UI
│   └── deploy-docs.sh    # Push to GitHub
├── src/                  # Lambda backend code
│   └── endpoints/
│       └── chat.js       # Main chat endpoint
├── ui-new/               # React frontend (SOURCE)
│   └── src/
│       └── components/
└── docs/                 # Built UI (GENERATED, don't edit!)
    └── assets/
```

## Key Principles

1. **Never edit `docs/` directly** - It's generated from `ui-new/`
2. **Use fast deploy for speed** - 10 sec vs 2-3 min
3. **Scripts do the work** - Makefile is just a convenience wrapper
4. **Clear naming** - `deploy-lambda`, `build-ui`, `deploy-ui`
5. **Single responsibility** - Each script does one thing well

## Troubleshooting

### Fast deploy not working?
```bash
# Create the layer first
make setup-layer
# Then try again
make deploy-lambda-fast
```

### UI not updating?
```bash
# Make sure you're editing ui-new/, not docs/
cd ui-new/src/components/
# Edit files here

# Then build
make build-ui

# Check the output
ls -lh docs/assets/
```

### Need full deploy?
```bash
# Use full deploy instead of fast
make deploy-lambda
```

## Migration Notes

The old Makefile had many confusing targets like:
- `make fast` → Now `make deploy-lambda-fast`
- `make dev` → Now `make deploy-lambda-fast`
- `make deploy` → Now `make deploy-lambda`
- `make build-docs` → Now `make build-ui`
- `make deploy-docs` → Now `make deploy-ui`

The new names are clearer and consistent.
