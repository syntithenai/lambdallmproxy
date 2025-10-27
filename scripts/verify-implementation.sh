#!/bin/bash
# Quick verification script for Advanced Scraping Strategy implementation

echo "═══════════════════════════════════════════════════════════"
echo "  Advanced Scraping Strategy - Implementation Verification"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check if running in Lambda
if [ -n "$AWS_FN" ]; then
    echo "🌐 Environment: AWS Lambda (Production)"
    echo "   Available Tiers: 0, 1"
else
    echo "💻 Environment: Local Development"
    echo "   Available Tiers: 0, 1, 2, 3, 4"
fi
echo ""

# Check scraper files
echo "📁 Scraper Files:"
for tier in 0 1 2 3 4; do
    file="src/scrapers/tier-$tier-*.js"
    if ls $file 1> /dev/null 2>&1; then
        filename=$(ls $file | head -1)
        echo "   ✅ Tier $tier: $(basename $filename)"
    else
        echo "   ❌ Tier $tier: Missing"
    fi
done
echo ""

# Check orchestrator
if [ -f "src/scrapers/tier-orchestrator.js" ]; then
    echo "   ✅ Tier Orchestrator: tier-orchestrator.js"
else
    echo "   ❌ Tier Orchestrator: Missing"
fi
echo ""

# Check Python wrapper
echo "🐍 Python Integration:"
if [ -f "scripts/undetected-chrome.py" ]; then
    echo "   ✅ undetected-chrome.py"
    if [ -x "scripts/undetected-chrome.py" ]; then
        echo "      (executable)"
    fi
else
    echo "   ❌ undetected-chrome.py: Missing"
fi
echo ""

# Check deployment scripts
echo "🚀 Deployment Scripts:"
if [ -f "scripts/setup-dev.sh" ]; then
    echo "   ✅ setup-dev.sh"
else
    echo "   ❌ setup-dev.sh: Missing"
fi
if [ -f "scripts/deploy-production.sh" ]; then
    echo "   ✅ deploy-production.sh"
else
    echo "   ❌ deploy-production.sh: Missing"
fi
echo ""

# Check test files
echo "🧪 Test Files:"
if [ -f "tests/test-tier-orchestrator.js" ]; then
    echo "   ✅ test-tier-orchestrator.js"
else
    echo "   ❌ test-tier-orchestrator.js: Missing"
fi
if [ -f "tests/test-scraping-integration.js" ]; then
    echo "   ✅ test-scraping-integration.js"
else
    echo "   ❌ test-scraping-integration.js: Missing"
fi
echo ""

# Check dependencies
echo "📦 Dependencies:"

# Check production dependencies
if grep -q '"puppeteer-extra"' package.json; then
    echo "   ✅ puppeteer-extra (production)"
else
    echo "   ❌ puppeteer-extra: Missing"
fi

if grep -q '"puppeteer-extra-plugin-stealth"' package.json; then
    echo "   ✅ puppeteer-extra-plugin-stealth (production)"
else
    echo "   ❌ puppeteer-extra-plugin-stealth: Missing"
fi

# Check dev dependencies
if grep -A 10 '"devDependencies"' package.json | grep -q '"playwright"'; then
    echo "   ✅ playwright (devDependencies)"
else
    echo "   ⚠️  playwright: Not in devDependencies (should be)"
fi

if grep -A 10 '"devDependencies"' package.json | grep -q '"selenium-webdriver"'; then
    echo "   ✅ selenium-webdriver (devDependencies)"
else
    echo "   ⚠️  selenium-webdriver: Not in devDependencies (should be)"
fi
echo ""

# Check Python environment
echo "🐍 Python Environment:"
if command -v python3 &> /dev/null; then
    python_version=$(python3 --version | cut -d' ' -f2)
    echo "   ✅ Python: $python_version"
    
    if [ -d ".venv" ]; then
        echo "   ✅ Virtual environment: .venv/"
        
        if [ -f ".venv/bin/activate" ]; then
            # Check if undetected-chromedriver is installed
            if .venv/bin/pip list 2>/dev/null | grep -q "undetected-chromedriver"; then
                version=$(.venv/bin/pip show undetected-chromedriver 2>/dev/null | grep Version | cut -d' ' -f2)
                echo "   ✅ undetected-chromedriver: $version"
            else
                echo "   ⚠️  undetected-chromedriver: Not installed"
                echo "      Run: make install-python"
            fi
        fi
    else
        echo "   ⚠️  Virtual environment: Not created"
        echo "      Run: make install-python"
    fi
else
    echo "   ❌ Python3: Not found"
    echo "      Tier 3 (Selenium) requires Python 3.8+"
fi
echo ""

# Check Playwright browsers
echo "🌐 Playwright Browsers:"
if command -v npx &> /dev/null; then
    if [ -d "$HOME/.cache/ms-playwright" ] || [ -d "~/Library/Caches/ms-playwright" ]; then
        echo "   ✅ Playwright browsers installed"
    else
        echo "   ⚠️  Playwright browsers: Not installed"
        echo "      Run: make install-playwright"
    fi
else
    echo "   ⚠️  npx not available"
fi
echo ""

# Check Makefile targets
echo "🔧 Makefile Targets:"
if grep -q "setup-scraping:" Makefile 2>/dev/null; then
    echo "   ✅ make setup-scraping"
else
    echo "   ❌ make setup-scraping: Missing"
fi
if grep -q "test-scraping:" Makefile 2>/dev/null; then
    echo "   ✅ make test-scraping"
else
    echo "   ❌ make test-scraping: Missing"
fi
if grep -q "test-tiers:" Makefile 2>/dev/null; then
    echo "   ✅ make test-tiers"
else
    echo "   ❌ make test-tiers: Missing"
fi
echo ""

# Summary
echo "═══════════════════════════════════════════════════════════"
echo "  Quick Start Commands"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Setup (first time):"
echo "  make setup-scraping     # Install all dependencies"
echo ""
echo "Testing:"
echo "  make test-tiers         # Test all available tiers"
echo "  make test-scraping      # Run integration tests"
echo ""
echo "Deployment:"
echo "  make deploy-lambda      # Deploy to AWS Lambda (Tier 0-1 only)"
echo ""
echo "═══════════════════════════════════════════════════════════"
