# Lambda LLM Proxy Makefile
# Simple, clear deployment commands

SHELL := /bin/bash

.PHONY: help deploy-lambda deploy-lambda-fast deploy-env build-ui deploy-ui all update-catalog clean serve logs logs-tail run-lambda-local serve-ui dev setup-puppeteer deploy-puppeteer setup-puppeteer-permissions logs-puppeteer rag-ingest rag-stats rag-list rag-search rag-delete setup-scraping test-scraping test-tiers test-tier-0 test-tier-1 test-tier-2 test-tier-3 test-tier-4 install-playwright install-python

# Default target - Show help
help:
	@echo "🚀 Lambda LLM Proxy - Deployment Commands"
	@echo ""
	@echo "Main Lambda Function:"
	@echo "  make deploy-lambda       - Deploy main Lambda function (full with dependencies)"
	@echo "  make deploy-lambda-fast  - Deploy main Lambda function (code only, 10 sec)"
	@echo "  make setup-layer         - Create Lambda layer (run once before fast deploy)"
	@echo "  make deploy-env          - Deploy environment variables from .env to Lambda"
	@echo ""
	@echo "Puppeteer Lambda Function:"
	@echo "  make setup-puppeteer            - Setup Puppeteer Lambda function (one-time)"
	@echo "  make deploy-puppeteer           - Deploy Puppeteer Lambda code"
	@echo "  make setup-puppeteer-permissions - Allow main Lambda to invoke Puppeteer"
	@echo "  make logs-puppeteer             - View Puppeteer Lambda logs"
	@echo ""
	@echo "RAG Knowledge Base:"
	@echo "  make rag-ingest          - Ingest documents into knowledge base"
	@echo "  make rag-stats           - Show database statistics"
	@echo "  make rag-list            - List all documents in knowledge base"
	@echo "  make rag-search QUERY='...'"
	@echo "                           - Search knowledge base"
	@echo "  make rag-delete ID='...' - Delete document by snippet ID"
	@echo ""
	@echo "Advanced Scraping (Multi-Tier):"
	@echo "  make setup-scraping      - Setup scraping environment (npm + Python packages)"
	@echo "  make test-scraping       - Test multi-tier scraping system"
	@echo "  make test-tiers          - Test all available tiers"
	@echo "  make test-tier-0         - Test Tier 0 (Direct HTTP)"
	@echo "  make test-tier-1         - Test Tier 1 (Puppeteer + stealth)"
	@echo "  make test-tier-2         - Test Tier 2 (Playwright + stealth)"
	@echo "  make test-tier-3         - Test Tier 3 (Selenium + undetected-chromedriver)"
	@echo "  make test-tier-4         - Test Tier 4 (Interactive mode)"
	@echo ""
	@echo "UI/Documentation:"
	@echo "  make build-ui            - Build React UI to docs/"
	@echo "  make deploy-ui           - Build and push UI to GitHub Pages"
	@echo ""
	@echo "Local Development:"
	@echo "  make run-lambda-local    - Run Lambda function locally on port 3000"
	@echo "  make serve-ui            - Start Vite dev server on port 8081 (with hot reload)"
	@echo "  make serve-ui-prod       - Serve production build on port 8082"
	@echo "  make dev                 - Run both Lambda (3000) and UI (8081) locally"
	@echo ""
	@echo "Combined:"
	@echo "  make all                 - Deploy everything (Main Lambda + UI)"
	@echo ""
	@echo "Utilities:"
	@echo "  make logs                - View recent main Lambda CloudWatch logs"
	@echo "  make logs-tail           - Tail main Lambda CloudWatch logs (live)"
	@echo "  make update-catalog      - Update PROVIDER_CATALOG.json with latest data"
	@echo "  make clean               - Clean temporary files"
	@echo "  make serve               - Serve UI locally on port 8081"

# Deploy Lambda function (full with dependencies)
deploy-lambda:
	@echo "� Deploying Lambda function (full)..."
	@chmod +x scripts/deploy.sh
	./scripts/deploy.sh

