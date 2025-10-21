#!/bin/bash
# scripts/setup-dev.sh - Setup local development environment

set -e

echo "🔧 Setting up development environment..."

# Install production dependencies
echo "📦 Installing production dependencies..."
npm install

# Install development dependencies (local-only scrapers)
echo "📦 Installing development dependencies..."
npm install --save-dev playwright playwright-extra playwright-extra-plugin-stealth
npm install --save-dev selenium-webdriver chromedriver

# Setup Python environment for undetected-chromedriver
if command -v python3 &> /dev/null; then
    echo "🐍 Setting up Python environment..."
    python3 -m venv .venv
    source .venv/bin/activate
    pip install --upgrade pip
    pip install undetected-chromedriver selenium
    echo "✅ Python environment ready"
else
    echo "⚠️  Python3 not found. Skipping Tier 3 (Selenium) setup."
    echo "   Install Python 3.8+ to use undetected-chromedriver."
fi

# Install Playwright browsers
echo "🌐 Installing Playwright browsers..."
npx playwright install chromium firefox

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cat > .env << 'ENVEOF'
# Development mode (enables local-only tiers)
NODE_ENV=development

# Scraping settings
HEADLESS=true
USE_PUPPETEER=true

# Tier control (1 for Lambda, 4 for local)
SCRAPING_MAX_TIER=4
SCRAPING_ENABLE_INTERACTIVE=true

# Python environment (for Tier 3 - Selenium)
PYTHON_VENV_PATH=./.venv
ENVEOF
    echo "✅ .env file created"
fi

echo ""
echo "✅ Development environment setup complete!"
echo ""
echo "Available scraping tiers:"
echo "  Tier 0: Direct HTTP (production + local)"
echo "  Tier 1: Puppeteer + stealth (production + local)"
echo "  Tier 2: Playwright + stealth (local only)"
echo "  Tier 3: Selenium + undetected-chromedriver (local only)"
echo "  Tier 4: Interactive mode (local only)"
echo ""
echo "Run 'make dev' to start development server"
