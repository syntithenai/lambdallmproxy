#!/bin/bash

# Test the multiplication table query with a simple curl request
echo "Testing multiplication table query..."

curl -X POST "http://localhost:3000/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Generate a multiplication table for numbers 1-12"}
    ],
    "model": "gpt-4o",
    "max_tokens": 4000,
    "stream": false,
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "execute_javascript",
          "description": "Execute JavaScript code in a secure sandbox environment for calculations and data processing.",
          "parameters": {
            "type": "object",
            "properties": {
              "code": { 
                "type": "string", 
                "description": "JavaScript code to execute. Include console.log() statements to display results."
              }
            },
            "required": ["code"]
          }
        }
      }
    ]
  }' \
  | jq '.'