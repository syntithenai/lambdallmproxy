# Lambda LLM Proxy Makefile
# AI-Agent Friendly Deployment Commands

# Use bash for shell features (e.g., sourcing .env)
SHELL := /bin/bash

.PHONY: help deploy deploy-lambda deploy-docs build-docs test dev full-deploy install watch clean check cors env setup serve

# Default target - Show help with AI-agent recommendations
help:
	@echo "🚀 Lambda LLM Proxy Deployment Commands"
	@echo ""
	@echo "🔥 RECOMMENDED FOR AI AGENTS:"
	@echo "  make dev          - Quick Lambda deploy (use after code changes)"
	@echo "  make full-deploy  - Deploy everything (Lambda + docs)"
	@echo ""
	@echo "Individual Commands:"
	@echo "  make deploy       - Deploy Lambda function only"
	@echo "  make deploy-docs  - Deploy documentation only" 
	@echo "  make build-docs   - Build documentation locally"
	@echo "  make test         - Test Lambda function"
	@echo ""
	@echo "Development Commands:"
	@echo "  make watch        - Auto-deploy on file changes"
	@echo "  make install      - Install dependencies"
	@echo "  make status       - Check deployment status"
	@echo ""
	@echo "Legacy Commands:"
	@echo "  make deploy_ui    - Legacy UI deploy (use deploy-docs instead)"
	@echo "  make check        - Check prerequisites"
	@echo "  make cors         - Check CORS configuration"
	@echo "  make env          - Setup environment file"
	@echo "  make serve        - Serve docs locally"
	@echo "  make clean        - Clean temporary files"
	@echo "  make help        - Show this help message"

# Deploy Lambda function
deploy:
	@echo "🚀 Deploying Lambda function..."
	./scripts/deploy.sh
	@echo "🎨 Building and deploying UI..."
	@if [ ! -f .env ]; then \
		echo "❌ .env file not found. Run 'make setup' first."; \
		exit 1; \
	fi
	@# Use the build-docs.sh script which handles both modular and legacy templates
	@echo "📚 Building docs with build-docs.sh (supports modular structure)..."; \
	./scripts/build-docs.sh
	@echo "⏫ Committing and pushing docs to git (GitHub Pages or similar)..."
	@if [ ! -x scripts/deploy-docs.sh ]; then \
		chmod +x scripts/deploy-docs.sh; \
	fi
	scripts/deploy-docs.sh --build -m "Deploy Lambda + UI via make deploy"

# Build and deploy UI (build docs and push to git)
deploy_ui:
	@echo "🎨 Building and deploying UI..."
	@echo "📚 Building documentation..."
	./scripts/build-docs.sh
	@echo "⏫ Committing and pushing to git..."
	@if [ ! -x scripts/deploy-docs.sh ]; then \
		chmod +x scripts/deploy-docs.sh; \
	fi
	scripts/deploy-docs.sh --build -m "UI deployment via make deploy_ui"

# Build documentation with environment variables
build-docs:
	@echo "📚 Building documentation with environment variables..."
	./scripts/build-docs.sh

# Setup environment file from template
env:
	@echo "🔧 Setting up environment file..."
	@if [ -f .env ]; then \
		echo "⚠️  .env file already exists. Skipping..."; \
	else \
		cp .env.example .env; \
		echo "✅ Created .env from template"; \
		echo "⚠️  Please edit .env and fill in your actual values"; \
	fi

# Complete setup process
setup: env
	@echo "🚀 Running complete setup..."
	@echo "✅ Environment file ready"
	@echo "⚠️  Please edit .env with your actual values, then run 'make build-docs'"

# Test the deployed function (requires .env)
test:
	@echo "🧪 Testing deployed Lambda function..."
	@if [ ! -f .env ]; then \
		echo "❌ .env file not found. Run 'make setup' first."; \
		exit 1; \
	fi
	@export $$(cat .env | grep -v '^#' | xargs) && \
	curl -X POST $$LAMBDA_URL \
		-H "Content-Type: application/json" \
		-d '{"query":"test deployment","api_key":"'$$OPENAI_API_KEY'","access_secret":"'$$ACCESS_SECRET'"}' \
		| jq .