# Deploy Lambda function (fast - code only, ~10 seconds)
deploy-lambda-fast:
	@echo "⚡ Deploying Lambda function (fast)..."
	@chmod +x scripts/deploy-fast.sh
	./scripts/deploy-fast.sh

# Setup Lambda layer with dependencies (run once before fast deploy)
setup-layer:
	@echo "📦 Creating Lambda Layer with dependencies..."
	@chmod +x scripts/deploy-layer.sh
	./scripts/deploy-layer.sh
	@echo "✅ Layer created! Now use 'make deploy-lambda-fast' for rapid deployments"

# Deploy environment variables from .env to Lambda
deploy-env:
	@echo "🔧 Deploying environment variables to Lambda..."
	@chmod +x scripts/deploy-env.sh
	./scripts/deploy-env.sh --yes

# Setup Puppeteer Lambda function (one-time setup)
setup-puppeteer:
	@echo "🎭 Setting up Puppeteer Lambda function..."
	@chmod +x scripts/setup-puppeteer-function.sh
	./scripts/setup-puppeteer-function.sh

# Deploy Puppeteer Lambda code
deploy-puppeteer:
	@echo "🎭 Deploying Puppeteer Lambda function..."
	@chmod +x scripts/deploy-puppeteer-lambda.sh
	./scripts/deploy-puppeteer-lambda.sh

# Setup permissions for main Lambda to invoke Puppeteer Lambda
setup-puppeteer-permissions:
	@echo "🔐 Setting up Puppeteer Lambda permissions..."
	@chmod +x scripts/setup-main-lambda-permissions.sh
	./scripts/setup-main-lambda-permissions.sh

# View Puppeteer Lambda logs
logs-puppeteer:
	@echo "📋 Viewing Puppeteer Lambda logs..."
	@AWS_PAGER="" aws logs tail /aws/lambda/llmproxy-puppeteer --since 5m --format short --region us-east-1

# Build React UI to docs/
build-ui:
	@echo "🔨 Building React UI..."
	@chmod +x scripts/build-docs.sh
	./scripts/build-docs.sh

# Build and deploy UI to GitHub Pages
deploy-ui:
	@echo "📖 Building and deploying UI to GitHub Pages..."
	@chmod +x scripts/build-docs.sh scripts/deploy-docs.sh
	./scripts/build-docs.sh
	./scripts/deploy-docs.sh --build -m "docs: update UI"

# Deploy everything (Lambda + UI)
all: deploy-lambda deploy-ui
	@echo "✅ Full deployment complete!"

# Update provider catalog with latest data
update-catalog:
	@echo "📊 Updating PROVIDER_CATALOG.json..."
	@chmod +x scripts/collect-provider-data.js
	@node scripts/collect-provider-data.js
	@echo "✅ Provider catalog updated!"

# Clean temporary files
clean:
	@echo "🧹 Cleaning up temporary files..."
	@rm -rf /tmp/lambda-deploy-* /tmp/lambda-fast-deploy-*
	@echo "✅ Cleanup completed"

# Serve UI locally on port 8081
serve:
	@echo "🖥️ Serving UI at http://localhost:8081 (Ctrl+C to stop)"
	@if [ ! -d docs ]; then \
		echo "⚠️ docs/ not found. Run 'make build-ui' first."; \
		exit 1; \
	fi
	@cd docs && python3 -m http.server 8081

# View recent Lambda CloudWatch logs
logs:
	@echo "📋 Fetching recent Lambda logs..."
	@AWS_PAGER="" aws logs tail /aws/lambda/llmproxy --since 5m --format short

# Tail Lambda CloudWatch logs (live)
logs-tail:
	@echo "📋 Tailing Lambda logs (Ctrl+C to stop)..."
	@AWS_PAGER="" aws logs tail /aws/lambda/llmproxy --follow --format short

