#!/bin/bash

# Fix remaining shell script references
# These are grep patterns that need to find new variable names in .env files

files_to_fix=(
  "scripts/deploy.sh"
  "scripts/setup-dev.sh"
  "scripts/upload-rag-db.sh"
  "scripts/status.sh"
)

for file in "${files_to_fix[@]}"; do
  if [ -f "$file" ]; then
    echo "Fixing $file..."
    
    # Fix grep patterns for .env reading
    sed -i "s/grep '\^ACCESS_SECRET='/grep '^ACC_SEC='/g" "$file"
    sed -i "s/grep '\^ALLOWED_EMAILS='/grep '^ALLOW_EM='/g" "$file"
    sed -i "s/grep '\^GOOGLE_CLIENT_ID='/grep '^GGL_CID='/g" "$file"
    sed -i "s/grep '\^OPENAI_API_KEY='/grep '^OPENAI_KEY='/g" "$file"
    sed -i "s/grep '\^GROQ_API_KEY='/grep '^GROQ_KEY='/g" "$file"
    sed -i "s/grep '\^OPENAI_API_BASE='/grep '^OPENAI_BASE='/g" "$file"
    sed -i "s/grep '\^OPENAI_MODEL='/grep '^OPENAI_MDL='/g" "$file"
    sed -i "s/grep '\^GROQ_MODEL='/grep '^GROQ_MDL='/g" "$file"
    sed -i "s/grep '\^REASONING_EFFORT='/grep '^REASON_EFF='/g" "$file"
    sed -i "s/grep '\^MAX_TOOL_ITERATIONS='/grep '^MAX_ITER='/g" "$file"
    sed -i "s/grep '\^GROQ_REASONING_MODELS='/grep '^GROQ_REASON='/g" "$file"
    sed -i "s/grep '\^LAMBDA_MEMORY='/grep '^LAM_MEM='/g" "$file"
    sed -i "s/grep '\^USE_PUPPETEER='/grep '^USE_PPT='/g" "$file"
    sed -i "s/grep '\^PYTHON_VENV_PATH='/grep '^PYTHON_VENV='/g" "$file"
    sed -i "s/grep '\^NODE_ENV='/grep '^ENV='/g" "$file"
    sed -i "s/grep '\^AWS_REGION='/grep '^AWS_RGN='/g" "$file"
    sed -i "s/grep '\^SYSTEM_PROMPT_SEARCH='/grep '^SYS_SRCH='/g" "$file"
    sed -i "s/grep '\^MAX_TODO_AUTO_ITERATIONS='/grep '^MAX_TODO='/g" "$file"
    
    # Fix hardcoded values that aren't grep patterns
    sed -i "s/NODE_ENV=development/ENV=development/g" "$file"
    sed -i "s/HEADLESS=true/HEADLESS=true/g" "$file"  # Keep HEADLESS as is (no change in mapping)
    
    echo "  ✓ Fixed $file"
  fi
done

echo "Done!"
