#!/bin/bash

echo "🧪 Running Lambda LLM Proxy Tests"
echo "=================================="

# Run tests with force exit to handle hanging processes
npm test -- --forceExit

echo ""
echo "📊 Test Results Summary:"
echo "- Unit Tests: Authentication, Search functionality"
echo "- Integration Tests: Lambda handler core logic"
echo "- Coverage: Run 'npm run test:coverage' for detailed coverage report"
echo ""
echo "💡 Tips:"
echo "- Use 'npm run test:watch' for development"
echo "- Use 'DEBUG_TESTS=1 npm test' to see console output"
echo "- Use 'npm run test:unit' or 'npm run test:integration' for specific test types"