# Run Lambda function locally on port 3000
run-lambda-local:
	@echo "🏃 Starting local Lambda server on port 3000..."
	@echo "🧹 Killing any existing Lambda server..."
	@pkill -f "node scripts/run-local-lambda" || true
	@sleep 1
	@echo "🔄 Hot reload enabled with nodemon - changes to src/ will auto-restart"
	@echo "🎭 Puppeteer: Running locally in headless mode"
	@chmod +x scripts/run-local-lambda.js
	NODE_ENV=development HEADLESS=false @npx nodemon

# Serve UI locally using Vite dev server (recommended for development)
serve-ui:
	@echo "🖥️ Starting Vite dev server..."
	@echo "🧹 Killing any existing Vite server..."
	@pkill -f "vite" || true
	@sleep 1
	@echo "📍 UI will be available at: http://localhost:8081"
	@echo "✨ Hot reload enabled - changes auto-refresh"
	@echo "Press Ctrl+C to stop"
	@cd ui-new && npm run dev

# Serve pre-built UI from docs/ (for testing production build)
serve-ui-prod:
	@echo "🖥️ Starting production UI server on port 8082..."
	@if [ ! -d docs ]; then \
		echo "⚠️ docs/ not found. Building UI first..."; \
		make build-ui; \
	fi
	@echo "📍 UI available at: http://localhost:8082"
	@echo "⚠️  Note: This serves the production build with GitHub Pages base path"
	@echo "Press Ctrl+C to stop"
	@cd docs && python3 -m http.server 8082

# Run both Lambda (3000) and UI (8081) locally for development
dev:
	@echo "🚀 Starting local development environment..."
	@echo "🧹 Cleaning up any existing servers..."
	-@pkill -f "node scripts/run-local-lambda" 2>/dev/null || true
	-@pkill -f "vite" 2>/dev/null || true
	@sleep 1
	@echo ""
	@echo "This will start:"
	@echo "  📍 Lambda server: http://localhost:3000 (hot reload enabled)"
	@echo "  📍 UI dev server: http://localhost:8081 (with hot reload)"
	@echo "  🎭 Puppeteer: Local mode with visible browser (HEADLESS=false)"
	@echo ""
	@echo "✨ Both servers have hot reload - file changes auto-restart/refresh"
	@echo "Press Ctrl+C to stop both servers"
	@echo ""
	@bash -c 'trap "kill 0" INT; NODE_ENV=development HEADLESS=false npx nodemon & sleep 2; cd ui-new && npm run dev & wait'

# ================================================================
# RAG Knowledge Base Management
# ================================================================

# Ingest documents into knowledge base
rag-ingest:
	@echo "📚 Ingesting documents into RAG knowledge base..."
	@if [ ! -f .env ]; then \
		echo "⚠️  Warning: .env file not found"; \
		echo "Create .env with: OPENAI_API_KEY='your-key'"; \
	fi
	@chmod +x scripts/ingest-documents.js
	@LIBSQL_URL="file:///$$(pwd)/rag-kb.db" node scripts/ingest-documents.js $(filter-out rag-ingest,$(MAKECMDGOALS))

# Show database statistics
rag-stats:
	@echo "📊 RAG Knowledge Base Statistics"
	@echo ""
	@chmod +x scripts/db-stats.js
	@LIBSQL_URL="file:///$$(pwd)/rag-kb.db" node scripts/db-stats.js

# List all documents in knowledge base
rag-list:
	@echo "📋 Listing documents in knowledge base..."
	@echo ""
	@chmod +x scripts/list-documents.js
	@LIBSQL_URL="file:///$$(pwd)/rag-kb.db" node scripts/list-documents.js

