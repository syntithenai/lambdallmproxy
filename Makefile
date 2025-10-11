# Lambda LLM Proxy Makefile
# Simple, clear deployment commands

SHELL := /bin/bash

.PHONY: help deploy-lambda deploy-lambda-fast deploy-env build-ui deploy-ui all update-catalog clean serve logs logs-tail run-lambda-local serve-ui dev

# Default target - Show help
help:
	@echo "🚀 Lambda LLM Proxy - Deployment Commands"
	@echo ""
	@echo "Lambda Function:"
	@echo "  make deploy-lambda       - Deploy Lambda function (full with dependencies)"
	@echo "  make deploy-lambda-fast  - Deploy Lambda function (code only, 10 sec)"
	@echo "  make setup-layer         - Create Lambda layer (run once before fast deploy)"
	@echo "  make deploy-env          - Deploy environment variables from .env to Lambda"
	@echo ""
	@echo "UI/Documentation:"
	@echo "  make build-ui            - Build React UI to docs/"
	@echo "  make deploy-ui           - Build and push UI to GitHub Pages"
	@echo ""
	@echo "Local Development:"
	@echo "  make run-lambda-local    - Run Lambda function locally on port 3000"
	@echo "  make serve-ui            - Serve UI locally on port 8081"
	@echo "  make dev                 - Run both Lambda (3000) and UI (8081) locally"
	@echo ""
	@echo "Combined:"
	@echo "  make all                 - Deploy everything (Lambda + UI)"
	@echo ""
	@echo "Utilities:"
	@echo "  make logs                - View recent Lambda CloudWatch logs"
	@echo "  make logs-tail           - Tail Lambda CloudWatch logs (live)"
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
	@aws logs tail /aws/lambda/llmproxy --since 5m --format short

# Tail Lambda CloudWatch logs (live)
logs-tail:
	@echo "📋 Tailing Lambda logs (Ctrl+C to stop)..."
	@aws logs tail /aws/lambda/llmproxy --follow --format short

# Run Lambda function locally on port 3000
run-lambda-local:
	@echo "🏃 Starting local Lambda server on port 3000..."
	@chmod +x scripts/run-local-lambda.js
	@node scripts/run-local-lambda.js

# Serve UI locally on port 8081
serve-ui:
	@echo "🖥️ Starting local UI server on port 8081..."
	@if [ ! -d docs ]; then \
		echo "⚠️ docs/ not found. Building UI first..."; \
		make build-ui; \
	fi
	@echo "📍 UI available at: http://localhost:8081"
	@echo "Press Ctrl+C to stop"
	@cd docs && python3 -m http.server 8081

# Run both Lambda (3000) and UI (8081) locally for development
dev:
	@echo "🚀 Starting local development environment..."
	@echo ""
	@echo "This will start:"
	@echo "  📍 Lambda server: http://localhost:3000"
	@echo "  📍 UI server: http://localhost:8081"
	@echo ""
	@echo "Press Ctrl+C to stop both servers"
	@echo ""
	@if [ ! -d docs ]; then \
		echo "⚠️ Building UI first..."; \
		make build-ui; \
		echo ""; \
	fi
	@trap 'kill 0' INT; \
	node scripts/run-local-lambda.js & \
	sleep 2; \
	cd docs && python3 -m http.server 8081 & \
	wait