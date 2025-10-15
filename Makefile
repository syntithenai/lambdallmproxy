# Lambda LLM Proxy Makefile
# Simple, clear deployment commands

SHELL := /bin/bash

.PHONY: help deploy-lambda deploy-lambda-fast deploy-env build-ui deploy-ui all update-catalog clean serve logs logs-tail run-lambda-local serve-ui dev setup-puppeteer deploy-puppeteer setup-puppeteer-permissions logs-puppeteer rag-ingest rag-stats rag-list rag-search rag-delete

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
	@chmod +x scripts/run-local-lambda.js
	@node scripts/run-local-lambda.js

# Serve UI locally using Vite dev server (recommended for development)
serve-ui:
	@echo "🖥️ Starting Vite dev server..."
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
	@echo ""
	@echo "This will start:"
	@echo "  📍 Lambda server: http://localhost:3000"
	@echo "  📍 UI dev server: http://localhost:8081 (with hot reload)"
	@echo ""
	@echo "Press Ctrl+C to stop both servers"
	@echo ""
	@trap 'kill 0' INT; \
	node scripts/run-local-lambda.js & \
	sleep 2; \
	cd ui-new && npm run dev & \
	wait

# ================================================================
# RAG Knowledge Base Management
# ================================================================

# Ingest documents into knowledge base
rag-ingest:
	@echo "📚 Ingesting documents into RAG knowledge base..."
	@if [ -z "$(OPENAI_API_KEY)" ]; then \
		echo "⚠️  Error: OPENAI_API_KEY environment variable not set"; \
		echo "Set it with: export OPENAI_API_KEY='your-key'"; \
		exit 1; \
	fi
	@if [ ! -d knowledge-base ]; then \
		echo "⚠️  Error: knowledge-base/ directory not found"; \
		exit 1; \
	fi
	@chmod +x scripts/ingest-documents.js
	@LIBSQL_URL="file:///$$(pwd)/rag-kb.db" node scripts/ingest-documents.js ./knowledge-base

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
	@if [ -z "$(OPENAI_API_KEY)" ]; then \
		echo "⚠️  Error: OPENAI_API_KEY environment variable not set"; \
		echo "Set it with: export OPENAI_API_KEY='your-key'"; \
		exit 1; \
	fi
	@chmod +x scripts/search-documents.js
	@LIBSQL_URL="file:///$$(pwd)/rag-kb.db" node scripts/search-documents.js "$(QUERY)"

# Delete document by snippet ID (usage: make rag-delete ID="snippet-id")
rag-delete:
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