# Search knowledge base (usage: make rag-search QUERY="your search query")
rag-search:
	@if [ -z "$(QUERY)" ]; then \
		echo "⚠️  Error: QUERY parameter required"; \
		echo "Usage: make rag-search QUERY='your search query'"; \
		echo "Example: make rag-search QUERY='How does RAG work?'"; \
		exit 1; \
	fi
	@if [ ! -f .env ]; then \
		echo "⚠️  Warning: .env file not found"; \
		echo "Create .env with: OPENAI_API_KEY='your-key'"; \
	fi
	@chmod +x scripts/search-documents.js
	@LIBSQL_URL="file:///$$(pwd)/rag-kb.db" node scripts/search-documents.js "$(QUERY)"
	fi
	@chmod +x scripts/delete-document.js
	@LIBSQL_URL="file:///$$(pwd)/rag-kb.db" node scripts/delete-document.js "$(ID)"

# Advanced Scraping Setup and Testing

# Setup scraping environment (production + development dependencies)
setup-scraping:
	@echo "🔧 Setting up advanced scraping environment..."
	@echo ""
	@echo "📦 Installing production dependencies..."
	npm install
	@echo ""
	@echo "📦 Installing development dependencies (local-only scrapers)..."
	npm install --save-dev playwright playwright-extra puppeteer-extra-plugin-stealth
	npm install --save-dev selenium-webdriver chromedriver
	@echo ""
	@if command -v python3 > /dev/null 2>&1; then \
		echo "🐍 Setting up Python environment..."; \
		python3 -m venv .venv; \
		. .venv/bin/activate && pip install --upgrade pip; \
		. .venv/bin/activate && pip install undetected-chromedriver selenium; \
		echo "✅ Python environment ready"; \
	else \
		echo "⚠️  Python3 not found. Skipping Tier 3 (Selenium) setup."; \
		echo "   Install Python 3.8+ to use undetected-chromedriver."; \
	fi
	@echo ""
	@echo "🌐 Installing Playwright browsers..."
	npx playwright install chromium firefox
	@echo ""
	@if [ ! -f .env ]; then \
		echo "📝 Creating .env file..."; \
		echo "# Development mode (enables local-only tiers)" > .env; \
		echo "NODE_ENV=development" >> .env; \
		echo "" >> .env; \
		echo "# Scraping settings" >> .env; \
		echo "HEADLESS=true" >> .env; \
		echo "USE_PUPPETEER=true" >> .env; \
		echo "" >> .env; \
		echo "# Tier control (1 for Lambda, 4 for local)" >> .env; \
		echo "SCRAPING_MAX_TIER=4" >> .env; \
		echo "SCRAPING_ENABLE_INTERACTIVE=true" >> .env; \
		echo "" >> .env; \
		echo "# Python environment (for Tier 3 - Selenium)" >> .env; \
		echo "PYTHON_VENV_PATH=./.venv" >> .env; \
		echo "✅ .env file created"; \
	fi
	@echo ""
	@echo "✅ Scraping environment setup complete!"
	@echo ""
	@echo "Available tiers:"
	@echo "  Tier 0: Direct HTTP (production + local)"
	@echo "  Tier 1: Puppeteer + stealth (production + local)"
	@echo "  Tier 2: Playwright + stealth (local only)"
	@echo "  Tier 3: Selenium + undetected-chromedriver (local only)"
	@echo "  Tier 4: Interactive mode (local only)"

# Install Playwright browsers
install-playwright:
	@echo "🌐 Installing Playwright browsers..."
	npx playwright install chromium firefox

# Setup Python environment for Tier 3
install-python:
	@echo "🐍 Setting up Python environment for Tier 3..."
	@if command -v python3 > /dev/null 2>&1; then \
		python3 -m venv .venv; \
		. .venv/bin/activate && pip install --upgrade pip; \
		. .venv/bin/activate && pip install undetected-chromedriver selenium; \
		echo "✅ Python environment ready"; \
	else \
		echo "❌ Python3 not found. Please install Python 3.8+"; \
		exit 1; \
	fi

# Test multi-tier scraping system
test-scraping:
	@echo "🧪 Testing multi-tier scraping system..."
	@if [ -f tests/test-tier-orchestrator.js ]; then \
		NODE_ENV=development node tests/test-tier-orchestrator.js; \
	else \
		echo "❌ Test file not found: tests/test-tier-orchestrator.js"; \
		exit 1; \
	fi

