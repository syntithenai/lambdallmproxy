#!/bin/bash
# Example script demonstrating the new parallel search functionality

LAMBDA_URL="https://your-lambda-url.amazonaws.com/search"

echo "=== Single Query Example (Backward Compatible) ==="
curl -X POST "$LAMBDA_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "quantum computing",
    "maxResults": 3
  }' | jq '.'

echo ""
echo "=== Multiple Queries Example (Parallel Execution) ==="
curl -X POST "$LAMBDA_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "query": [
      "quantum computing basics",
      "quantum computing applications", 
      "quantum computing vs classical computing"
    ],
    "maxResults": 3,
    "includeContent": true
  }' | jq '.'

echo ""
echo "=== Research Use Case: Topic Exploration ==="
curl -X POST "$LAMBDA_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "queries": [
      "machine learning fundamentals",
      "machine learning algorithms",
      "machine learning applications",
      "machine learning challenges",
      "machine learning future trends"
    ],
    "maxResults": 5,
    "includeContent": true
  }' | jq '.searches[] | {query: .query, count: .count, error: .error}'
