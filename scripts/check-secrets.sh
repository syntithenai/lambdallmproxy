#!/bin/bash
# Check for potential secrets before committing
# Run this before git push to catch secrets early

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🔍 Checking for potential secrets in staged files...${NC}"

# Patterns to check for
PATTERNS=(
    "GOCSPX-[a-zA-Z0-9_-]+"           # Google OAuth Client Secret
    "[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com"  # Google Client ID
    "sk-[a-zA-Z0-9]{20,}"              # OpenAI API keys
    "gsk_[a-zA-Z0-9]{52}"              # Groq API keys
    "AIzaSy[a-zA-Z0-9_-]{33}"          # Google API keys
    "-----BEGIN PRIVATE KEY-----"      # Private keys
    "tvly-[a-zA-Z0-9]{32,}"           # Tavily API keys
)

FOUND_SECRETS=0

# Check staged files
for pattern in "${PATTERNS[@]}"; do
    if git diff --cached | grep -qE "$pattern"; then
        echo -e "${RED}❌ Found potential secret matching: $pattern${NC}"
        FOUND_SECRETS=1
    fi
done

# Check for .env file being staged
if git diff --cached --name-only | grep -q "^\.env$"; then
    echo -e "${RED}❌ .env file is staged for commit!${NC}"
    FOUND_SECRETS=1
fi

# Check for common secret files
SECRET_FILES=(".env" "*.env.backup.*" "abc2book-*.json" "env-vars.json")
for file_pattern in "${SECRET_FILES[@]}"; do
    if git diff --cached --name-only | grep -qE "$file_pattern"; then
        echo -e "${RED}❌ Secret file staged: $file_pattern${NC}"
        FOUND_SECRETS=1
    fi
done

if [ $FOUND_SECRETS -eq 1 ]; then
    echo ""
    echo -e "${RED}================================================${NC}"
    echo -e "${RED}  ⚠️  SECRETS DETECTED IN STAGED FILES  ⚠️${NC}"
    echo -e "${RED}================================================${NC}"
    echo ""
    echo -e "${YELLOW}Actions:${NC}"
    echo "  1. Remove secrets from files"
    echo "  2. Use placeholders like <your-api-key>"
    echo "  3. Ensure .env is in .gitignore"
    echo "  4. Run: git reset HEAD <file>  to unstage"
    echo ""
    exit 1
else
    echo -e "${GREEN}✅ No secrets detected in staged files${NC}"
    exit 0
fi
