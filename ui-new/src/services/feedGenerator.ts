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
  type: 'started' | 'status' | 'search_complete' | 'item_generated' | 'item_updated' | 'complete' | 'error' | 'personalization' | 
        'context_prepared' | 'search_starting' | 'search_term' | 'search_term_complete' | 'search_term_error';
  message?: string;
  requestId?: string; // For started event
  item?: FeedItem;
  field?: string; // For item_updated: which field was updated (e.g., 'image')
  searchResults?: number;
  resultsCount?: number;
  terms?: string[];
  term?: string;
  error?: string;
  success?: boolean;
  itemsGenerated?: number;
  duration?: number;
  cost?: number;
  keywordsUsed?: number;
  topicsUsed?: number;
  quizEngagementCount?: number;
  searchTermsGenerated?: number;
  // Context prepared event
  swagCount?: number;
  searchTermsCount?: number;
  likedTopicsCount?: number;
  dislikedTopicsCount?: number;
  // Search result details
  results?: Array<{ title: string; url: string }>;
  topResults?: Array<{ title: string; url: string; snippet?: string }>;
}

/**
 * Generate feed items via SSE streaming
 */
export async function generateFeedItems(
  token: string,
  swagContent: string[],
  preferences: FeedPreferences,
  count: number = 5, // Reduced from 10 to 5 for higher quality with expanded content
  maturityLevel?: 'child' | 'youth' | 'adult' | 'academic',
  onProgress?: (event: FeedGenerationEvent) => void,
  signal?: AbortSignal // Optional abort signal for cancellation
): Promise<FeedItem[]> {
  const apiUrl = await getCachedApiBase();
  
  // Use provided maturity level or get from preferences or fall back to 'adult'
  const level = maturityLevel || preferences.maturityLevel || 'adult';
  console.log(`🎓 Feed maturity level: ${level}`);
  
  // Build request
  const requestBody: GenerateFeedRequest = {
    swagContent,
    searchTerms: preferences.searchTerms,
    count,
    preferences,
    maturityLevel: level
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
    body: JSON.stringify(requestBody),
    signal // Pass abort signal to fetch
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

  // Build quiz content from feed item
  const quizContent = `TITLE: ${item.title}

CONTENT:
${item.content}

TOPICS: ${item.topics.join(', ')}

${(item.sources && item.sources.length > 0) ? `SOURCES:\n${item.sources.map(s => `- ${s}`).join('\n')}` : ''}`;

  // Use the dedicated /quiz/generate endpoint
  const response = await fetch(`${apiUrl}/quiz/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      content: quizContent,
      enrichment: false, // No need for enrichment, we already have the content
      providers: {} // Use default providers
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to generate quiz: ${response.statusText} - ${errorText}`);
  }

  const quizData = await response.json();
  
  // Transform to FeedQuiz format
  const quiz: FeedQuiz = {
    itemId: item.id,
    title: quizData.title || `Quiz: ${item.title}`, // Use LLM-generated title
    questions: quizData.questions.map((q: any, index: number) => ({
      id: q.id || `q${index + 1}`,
      prompt: q.prompt || q.question,
      choices: q.choices.map((c: any) => ({
        id: c.id,
        text: c.text
      })),
      correctChoiceId: q.answerId || q.correctChoiceId || q.correctAnswer, // Backend uses answerId
      explanation: q.explanation || ''
    })),
    sources: item.sources || [],
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
