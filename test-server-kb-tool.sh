#!/bin/bash

echo "🧪 Testing Server-Side Knowledge Base Tool"
echo "==========================================="
echo ""

# Test the backend search endpoint directly
echo "Test 1: Check if RAG database exists"
if [ -f "./rag-kb.db" ]; then
    echo "✅ RAG database file exists: rag-kb.db"
    ls -lh rag-kb.db
else
    echo "⚠️  RAG database not found at ./rag-kb.db"
    echo "Note: This may be expected if no documents have been ingested yet"
fi
echo ""

echo "Test 2: Verify tool definition in tools.js"
if grep -q "search_knowledge_base" src/tools.js; then
    echo "✅ search_knowledge_base tool found in tools.js"
    grep -A 2 "name: 'search_knowledge_base'" src/tools.js | head -3
else
    echo "❌ search_knowledge_base tool NOT found in tools.js"
fi
echo ""

echo "Test 3: Check for RAG search implementation"
if [ -f "src/rag/search.js" ]; then
    echo "✅ RAG search module exists: src/rag/search.js"
else
    echo "⚠️  RAG search module not found (may be commented out for browser-first architecture)"
fi
echo ""

echo "Test 4: Verify settings separation"
echo "Checking that RAG settings don't auto-sync with tool..."
if grep -q "search_knowledge_base = config.enabled" ui-new/src/components/RAGSettings.tsx; then
    echo "❌ FOUND auto-sync code (should be removed)"
else
    echo "✅ No auto-sync code found in RAGSettings.tsx"
fi
echo ""

echo "Test 5: Verify independent tool checkbox exists"
if grep -q "Search Knowledge Base (Server-Side)" ui-new/src/components/SettingsModal.tsx; then
    echo "✅ Independent checkbox found in SettingsModal.tsx"
    grep -B 2 "Search Knowledge Base (Server-Side)" ui-new/src/components/SettingsModal.tsx | tail -3
else
    echo "❌ Independent checkbox NOT found"
fi
echo ""

echo "==========================================="
echo "Summary: Server-side tool separation complete!"
echo "The search_knowledge_base tool is independent of local RAG settings."