# Check prerequisites
check:
	@echo "🔍 Checking prerequisites..."
	@echo -n "AWS CLI: "
	@which aws > /dev/null && echo "✅ Available" || echo "❌ Not found"
	@echo -n "jq: "
	@which jq > /dev/null && echo "✅ Available" || echo "❌ Not found"
	@echo -n "Source file: "
	@test -f src/lambda_search_llm_handler.js && echo "✅ Found" || echo "❌ Not found (expected src/lambda_search_llm_handler.js)"
	@echo -n "AWS credentials: "
	@aws sts get-caller-identity > /dev/null 2>&1 && echo "✅ Configured" || echo "❌ Not configured"

# Clean up any temporary files
clean:
	@echo "🧹 Cleaning up temporary files..."
	@rm -rf /tmp/lambda-deploy-*
	@echo "✅ Cleanup completed"

# Quick deploy with test
deploy-and-test: deploy test

# Show Lambda function information
info:
	@echo "📊 Lambda function information:"
	@aws lambda get-function --function-name llmproxy --region us-east-1 --query 'Configuration.{FunctionName:FunctionName,Runtime:Runtime,LastModified:LastModified,CodeSize:CodeSize,Timeout:Timeout,MemorySize:MemorySize}' --output table

# Show Lambda environment variables
show-env:
	@echo "🔧 Lambda environment variables:"
	@aws lambda get-function-configuration --function-name llmproxy --region us-east-1 --query 'Environment.Variables' --output table

# Check CORS configuration
cors:
	@echo "🌐 CORS configuration:"
	@aws lambda get-function-url-config --function-name llmproxy --region us-east-1 --query '{AllowOrigins:Cors.AllowOrigins,AllowMethods:Cors.AllowMethods,AllowHeaders:Cors.AllowHeaders,InvokeMode:InvokeMode}' --output table

# Watch logs (requires AWS CLI logs plugin or AWS logs)
logs:
	@echo "📄 Showing recent logs..."
	@aws logs tail /aws/lambda/llmproxy --follow

# Serve the built docs locally on port 8081
serve:
	@echo "🖥️ Serving docs at http://localhost:8081 (Ctrl+C to stop)"
	@if [ ! -d docs ]; then \
		echo "⚠️ docs/ not found. Run 'make build-docs' first."; \
		exit 1; \
	fi
	@python3 -m http.server 8081 --directory docs

# ======= NEW AI-AGENT FRIENDLY COMMANDS =======

# Quick development deploy - Lambda only (RECOMMENDED for AI agents)
dev:
	@echo "🔥 Quick Development Deploy - Lambda Function Only"
	@echo "This is the recommended command for AI agents after code changes."
	@echo "Per instructions.md: Using scripts/deploy.sh for Lambda changes"
	./scripts/deploy.sh > output.txt 2>&1 && cat output.txt

# Deploy Lambda function only (alias for backward compatibility)
deploy-lambda: dev

# Deploy documentation only
deploy-docs:
	@echo "📖 Deploying Documentation..."
	@echo "Per instructions.md: Using scripts/deploy-docs.sh for UI changes"
	./scripts/deploy-docs.sh > output.txt 2>&1 && cat output.txt

# Build documentation locally
build-docs:
	@echo "🔨 Building Documentation..."
	./scripts/build-docs.sh > output.txt 2>&1 && cat output.txt

# Full deployment (build docs, deploy Lambda, deploy docs)
full-deploy:
	@echo "🚀 Full Deployment - Everything!"
	@echo "Per instructions.md: Using official deployment scripts with output.txt"
	@echo "Building docs..."
	./scripts/build-docs.sh > output.txt 2>&1 && cat output.txt
	@echo "Deploying Lambda..."
	./scripts/deploy.sh > output.txt 2>&1 && cat output.txt
	@echo "Deploying docs..."
	./scripts/deploy-docs.sh > output.txt 2>&1 && cat output.txt
	@echo "✅ Full deployment complete!"

# Install dependencies
install:
	@echo "📦 Installing Dependencies..."
	@if [ ! -f package.json ]; then \
		echo "⚠️ package.json not found."; \
	else \
		npm install; \
	fi

# Watch for changes and auto-deploy (requires nodemon)
watch:
	@echo "👀 Watching for changes... (Press Ctrl+C to stop)"
	@echo "Will auto-deploy Lambda function on file changes in src/"
	@if command -v nodemon >/dev/null 2>&1; then \
		nodemon --watch src --ext js --exec 'make dev'; \
	else \
		echo "❌ nodemon not found. Installing..."; \
		npm install -g nodemon; \
		nodemon --watch src --ext js --exec 'make dev'; \
	fi

# Show deployment status and configuration
status:
	@echo "🔍 Checking deployment status..."
	./scripts/status.sh > output.txt 2>&1 && cat output.txt