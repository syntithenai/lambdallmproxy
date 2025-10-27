/**
 * OpenAI Provider Implementation
 * 
 * Implements BaseProvider interface for OpenAI API
 */

const https = require('https');
const { BaseProvider } = require('./base-provider');

/**
 * OpenAI API Provider
 * Handles requests to OpenAI's API
 */
class OpenAIProvider extends BaseProvider {
  constructor(config) {
    super(config);
    
    // Default endpoint if not provided
    if (!this.apiEndpoint) {
      this.apiEndpoint = 'https://api.openai.com/v1/chat/completions';
    }

    // Default models for OpenAI
    this.supportedModels = [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo',
      'o1-preview',
      'o1-mini'
    ];
  }

  getEndpoint() {
    return this.apiEndpoint;
  }

  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    };
  }

  buildRequestBody(messages, options = {}) {
    const body = {
      model: options.model || 'gpt-4o-mini',
      messages: messages,
      temperature: options.temperature ?? 0.8,
      max_tokens: options.max_tokens ?? 4096,
      top_p: options.top_p ?? 0.95,
      stream: options.stream ?? false
    };

    // Add tools if provided
    if (options.tools && Array.isArray(options.tools) && options.tools.length > 0) {
      body.tools = options.tools;
      body.tool_choice = options.tool_choice || 'required';
      // CRITICAL: Cannot set response_format when using tools/function calling
      // This causes "json mode cannot be combined with tool/function calling" error
      if (options.parallel_tool_calls !== undefined) {
        body.parallel_tool_calls = options.parallel_tool_calls;
      }
    }

    // Add frequency and presence penalties if provided
    if (options.frequency_penalty !== undefined) {
      body.frequency_penalty = options.frequency_penalty;
    }
    if (options.presence_penalty !== undefined) {
      body.presence_penalty = options.presence_penalty;
    }

    return body;
  }

  async makeRequest(messages, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.getEndpoint());
      const body = this.buildRequestBody(messages, { ...options, stream: false });
      const postData = JSON.stringify(body);

      const requestOptions = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(requestOptions, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk.toString();
        });

        res.on('end', () => {
          try {
            // Parse rate limits from headers
            const rateLimits = this.parseRateLimits(res.headers);

            if (res.statusCode !== 200) {
              const error = new Error(`OpenAI API error: ${res.statusCode}`);
              error.statusCode = res.statusCode;
              error.response = responseData;
              reject(this.handleError(error, { messages, options }));
              return;
            }

            const parsed = JSON.parse(responseData);
            resolve({
              ...parsed,
              rateLimits
            });
          } catch (error) {
            reject(this.handleError(error, { messages, options }));
          }
        });
      });

      req.on('error', (error) => {
        reject(this.handleError(error, { messages, options }));
      });

      req.write(postData);
      req.end();
    });
  }

  async streamRequest(messages, options = {}, onChunk) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.getEndpoint());
      const body = this.buildRequestBody(messages, { ...options, stream: true });
      const postData = JSON.stringify(body);

      const requestOptions = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(requestOptions, (res) => {
        // Parse rate limits from headers
        const rateLimits = this.parseRateLimits(res.headers);

        if (res.statusCode !== 200) {
          let errorData = '';
          res.on('data', (chunk) => {
            errorData += chunk.toString();
          });
          res.on('end', () => {
            const error = new Error(`OpenAI API error: ${res.statusCode}`);
            error.statusCode = res.statusCode;
            error.response = errorData;
            reject(this.handleError(error, { messages, options }));
          });
          return;
        }

        // Parse SSE stream
        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === ': ping') continue;

            if (trimmed.startsWith('data: ')) {
              const data = trimmed.substring(6);
              if (data === '[DONE]') {
                resolve({ rateLimits });
                return;
              }

              try {
                const parsed = JSON.parse(data);
                onChunk(parsed);
              } catch (error) {
                this.log('Failed to parse SSE chunk', { error: error.message, data });
              }
            }
          }
        });

        res.on('end', () => {
          resolve({ rateLimits });
        });

        res.on('error', (error) => {
          reject(this.handleError(error, { messages, options }));
        });
      });

      req.on('error', (error) => {
        reject(this.handleError(error, { messages, options }));
      });

      req.write(postData);
      req.end();
    });
  }

  parseRateLimits(headers) {
    // OpenAI uses slightly different header names
    return {
      requestsLimit: parseInt(headers['x-ratelimit-limit-requests']) || null,
      requestsRemaining: parseInt(headers['x-ratelimit-remaining-requests']) || null,
      tokensLimit: parseInt(headers['x-ratelimit-limit-tokens']) || null,
      tokensRemaining: parseInt(headers['x-ratelimit-remaining-tokens']) || null,
      resetTime: headers['x-ratelimit-reset-requests'] || headers['x-ratelimit-reset-tokens'] || null
    };
  }

  getSupportedModels() {
    return this.supportedModels;
  }
}

module.exports = {
  OpenAIProvider
};
