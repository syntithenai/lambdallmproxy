# Makefile for AWS Lambda deployment
# Provides simple commands to deploy the llmproxy Lambda function

# Use bash for shell features (e.g., sourcing .env)
SHELL := /bin/bash

.PHONY: deploy deploy_ui test clean check help cors build-docs env setup serve

# Default target
help:
	@echo "Available commands:"
	@echo "  make deploy      - Deploy Lambda and build+deploy UI from root index_template.html"
	@echo "  make deploy_ui   - Build and deploy UI (commit + push to git)"
	@echo "  make test        - Test the deployed function"
	@echo "  make check       - Check prerequisites"
	@echo "  make cors        - Check CORS configuration"
	@echo "  make env         - Setup environment file from template"
	@echo "  make setup       - Complete setup (env + build docs)"
	@echo "  make serve       - Serve docs/ locally at http://localhost:8081"
	@echo "  make clean       - Clean up temporary files"
	@echo "  make help        - Show this help message"

# Deploy Lambda function
deploy:
	@echo "🚀 Deploying Lambda function..."
	./scripts/deploy.sh
	@echo "🎨 Building and deploying UI from root index_template.html..."
	@if [ ! -f .env ]; then \
		echo "❌ .env file not found. Run 'make setup' first."; \
		exit 1; \
	fi
	@# Build docs from the root index_template.html (preferred). Fallback to script if not present
	@if [ -f index_template.html ]; then \
		echo "📚 Building docs (from index_template.html)..."; \
		set -a; . .env; set +a; \
		mkdir -p docs; \
		sed "s|{{LAMBDA_URL}}|$${LAMBDA_URL}|g" index_template.html | \
		sed "s|{{ACCESS_SECRET}}|$${ACCESS_SECRET}|g" | \
		sed "s|{{GOOGLE_CLIENT_ID}}|$${GOOGLE_CLIENT_ID}|g" > docs/index.html; \
		echo "✅ Built docs/index.html from index_template.html"; \
	else \
		echo "⚠️ index_template.html not found. Using scripts/build-docs.sh (ui/index_template.html)..."; \
		./scripts/build-docs.sh; \
	fi
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