/**
 * Test fixtures and mock data
 */

module.exports = {
  // Mock search results
  searchResults: {
    simple: [
      {
        title: 'Example Result 1',
        url: 'https://example.com/1',
        description: 'First example search result'
      },
      {
        title: 'Example Result 2',
        url: 'https://example.com/2',
        description: 'Second example search result'
      }
    ],

    complex: [
      {
        title: 'Complex Machine Learning Guide',
        url: 'https://ml-guide.com',
        description: 'Comprehensive guide to machine learning algorithms and techniques',
        score: 95
      },
      {
        title: 'Neural Networks Explained',
        url: 'https://neural-networks.org',
        description: 'Deep dive into neural network architectures',
        score: 87
      }
    ]
  },

  // Mock LLM responses
  llmResponses: {
    simple: {
      text: 'This is a simple test response from the LLM.',
      usage: {
        prompt_tokens: 50,
        completion_tokens: 25,
        total_tokens: 75
      }
    },

    withTools: {
      text: 'Let me search for information about this topic.',
      output: [
        {
          type: 'function_call',
          name: 'search_web',
          call_id: 'test-call-1',
          arguments: '{"query": "machine learning basics"}'
        }
      ]
    }
  },

  // Mock continuation states
  continuationStates: {
    empty: {
      searchResults: [],
      completedToolCalls: [],
      currentIteration: 0,
      researchPlan: null
    },

    withSearches: {
      searchResults: [
        {
          query: 'machine learning',
          title: 'ML Guide',
          url: 'https://example.com',
          description: 'Guide to ML',
          summary: 'Machine learning is...'
        }
      ],
      completedToolCalls: [],
      currentIteration: 1,
      researchPlan: {
        complexity_assessment: 'medium'
      }
    }
  },

  // Mock error responses
  errors: {
    rateLimit: {
      message: 'Rate limit reached for model `llama-3.1-8b-instant` in organization `org_123` service tier `on_demand` on tokens per minute (TPM): Limit 6000, Used 6420, Requested 468. Please try again in 8.881s.',
      type: 'tokens',
      code: 'rate_limit_exceeded'
    },

    unauthorized: {
      message: 'Invalid authentication token',
      code: 'unauthorized'
    },

    invalidModel: {
      message: 'Model groq:invalid-model not found',
      code: 'model_not_found'
    }
  },

  // Mock Lambda events
  lambdaEvents: {
    validPost: {
      httpMethod: 'POST',
      headers: {
        'authorization': 'Bearer valid-token',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        query: 'What is machine learning?',
        model: 'groq:llama-3.1-8b-instant'
      })
    },

    optionsRequest: {
      httpMethod: 'OPTIONS',
      headers: {
        'origin': 'https://example.com'
      }
    },

    invalidAuth: {
      httpMethod: 'POST',
      headers: {
        'authorization': 'Bearer invalid-token',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        query: 'test query',
        model: 'groq:llama-3.1-8b-instant'
      })
    }
  }
};