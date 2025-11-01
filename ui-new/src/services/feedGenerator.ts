/**
 * Feed Generator Service - LLM-based Content Generation
 */

import type { 
  FeedItem, 
  FeedPreferences, 
  GenerateFeedRequest,
  FeedQuiz,
  FeedQuizQuestion,
  FeedQuizChoice
} from '../types/feed';
import { getCachedApiBase } from '../utils/api';

/**
 * Event types from SSE stream
 */
interface FeedGenerationEvent {
  type: 'status' | 'search_complete' | 'item_generated' | 'complete' | 'error' | 'personalization';
  message?: string;
  item?: FeedItem;
  searchResults?: number;
  resultsCount?: number;
  terms?: string[];
  error?: string;
  success?: boolean;
  itemsGenerated?: number;
  duration?: number;
  cost?: number;
  keywordsUsed?: number;
  topicsUsed?: number;
  quizEngagementCount?: number;
  searchTermsGenerated?: number;
}

/**
 * Generate feed items via SSE streaming
 */
export async function generateFeedItems(
  token: string,
  swagContent: string[],
  preferences: FeedPreferences,
  count: number = 5, // Reduced from 10 to 5 for higher quality with expanded content
  onProgress?: (event: FeedGenerationEvent) => void
): Promise<FeedItem[]> {
  const apiUrl = await getCachedApiBase();
  
  // Get maturity level from localStorage
  const maturityLevel = localStorage.getItem('feed_maturity_level') || 'adult';
  console.log(`🎓 Feed maturity level: ${maturityLevel}`);
  
  // Build request
  const requestBody: GenerateFeedRequest = {
    swagContent,
    searchTerms: preferences.searchTerms,
    count,
    preferences,
    maturityLevel: maturityLevel as 'child' | 'youth' | 'adult' | 'academic'
  };

  // Make SSE request
  console.log('🌐 Making feed generation request to:', `${apiUrl}/feed/generate`);
  console.log('📦 Request body:', requestBody);
  
  const response = await fetch(`${apiUrl}/feed/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(requestBody)
  });

  console.log('📡 Response status:', response.status, response.statusText);
  
  if (!response.ok) {
    const errorData = await response.json();
    console.error('❌ Feed generation error:', errorData);
    throw new Error(errorData.error || `Failed to generate feed: ${response.statusText}`);
  }

  // Parse SSE stream
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  const items: FeedItem[] = [];
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;

      // Decode chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete events (split by double newline)
      // Events can have format:
      // event: <type>\ndata: <json>\n\n
      // OR just: data: <json>\n\n
      const events = buffer.split('\n\n');
      buffer = events.pop() || ''; // Keep incomplete event in buffer

      for (const eventBlock of events) {
        if (!eventBlock.trim()) continue;
        
        // Skip padding lines (SSE keepalive)
        if (eventBlock.startsWith(':')) continue;

        // Parse SSE event block
        const lines = eventBlock.split('\n');
        let eventType: string | null = null;
        let eventData: string | null = null;

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.substring(7).trim();
          } else if (line.startsWith('data: ')) {
            eventData = line.substring(6).trim();
          }
        }

        // Parse event data
        if (eventData) {
          try {
            const parsedData = JSON.parse(eventData);
            
            // Create event object with type
            const event: FeedGenerationEvent = {
              type: eventType as any || parsedData.type || 'status',
              ...parsedData
            };

            console.log('📨 SSE Event received:', event.type, event);

            // Notify progress callback
            if (onProgress) {
              onProgress(event);
            }

            // Handle event types
            if (event.type === 'item_generated' && event.item) {
              items.push(event.item);
            } else if (event.type === 'error') {
              throw new Error(event.error || 'Unknown error during generation');
            }
          } catch (err) {
            console.error('Failed to parse SSE event data:', eventData, err);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return items;
}

/**
 * Generate a quiz for a feed item
 */
export async function generateFeedQuiz(
  token: string,
  item: FeedItem
): Promise<FeedQuiz> {
  const apiUrl = await getCachedApiBase();

  // Build quiz generation request - using simple JSON output
  const messages = [
    {
      role: 'system',
      content: `You are a quiz generator. Create a 10-question multiple-choice quiz based on the provided content.

CRITICAL: Output ONLY valid JSON in this exact format (no markdown, no extra text):
{
  "questions": [
    {
      "id": "q1",
      "prompt": "Question text?",
      "choices": [
        {"id": "a", "text": "Choice A"},
        {"id": "b", "text": "Choice B"},
        {"id": "c", "text": "Choice C"},
        {"id": "d", "text": "Choice D"}
      ],
      "correctChoiceId": "a",
      "explanation": "Brief explanation"
    }
  ]
}

Rules:
- NO trailing commas
- NO markdown code fences
- EXACTLY 10 questions
- Each question has EXACTLY 4 choices
- Brief explanations (1-2 sentences)`
    },
    {
      role: 'user',
      content: `Generate a 10-question quiz for this content:

TITLE: ${item.title}

CONTENT:
${item.content}

TOPICS: ${item.topics.join(', ')}

${item.sources.length > 0 ? `SOURCES:\n${item.sources.map(s => `- ${s}`).join('\n')}` : ''}`
    }
  ];

  // Make request to /chat endpoint
  const response = await fetch(`${apiUrl}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 5000
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to generate quiz: ${response.statusText} - ${errorText}`);
  }

  // Check if response is SSE or JSON
  const contentType = response.headers.get('content-type') || '';
  let responseText = '';
  let toolCallArguments = '';

  if (contentType.includes('text/event-stream')) {
    // Handle SSE stream
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    
    if (!reader) {
      throw new Error('No response body reader available');
    }

    let buffer = ''; // Buffer for incomplete lines
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        // Final flush - process any remaining buffer
        if (buffer.trim()) {
          const lines = buffer.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.substring(6);
              if (data === '[DONE]') continue;
              
              try {
                const parsed = JSON.parse(data);
                // Check for error events from backend
                if (parsed.error || parsed.code === 'ERROR') {
                  const errorMsg = parsed.error || 'Unknown error from backend';
                  console.error('❌ Backend error event:', errorMsg);
                  
                  // Make user-friendly error messages
                  let userFriendlyMsg = errorMsg;
                  if (errorMsg.includes('503')) {
                    userFriendlyMsg = 'The AI service is temporarily unavailable (503). Please try again in a moment.';
                  } else if (errorMsg.includes('429')) {
                    userFriendlyMsg = 'Rate limit exceeded. Please wait a moment before trying again.';
                  } else if (errorMsg.includes('401') || errorMsg.includes('403')) {
                    userFriendlyMsg = 'Authentication error. Please sign in again.';
                  }
                  
                  throw new Error(userFriendlyMsg);
                }
                // Collect tool call arguments (streamed)
                if (parsed.delta?.tool_calls?.[0]?.function?.arguments) {
                  toolCallArguments += parsed.delta.tool_calls[0].function.arguments;
                }
                // Fallback to regular content
                else if (parsed.content) {
                  responseText += parsed.content;
                } else if (parsed.delta?.content) {
                  responseText += parsed.delta.content;
                }
              } catch (parseErr) {
                console.error('❌ Failed to parse SSE chunk:', parseErr);
                throw parseErr; // Re-throw to stop processing
              }
            }
          }
        }
        break;
      }
      
      // Decode chunk and add to buffer
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      
      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6);
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            console.log('📦 SSE event:', JSON.stringify(parsed).substring(0, 200));
            
            // Check for error events from backend
            if (parsed.error || parsed.code === 'ERROR') {
              const errorMsg = parsed.error || 'Unknown error from backend';
              console.error('❌ Backend error event:', errorMsg);
              
              // Make user-friendly error messages
              let userFriendlyMsg = errorMsg;
              if (errorMsg.includes('503')) {
                userFriendlyMsg = 'The AI service is temporarily unavailable (503). Please try again in a moment.';
              } else if (errorMsg.includes('429')) {
                userFriendlyMsg = 'Rate limit exceeded. Please wait a moment before trying again.';
              } else if (errorMsg.includes('401') || errorMsg.includes('403')) {
                userFriendlyMsg = 'Authentication error. Please sign in again.';
              }
              
              throw new Error(userFriendlyMsg);
            }
            
            // Collect tool call arguments (streamed)
            if (parsed.delta?.tool_calls?.[0]?.function?.arguments) {
              console.log('🔧 Got tool call delta');
              toolCallArguments += parsed.delta.tool_calls[0].function.arguments;
            }
            // Fallback to regular content
            else if (parsed.content) {
              console.log('📝 Got content');
              responseText += parsed.content;
            } else if (parsed.delta?.content) {
              console.log('📝 Got delta content');
              responseText += parsed.delta.content;
            } else {
              console.log('❓ Unknown event type:', Object.keys(parsed));
            }
          } catch (parseErr) {
            console.error('❌ Failed to parse SSE chunk:', parseErr);
            throw parseErr; // Re-throw to stop processing
          }
        }
      }
    }
    
    console.log('📊 SSE stream complete');
    console.log('📊 Tool call arguments length:', toolCallArguments.length);
    console.log('📊 Regular content length:', responseText.length);
  } else {
    // Handle regular JSON response
    const data = await response.json();
    responseText = data.response || data.content || data.message?.content || JSON.stringify(data);
  }
  
  // Parse LLM response - prefer tool call arguments over regular content
  let quizData;
  try {
    let jsonString = '';
    
    // If we got tool call arguments, use those (guaranteed valid JSON)
    if (toolCallArguments.trim()) {
      console.log('✅ Using tool call arguments (length:', toolCallArguments.length, ')');
      console.log('📝 Tool call args preview:', toolCallArguments.substring(0, 200));
      jsonString = toolCallArguments.trim();
    } else {
      // Fallback to extracting JSON from regular content
      console.log('⚠️ No tool call arguments, falling back to content extraction');
      let cleanedResponse = responseText.trim();
      
      console.log('📝 Raw response length:', responseText.length);
      console.log('📝 First 200 chars:', responseText.substring(0, 200));
      console.log('📝 Last 200 chars:', responseText.substring(responseText.length - 200));
      
      // Remove markdown code fences if present
      cleanedResponse = cleanedResponse.replace(/^```(?:json)?\s*/i, '');
      cleanedResponse = cleanedResponse.replace(/\s*```\s*$/i, '');
      
      // Extract JSON object - find the first { and its matching closing }
      const firstBrace = cleanedResponse.indexOf('{');
      
      if (firstBrace === -1) {
        console.error('❌ No valid JSON object found in response. First 500 chars:', cleanedResponse.substring(0, 500));
        throw new Error('No JSON object found in response');
      }
      
      // Find the matching closing brace by counting depth
      let depth = 0;
      let lastBrace = -1;
      let inString = false;
      let escapeNext = false;
      
      for (let i = firstBrace; i < cleanedResponse.length; i++) {
        const char = cleanedResponse[i];
        
        // Handle escape sequences in strings
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        
        // Track string boundaries (quotes)
        if (char === '"') {
          inString = !inString;
          continue;
        }
        
        // Only count braces outside of strings
        if (!inString) {
          if (char === '{') depth++;
          if (char === '}') {
            depth--;
            if (depth === 0) {
              lastBrace = i;
              break;
            }
          }
        }
      }
      
      if (lastBrace === -1) {
        console.error('❌ No matching closing brace found. First 500 chars:', cleanedResponse.substring(0, 500));
        throw new Error('No complete JSON object found in response');
      }
      
      // Extract only the JSON part (from first { to matching })
      jsonString = cleanedResponse.substring(firstBrace, lastBrace + 1);
    }
    
    console.log('📝 Extracted JSON length:', jsonString.length);
    console.log('📝 JSON first 100 chars:', jsonString.substring(0, 100));
    console.log('📝 JSON last 100 chars:', jsonString.substring(jsonString.length - 100));
    
    // Fix common LLM JSON errors: trailing commas before closing brackets
    // Apply multiple times to catch nested structures
    let jsonToParse = jsonString;
    let prevLength = 0;
    
    // Keep applying fixes until no more changes occur (handles deeply nested structures)
    while (prevLength !== jsonToParse.length) {
      prevLength = jsonToParse.length;
      jsonToParse = jsonToParse
        .replace(/,(\s*])/g, '$1')  // Remove trailing commas before array close
        .replace(/,(\s*})/g, '$1'); // Remove trailing commas before object close
    }
    
    jsonToParse = jsonToParse.trim();
    
    console.log('🔍 About to parse JSON. Starts with:', jsonToParse.substring(0, 50));
    console.log('🔍 About to parse JSON. Ends with:', jsonToParse.substring(jsonToParse.length - 50));
    
    quizData = JSON.parse(jsonToParse);
    console.log('✅ Successfully parsed quiz JSON');
    console.log('🔍 Quiz data keys:', Object.keys(quizData));
    console.log('🔍 Has questions?', 'questions' in quizData);
    console.log('🔍 Questions count:', quizData.questions?.length || 0);
  } catch (err) {
    console.error('❌ Failed to parse quiz JSON');
    console.error('❌ Error:', err);
    console.error('❌ Tool call arguments length:', toolCallArguments.length);
    console.error('❌ Response text length:', responseText.length);
    console.error('❌ Tool call preview:', toolCallArguments.substring(0, 500));
    console.error('❌ Response preview:', responseText.substring(0, 500));
    
    // If the error is from backend, re-throw it with original message
    if (err instanceof Error && err.message.includes('Backend error:')) {
      throw err;
    }
    
    throw new Error('Failed to parse quiz response. The AI may be overloaded - please try again.');
  }

  // Validate and transform to FeedQuiz
  if (!quizData.questions || !Array.isArray(quizData.questions)) {
    console.error('❌ Invalid quiz data structure:', JSON.stringify(quizData).substring(0, 500));
    throw new Error('Invalid quiz format: missing questions array');
  }

  // Ensure we have at least 10 questions (take first 10)
  const questions: FeedQuizQuestion[] = quizData.questions.slice(0, 10).map((q: any, idx: number) => {
    // Validate question structure
    if (!q.prompt || !q.choices || !q.correctChoiceId || !q.explanation) {
      throw new Error(`Invalid question format at index ${idx}`);
    }

    // Ensure choices have correct structure
    const choices: FeedQuizChoice[] = q.choices.map((c: any) => ({
      id: c.id || '',
      text: c.text || ''
    }));

    return {
      id: q.id || `q${idx + 1}`,
      prompt: q.prompt,
      choices,
      correctChoiceId: q.correctChoiceId,
      explanation: q.explanation
    };
  });

  // Ensure we have at least 10 questions
  if (questions.length < 10) {
    throw new Error(`Quiz must have 10 questions, got ${questions.length}`);
  }

  const quiz: FeedQuiz = {
    itemId: item.id,
    title: `Quiz: ${item.title}`,
    questions,
    sources: item.sources,
    generatedAt: new Date().toISOString()
  };

  return quiz;
}

/**
 * Fetch image via proxy and convert to base64
 */
export async function fetchImageAsBase64(
  token: string,
  imageUrl: string
): Promise<string> {
  const apiUrl = await getCachedApiBase();
  
  const response = await fetch(`${apiUrl}/feed/image?url=${encodeURIComponent(imageUrl)}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.success || !data.base64) {
    throw new Error('Invalid image proxy response');
  }

  return data.base64;
}
