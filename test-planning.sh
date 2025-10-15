#!/bin/bash

# Test script to trigger a planning request and see transparency events
echo "Testing planning endpoint with transparency logging..."

LAMBDA_URL="https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws"
TOKEN="eyJhbGciOiJSUzI1NiIsImtpZCI6IjZmOTU1MDA0ZTJkNjVkMjkyZGQ0NDM3ODBkNjJiMzEzNjI0MDQ2MTMiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJhY2NvdW50cy5nb29nbGUuY29tIiwiYXVkIjoiODMyMDc3NzE5MDQzLTBlZDFlbTVjYzE1bTJsY3Foc3V0M2Y5bG5qZzU4b3BvLmFwcHMuZ29vZ2xldXNlcmNvbnRlbnQuY29tIiwic3ViIjoiMTA5ODQzMTU3MDA3MjI0NzYwMzYwIiwiZW1haWwiOiJzeW50aXRoZW5haUBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiYXpwIjoiODMyMDc3NzE5MDQzLTBlZDFlbTVjYzE1bTJsY3Foc3V0M2Y5bG5qZzU4b3BvLmFwcHMuZ29vZ2xldXNlcmNvbnRlbnQuY29tIiwibmFtZSI6IlN0ZXZlbiIsInBpY3R1cmUiOiJodHRwczovL2xoMy5nb29nbGV1c2VyY29udGVudC5jb20vYS9BQ2c4b2NMM1lMUzhubDk3V2Z3MUFIZUxHY3BfejAzTnJjM3pxbzNqNTctZTNOeEhFOEE9czk2LWMiLCJnaXZlbl9uYW1lIjoiU3RldmVuIiwiaWF0IjoxNzYwNDA2NjkzLCJleHAiOjE3NjA0MTAyOTN9.C7aBJR2UGMWdLFSrLrLqwEHKUNmSz-gM9BgCGAV0i-xCEDmRgMJyB-_Vt86OzCKoVRlJxJV2R9z8wOO9s_sD6Qv9Y2a2WS-0U5bCmXhiIOJkXf1rKgVhqfRPjO4cF0rM3YhiB4i5TIzjN4VQqJF8AqCJ0YKOgKu4BOKKuGvKmdFLXNh2H4Z5GzZW8dPr3m5jv8iJzOF0xGh6cR-9TBJhHMi-yNm-4HQcWJUv5U9rYwFOtF8jgSF-5VrJj3wC0CzV0Y_Pp_u-s2xYV3GFBdwBgmYBqJ3fP5kHj8owWtB9gj20n9kONxKKaU7m0KQK-iFb-hC5xD5j-IKRKQdHBEaOhSs5_A"

curl -X POST "$LAMBDA_URL/planning" \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{
    "query": "What are renewable energy benefits?",
    "providers": {
      "groq": {"apiKey": "gsk_0000000000000000000000000000000000000000000000"},
      "groq-free": {"apiKey": "gsk_free"}
    }
  }' \
  --max-time 30 \
  --show-error \
  --fail \
  2>&1