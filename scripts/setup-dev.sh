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

# Setup Python environment for Selenium YouTube caption scraper and Google Search
if command -v python3 &> /dev/null; then
    echo "🐍 Setting up Python environment..."
    
    # Check if system python3-selenium is available (Option 1 - RECOMMENDED)
    if ! python3 -c "import selenium" &> /dev/null; then
        echo "⚠️  python3-selenium not installed. Attempting to install..."
        if command -v apt &> /dev/null; then
            echo "📦 Installing python3-selenium via apt (system-wide)..."
            sudo apt update
            sudo apt install -y python3-selenium chromium-chromedriver
            echo "✅ Installed python3-selenium and chromium-chromedriver"
        else
            echo "⚠️  apt not available, falling back to venv installation..."
            
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
        fi
    else
        echo "✅ python3-selenium already installed"
    fi
    
    # Install undetected-chromedriver (for Google Search anti-bot bypass)
    if ! python3 -c "import undetected_chromedriver" &> /dev/null; then
        echo "📦 Installing undetected-chromedriver for anti-bot bypass..."
        if command -v pip3 &> /dev/null; then
            pip3 install --user undetected-chromedriver
        else
            /usr/bin/python3 -m pip install --user undetected-chromedriver
        fi
        echo "✅ Installed undetected-chromedriver"
    else
        echo "✅ undetected-chromedriver already installed"
    fi
else
    echo "⚠️  Python3 not found. Skipping Selenium setup."
    echo "   Install Python 3.8+ to use Selenium features."
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