# Test all available tiers
test-tiers:
	@echo "🧪 Testing all available tiers..."
	@echo ""
	@echo "Tier 0: Direct HTTP..."
	@make test-tier-0 || true
	@echo ""
	@echo "Tier 1: Puppeteer + stealth..."
	@make test-tier-1 || true
	@echo ""
	@echo "Tier 2: Playwright + stealth..."
	@make test-tier-2 || true
	@echo ""
	@echo "Tier 3: Selenium + undetected-chromedriver..."
	@make test-tier-3 || true
	@echo ""
	@echo "Tier 4: Interactive mode..."
	@make test-tier-4 || true

# Test individual tiers
test-tier-0:
	@echo "🧪 Testing Tier 0 (Direct HTTP)..."
	@NODE_ENV=development node -e "const Tier0 = require('./src/scrapers/tier-0-direct.js'); \
		const scraper = new Tier0(); \
		scraper.scrape('https://example.com').then(result => { \
			console.log('Result:', result.success ? '✅ SUCCESS' : '❌ FAILED'); \
			console.log('Tier:', result.tierName); \
			console.log('Duration:', result.metadata.duration + 'ms'); \
		}).catch(err => { \
			console.error('Error:', err.message); \
			process.exit(1); \
		});"

test-tier-1:
	@echo "🧪 Testing Tier 1 (Puppeteer + stealth)..."
	@NODE_ENV=development node -e "const Tier1 = require('./src/scrapers/tier-1-puppeteer.js'); \
		(async () => { \
			const result = await Tier1.scrape('https://example.com'); \
			console.log('Result:', result.success ? '✅ SUCCESS' : '❌ FAILED'); \
			console.log('Tier:', result.tierName); \
			console.log('Duration:', result.metadata.duration + 'ms'); \
		})().catch(err => { \
			console.error('Error:', err.message); \
			process.exit(1); \
		});"

test-tier-2:
	@echo "🧪 Testing Tier 2 (Playwright + stealth)..."
	@NODE_ENV=development node -e "const Tier2 = require('./src/scrapers/tier-2-playwright.js'); \
		(async () => { \
			const scraper = new Tier2(); \
			const result = await scraper.scrape('https://example.com'); \
			await scraper.cleanup(); \
			console.log('Result:', result.success ? '✅ SUCCESS' : '❌ FAILED'); \
			console.log('Tier:', result.tierName); \
			console.log('Duration:', result.metadata.duration + 'ms'); \
		})().catch(err => { \
			console.error('Error:', err.message); \
			process.exit(1); \
		});"

test-tier-3:
	@echo "🧪 Testing Tier 3 (Selenium + undetected-chromedriver)..."
	@NODE_ENV=development node -e "const Tier3 = require('./src/scrapers/tier-3-selenium.js'); \
		(async () => { \
			const result = await Tier3.scrape('https://example.com'); \
			console.log('Result:', result.success ? '✅ SUCCESS' : '❌ FAILED'); \
			console.log('Tier:', result.tierName); \
			console.log('Duration:', result.metadata.duration + 'ms'); \
		})().catch(err => { \
			console.error('Error:', err.message); \
			process.exit(1); \
		});"

test-tier-4:
	@echo "🧪 Testing Tier 4 (Interactive mode)..."
	@echo "⚠️  Tier 4 requires manual interaction - use test-scraping instead"
	@if [ -z "$(ID)" ]; then \
		echo "⚠️  Error: ID parameter required"; \
		echo "Usage: make rag-delete ID='snippet-id'"; \
		echo ""; \
		echo "To see available IDs, run: make rag-list"; \
		echo "Or use: node scripts/delete-document.js --list"; \
		exit 1; \
	fi
	@chmod +x scripts/delete-document.js
	@LIBSQL_URL="file:///$$(pwd)/rag-kb.db" node scripts/delete-document.js "$(ID)"