/**
 * Legacy model selector tests focusing on Groq fallback behavior
 */

const path = require('path');

// Ensure environment variable exists for Groq API calls
process.env.GROQ_KEY = process.env.GROQ_KEY || 'test-key';

// Mock Groq rate limits to keep test deterministic
jest.mock('../../src/groq-rate-limits', () => ({
  GROQ_RATE_LIMITS: {
    'llama-3.3-70b-versatile': {
      context_window: 128000,
      tpm: 12000,
      rpm: 30,
      rpd: 1000,
      tpd: 100000,
      reasoning_capability: 'advanced',
      speed: 'moderate',
      vision_capable: false
    },
    'llama-3.3-70b-versatile': {
      context_window: 128000,
      tpm: 12000,
      rpm: 30,
      rpd: 1000,
      tpd: 100000,
      reasoning_capability: 'advanced',
      speed: 'moderate',
      vision_capable: false
    },
    'llama-3.1-8b-instant': {
      context_window: 128000,
      tpm: 6000,
      rpm: 30,
      rpd: 14400,
      tpd: 500000,
      reasoning_capability: 'basic',
      speed: 'fast',
      vision_capable: false
    }
  }
}));

// Mock https so fetchAvailableModels stays deterministic and fast
jest.mock('https', () => ({
  request: jest.fn((options, callback) => {
    const EventEmitter = require('events');
    const response = new EventEmitter();

    // Immediately invoke the callback with our fake response
    process.nextTick(() => {
      callback(response);
      const payload = JSON.stringify({
        data: [
          { id: 'llama-3.3-70b-versatile' },
          { id: 'llama-3.3-70b-specdec' },
          { id: 'llama-3.1-8b-instant' }
        ]
      });
      response.emit('data', payload);
      response.emit('end');
    });

    return {
      on: jest.fn(),
      setTimeout: jest.fn(),
      end: jest.fn()
    };
  })
}));

const { selectModel } = require('../../src/model-selector');

describe('legacy selectModel', () => {
  test('avoids previously rate-limited model when selecting fallback', async () => {
    const excludeModels = ['llama-3.3-70b-versatile'];

    const selected = await selectModel(
      'Please answer this complex research question',
      'advanced',
      4000,
      null,
      {
        excludeModels,
        preferredFallbacks: [
          'llama-3.1-8b-instant',
          'llama-3.3-70b-specdec'
        ],
        availableModels: new Set([
          'llama-3.3-70b-versatile',
          'llama-3.3-70b-specdec',
          'llama-3.1-8b-instant'
        ])
      }
    );

    expect(selected).toBe('groq:llama-3.1-8b-instant');
  });
});
