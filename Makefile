# Makefile for AWS Lambda deployment
# Provides simple commands to deploy the llmproxy Lambda function

.PHONY: deploy deploy-bash deploy-node test clean check help cors build-docs env setup deploy-docs

# Default target
help:
	@echo "Available commands:"
	@echo "  make deploy      - Deploy using bash script (default)"
	@echo "  make deploy-bash - Deploy using bash script"
	@echo "  make deploy-node - Deploy using Node.js script"
	@echo "  make build-docs  - Build documentation with environment variables"
	@echo "  make deploy-docs - Commit and push docs/ to the current branch"
	@echo "  make test        - Test the deployed function"
	@echo "  make check       - Check prerequisites"
	@echo "  make cors        - Check CORS configuration"
	@echo "  make env         - Setup environment file from template"
	@echo "  make setup       - Complete setup (env + build docs)"
	@echo "  make clean       - Clean up temporary files"
	@echo "  make help        - Show this help message"

# Default deployment using bash script
deploy: deploy-bash

# Deploy using bash script
deploy-bash:
	@echo "🚀 Deploying Lambda function using bash script..."
	./deploy.sh

# Deploy using Node.js script
deploy-node:
	@echo "🚀 Deploying Lambda function using Node.js script..."
	./deploy.mjs

# Build documentation with environment variables
build-docs:
	@echo "📚 Building documentation..."
	@if [ ! -f .env ]; then \
		echo "❌ .env file not found. Run 'make env' first."; \
		exit 1; \
	fi
	./build-docs.sh

# Deploy (commit and push) docs folder
deploy-docs:
	@echo "⏫ Deploying docs (commit + push)..."
	@if [ ! -x scripts/deploy-docs.sh ]; then \
		chmod +x scripts/deploy-docs.sh; \
	fi
	scripts/deploy-docs.sh --build -m "via make deploy-docs"

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
	@test -f lambda_search_llm_handler.js && echo "✅ Found" || echo "❌ Not found"
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

# Show environment variables
env:
	@echo "🔧 Environment variables:"
	@aws lambda get-function-configuration --function-name llmproxy --region us-east-1 --query 'Environment.Variables' --output table

# Check CORS configuration
cors:
	@echo "🌐 CORS configuration:"
	@aws lambda get-function-url-config --function-name llmproxy --region us-east-1 --query '{AllowOrigins:Cors.AllowOrigins,AllowMethods:Cors.AllowMethods,AllowHeaders:Cors.AllowHeaders,InvokeMode:InvokeMode}' --output table

# Watch logs (requires AWS CLI logs plugin or AWS logs)
logs:
	@echo "📄 Showing recent logs..."
	@aws logs tail /aws/lambda/llmproxy --follow