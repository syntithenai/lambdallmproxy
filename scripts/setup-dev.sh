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

# Setup Python environment for Selenium YouTube caption scraper
if command -v python3 &> /dev/null; then
    echo "🐍 Setting up Python environment..."
    
    # Check if python3-venv is available
    if ! python3 -m venv --help &> /dev/null; then
        echo "⚠️  python3-venv not installed. Installing..."
        if command -v apt &> /dev/null; then
            sudo apt install -y python3-venv python3-full
        else
            echo "❌ Please install python3-venv manually for your system"
            exit 1
        fi
    fi
    
    # Create virtual environment in project root (venv, not .venv)
    if [ ! -d "venv" ]; then
        python3 -m venv venv
        echo "✅ Created Python virtual environment: venv/"
    fi
    
    # Activate and install dependencies
    source venv/bin/activate
    pip install --upgrade pip
    pip install selenium undetected-chromedriver
    deactivate
    echo "✅ Python environment ready (venv/)"
else
    echo "⚠️  Python3 not found. Skipping Selenium YouTube scraper setup."
    echo "   Install Python 3.8+ to use Selenium caption extraction."
fi

# Install Playwright browsers
echo "🌐 Installing Playwright browsers..."
npx playwright install chromium firefox

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cat > .env << 'ENVEOF'
# Development mode (enables local-only tiers)
ENV=development

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
