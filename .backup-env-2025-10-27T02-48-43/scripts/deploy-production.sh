#!/bin/bash
# scripts/deploy-production.sh - Deploy to AWS Lambda

set -e

echo "🚀 Deploying to production Lambda..."

# Verify only production dependencies
echo "📦 Checking dependencies..."
if [ -f package.json ]; then
    # Check for local-only packages in dependencies (should be in devDependencies)
    if grep -q '"playwright"' package.json | grep -v devDependencies; then
        echo "❌ ERROR: Playwright found in dependencies. Should be devDependency."
        exit 1
    fi
    if grep -q '"selenium-webdriver"' package.json | grep -v devDependencies; then
        echo "❌ ERROR: Selenium found in dependencies. Should be devDependency."
        exit 1
    fi
fi

# Install production dependencies only
echo "📦 Installing production dependencies..."
npm ci --production

# Verify puppeteer-extra is installed
if ! npm list puppeteer-extra > /dev/null 2>&1; then
    echo "❌ ERROR: puppeteer-extra not found. Required for Tier 1."
    exit 1
fi

if ! npm list puppeteer-extra-plugin-stealth > /dev/null 2>&1; then
    echo "❌ ERROR: puppeteer-extra-plugin-stealth not found. Required for Tier 1."
    exit 1
fi

# Build and deploy
echo "🔨 Building Lambda package..."
# Your existing deployment commands here
# Example:
# npm run build
# serverless deploy
# or: sam build && sam deploy
./deploy.sh

echo "✅ Deployment complete!"
echo ""
echo "⚠️  Production Lambda limitations:"
echo "   - Only Tier 0 (Direct) and Tier 1 (Puppeteer) available"
echo "   - Tier 2-4 require local execution"
