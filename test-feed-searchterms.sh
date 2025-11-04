#!/bin/bash

# Test if feed generation endpoint receives and uses searchTerms correctly

echo "🧪 Testing feed generation with user interests..."
echo ""

# Get a test token (you'll need to replace this with a real token)
TOKEN="eyJhbGciOiJSUzI1NiIsImtpZCI6IjY4YWE1NDc4OGUyNjlkMWE4NmRjYWE1OWFlZWQ0YWY4OTRjMTk0YjUiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJhenAiOiI4NDQ2MzQzODc5ODEtODN0ZGVkbzg2dmZ2ajVjb3EyM3N1a25xOGY4czRpNjIuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJhdWQiOiI4NDQ2MzQzODc5ODEtODN0ZGVkbzg2dmZ2ajVjb3EyM3N1a25xOGY4czRpNjIuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJzdWIiOiIxMTc2NjA5MzAyOTQyMTcyNDE5NjciLCJlbWFpbCI6InN0ZXZlckBzeW50aXRoZW5haS5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwibmJmIjoxNzMwNTk5NzA1LCJuYW1lIjoiU3RldmUgUnlhbiIsInBpY3R1cmUiOiJodHRwczovL2xoMy5nb29nbGV1c2VyY29udGVudC5jb20vYS9BQ2c4b2NKR0l6TTh0V3pwTjVBQ3VNbGRuN0NnbTRHRzBpazZCZC1IQVFNanprWHRBUFFFdVFcdTAwM2RzOTYtYyIsImdpdmVuX25hbWUiOiJTdGV2ZSIsImZhbWlseV9uYW1lIjoiUnlhbiIsImlhdCI6MTczMDYwMDAwNSwiZXhwIjoxNzMwNjAzNjA1LCJqdGkiOiJmMzAyNTFhNzVjMjRiNDE1ZGI4NjY2NTdjMWE1MjcwODk5MjY3MTNhIn0.dummy"

# Test request with search terms
curl -X POST http://localhost:3000/feed/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "swagContent": [],
    "searchTerms": ["quantum computing", "artificial intelligence"],
    "count": 3,
    "preferences": {
      "searchTerms": [],
      "likedTopics": [],
      "dislikedTopics": [],
      "lastGenerated": "2025-01-01T00:00:00.000Z"
    }
  }' 2>&1 | head -200

echo ""
echo "✅ Test complete. Check logs above for:"
echo "  - '👤 Using 2 user-provided search terms: [...]'"
echo "  - Content related to quantum computing and AI"
