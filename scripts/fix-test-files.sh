#!/bin/bash

# Fix test files with old environment variable names

echo "Fixing test files..."

# Function to fix a test file
fix_test_file() {
    local file="$1"
    echo "  Fixing $file..."
    
    # Replace OPENAI_API_KEY → OPENAI_KEY
    sed -i 's/OPENAI_API_KEY/OPENAI_KEY/g' "$file"
    
    # Replace GROQ_API_KEY → GROQ_KEY
    sed -i 's/GROQ_API_KEY/GROQ_KEY/g' "$file"
    
    # Replace LLAMDA_LLM_PROXY_PROVIDER_TYPE_ → P_T
    sed -i 's/LLAMDA_LLM_PROXY_PROVIDER_TYPE_/P_T/g' "$file"
    
    # Replace LLAMDA_LLM_PROXY_PROVIDER_KEY_ → P_K
    sed -i 's/LLAMDA_LLM_PROXY_PROVIDER_KEY_/P_K/g' "$file"
    
    # Replace LLAMDA_LLM_PROXY_PROVIDER_ENDPOINT_ → P_E
    sed -i 's/LLAMDA_LLM_PROXY_PROVIDER_ENDPOINT_/P_E/g' "$file"
    
    # Replace LLAMDA_LLM_PROXY_PROVIDER_MODEL_ → P_M
    sed -i 's/LLAMDA_LLM_PROXY_PROVIDER_MODEL_/P_M/g' "$file"
    
    echo "    ✓ Fixed $file"
}

# Find all test files with old variable names
grep -rl "OPENAI_API_KEY\|GROQ_API_KEY\|LLAMDA_LLM_PROXY_PROVIDER_" tests/ --include="*.js" 2>/dev/null | while read -r file; do
    fix_test_file "$file"
done

echo "Done!"
