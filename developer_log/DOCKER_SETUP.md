# Docker Setup Guide

This guide explains how to run the Lambda LLM Proxy in Docker containers for both production and development environments.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Production Deployment](#production-deployment)
5. [Development Environment](#development-environment)
6. [Makefile Commands](#makefile-commands)
7. [Configuration](#configuration)
8. [Troubleshooting](#troubleshooting)
9. [Architecture](#architecture)

## Overview

The project provides two Docker configurations:

- **Production** (`Dockerfile`): Optimized image with only runtime dependencies
- **Development** (`Dockerfile.dev`): Full development environment with hot reload

Both configurations use **Node 20 Alpine** base image for minimal size and security.

## Prerequisites

- Docker 20.10+ installed
- Docker Compose 2.0+ installed
- `.env` file configured (copy from `.env.example`)
- Minimum 2GB RAM allocated to Docker

## Quick Start

### Production Server

```bash
# Build and start production server
make docker-build
make docker-up

# Server running at http://localhost:3000
# View logs
make docker-logs

# Stop server
make docker-down
```

### Development Server

```bash
# Build and start development server
make docker-build-dev
make docker-up-dev

# Servers running at:
#   Backend:  http://localhost:3000
#   Frontend: http://localhost:5173

# View logs
make docker-logs-dev

# Stop server
make docker-down
```

## Production Deployment

### Building the Image

```bash
make docker-build
```

This creates `lambdallmproxy:latest` with:
- Only production dependencies (`npm ci --only=production`)
- Node 20 Alpine base (minimal size)
- Build tools removed after installation
- Exposes port 3000

### Running Production Container

```bash
# Start detached
make docker-up

# Or with docker-compose directly
docker-compose up -d llmproxy
```

### Accessing Production Container

```bash
# View logs
make docker-logs

# Open shell
make docker-shell

# Restart container
docker-compose restart llmproxy
```

## Development Environment

### Building Dev Image

```bash
make docker-build-dev
```

This creates `lambdallmproxy:dev` with:
- All dependencies including devDependencies
- Nodemon for backend hot reload
- Vite dev server for frontend hot reload
- Volume mounts for source code
- Exposes ports 3000 (backend) and 5173 (frontend)

### Running Dev Container

```bash
# Start detached
make docker-up-dev

# Or with docker-compose directly
docker-compose up -d llmproxy-dev
```

### Volume Mounts

The development container mounts:
- `./src` → `/app/src` (backend source)
- `./ui-new/src` → `/app/ui-new/src` (frontend source)
- `./scripts` → `/app/scripts` (utility scripts)
- Named volumes for `node_modules` (performance)

**Changes to source files automatically trigger reload** - no rebuild needed!

### Accessing Dev Container

```bash
# View logs (combined backend + frontend)
make docker-logs-dev

# Open shell
make docker-shell-dev

# Restart container
docker-compose restart llmproxy-dev
```

## Makefile Commands

### Build Commands

| Command | Description |
|---------|-------------|
| `make docker-build` | Build production image |
| `make docker-build-dev` | Build development image |

### Runtime Commands

| Command | Description |
|---------|-------------|
| `make docker-up` | Start production container |
| `make docker-up-dev` | Start development container |
| `make docker-down` | Stop all containers |

### Debugging Commands

| Command | Description |
|---------|-------------|
| `make docker-logs` | View production logs |
| `make docker-logs-dev` | View development logs |
| `make docker-shell` | Open production shell |
| `make docker-shell-dev` | Open development shell |

### Cleanup Commands

| Command | Description |
|---------|-------------|
| `make docker-clean` | Remove all containers, images, and volumes |

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# Copy from example
cp .env.example .env

# Edit with your values
nano .env
```

**Required Variables**:
```env
# OpenAI API (for embeddings, tools)
OPENAI_API_KEY=sk-...

# Google OAuth (for authentication)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Groq API (optional, for fast inference)
GROQ_API_KEY=gsk_...

# Gemini API (optional)
GEMINI_API_KEY=AIza...
```

The `.env` file is automatically loaded by docker-compose.

### Port Configuration

Default ports:
- **Production**: 3000 (backend only)
- **Development**: 3000 (backend), 5173 (frontend)

To change ports, edit `docker-compose.yml`:

```yaml
services:
  llmproxy:
    ports:
      - "8080:3000"  # Map host 8080 to container 3000
```

## Troubleshooting

### Container Won't Start

**Check logs**:
```bash
make docker-logs
# or
docker-compose logs llmproxy
```

**Common issues**:
- Missing `.env` file → Copy from `.env.example`
- Port already in use → Change port in `docker-compose.yml`
- Insufficient memory → Increase Docker memory allocation

### Hot Reload Not Working (Dev)

**Verify volume mounts**:
```bash
make docker-shell-dev
ls -la /app/src  # Should show your source files
```

**Restart container**:
```bash
docker-compose restart llmproxy-dev
```

### Permission Errors

**On Linux**, you may need to fix volume permissions:
```bash
# Set correct ownership
sudo chown -R $USER:$USER .

# Or run container with your UID
docker-compose run --user $(id -u):$(id -g) llmproxy-dev
```

### Build Failures

**Clean Docker cache**:
```bash
make docker-clean
docker system prune -a
make docker-build
```

**Check Node version in Dockerfile**:
```dockerfile
FROM node:20-alpine  # Should be Node 20+
```

### Network Issues

**Cannot reach external APIs**:
```bash
# Check network connectivity from container
make docker-shell
ping google.com
curl https://api.openai.com/v1/models
```

**DNS issues**:
Add to `docker-compose.yml`:
```yaml
services:
  llmproxy:
    dns:
      - 8.8.8.8
      - 8.8.4.4
```

## Architecture

### Directory Structure

```
.
├── Dockerfile              # Production image
├── Dockerfile.dev          # Development image
├── docker-compose.yml      # Orchestration
├── .dockerignore           # Exclude from build context
├── src/                    # Backend source (mounted in dev)
├── ui-new/src/             # Frontend source (mounted in dev)
├── scripts/                # Utility scripts (mounted in dev)
└── .env                    # Environment variables
```

### Production Image Layers

```dockerfile
FROM node:20-alpine                    # Base (50MB)
RUN apk add --no-cache python3 make g++ git  # Build tools (100MB)
COPY package*.json ./                  # Dependencies metadata
RUN npm ci --only=production           # Install deps (200MB)
COPY . .                               # Application code (10MB)
CMD ["node", "scripts/run-local-lambda.js"]  # Entrypoint
```

**Total size**: ~360MB (optimized)

### Development Image Layers

```dockerfile
FROM node:20-alpine                    # Base (50MB)
RUN apk add --no-cache python3 make g++ git  # Build tools (100MB)
COPY package*.json ./                  # Dependencies metadata
RUN npm ci                             # Install ALL deps (300MB)
COPY . .                               # Application code (10MB)
CMD npm run dev                        # Start dev servers
```

**Total size**: ~460MB (includes devDependencies)

### Volume Strategy

**Named volumes** (performance):
- `llmproxy_node_modules`: Backend dependencies
- `llmproxy_ui_node_modules`: Frontend dependencies
- `llmproxy_cache`: Build cache

**Bind mounts** (hot reload):
- `./src:/app/src`: Backend source
- `./ui-new/src:/app/ui-new/src`: Frontend source
- `./scripts:/app/scripts`: Utility scripts

Named volumes prevent cross-platform node_modules issues (Linux vs macOS).

### Health Checks

Both containers include health checks:

```yaml
healthcheck:
  test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

View health status:
```bash
docker-compose ps
```

## Advanced Usage

### Building for Different Platforms

```bash
# Build for ARM64 (Apple Silicon)
docker build --platform linux/arm64 -t lambdallmproxy:latest .

# Build for AMD64 (Intel/AMD)
docker build --platform linux/amd64 -t lambdallmproxy:latest .

# Multi-platform build
docker buildx build --platform linux/amd64,linux/arm64 -t lambdallmproxy:latest .
```

### Custom Docker Compose Overrides

Create `docker-compose.override.yml`:

```yaml
services:
  llmproxy-dev:
    environment:
      - DEBUG=*
      - NODE_ENV=development
    ports:
      - "9229:9229"  # Node debugger
```

This file is automatically merged with `docker-compose.yml`.

### Running Tests in Docker

```bash
# Run tests in clean container
docker-compose run --rm llmproxy npm test

# Run with coverage
docker-compose run --rm llmproxy npm run test:coverage
```

### Production Deployment to Registry

```bash
# Tag for registry
docker tag lambdallmproxy:latest your-registry.com/lambdallmproxy:v1.0.0

# Push to registry
docker push your-registry.com/lambdallmproxy:v1.0.0

# Pull and run on production server
docker pull your-registry.com/lambdallmproxy:v1.0.0
docker run -d -p 3000:3000 --env-file .env your-registry.com/lambdallmproxy:v1.0.0
```

## Comparison: Docker vs Native vs AWS Lambda

| Feature | Docker Production | Docker Dev | Native (`make dev`) | AWS Lambda |
|---------|------------------|------------|-------------------|------------|
| **Isolation** | ✅ Full | ✅ Full | ❌ None | ✅ Full |
| **Hot Reload** | ❌ No | ✅ Yes | ✅ Yes | ❌ No |
| **Startup Time** | ~5s | ~10s | ~2s | Cold: ~3s |
| **Portability** | ✅ High | ✅ High | ❌ Low | ✅ High |
| **Debugging** | ⚠️ Moderate | ✅ Easy | ✅ Easy | ⚠️ Hard |
| **Use Case** | Staging/CI | Development | Local dev | Production |

**Recommendation**:
- **Local development**: Use native `make dev` (fastest iteration)
- **Testing deployment**: Use `make docker-up-dev` (matches production env)
- **Staging/preview**: Use `make docker-up` (production-like)
- **Production**: Deploy to AWS Lambda with `make deploy-lambda-fast`

## Next Steps

1. ✅ Build Docker images: `make docker-build && make docker-build-dev`
2. ✅ Test production: `make docker-up` → http://localhost:3000
3. ✅ Test development: `make docker-up-dev` → http://localhost:3000 + http://localhost:5173
4. ✅ Verify hot reload: Edit `src/index.js` and watch logs
5. ✅ Clean up: `make docker-down`

For questions or issues, check the [main README](../README.md) or open an issue on GitHub.
