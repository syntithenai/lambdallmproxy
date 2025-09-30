#!/bin/bash

# Install test dependencies
echo "📦 Installing test dependencies..."

npm install --save-dev jest@^29.7.0 @types/jest@^29.5.5

echo "✅ Test dependencies installed successfully!"
echo ""
echo "🧪 Available test commands:"
echo "  npm test              - Run all tests"
echo "  npm run test:watch    - Run tests in watch mode"
echo "  npm run test:coverage - Run tests with coverage report"
echo "  npm run test:unit     - Run only unit tests"
echo "  npm run test:integration - Run only integration tests"
echo ""
echo "🚀 To run tests:"
echo "  npm test"