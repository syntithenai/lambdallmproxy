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
  type: 'status' | 'search_complete' | 'item_generated' | 'complete' | 'error';
  message?: string;
  item?: FeedItem;
  searchResults?: number;
  error?: string;
}

/**
 * Generate feed items via SSE streaming
 */
export async function generateFeedItems(
  token: string,
  swagContent: string[],
  preferences: FeedPreferences,
  count: number = 10,
  onProgress?: (event: FeedGenerationEvent) => void
): Promise<FeedItem[]> {
  const apiUrl = await getCachedApiBase();
  
  // Build request
  const requestBody: GenerateFeedRequest = {
    swagContent,
    searchTerms: preferences.searchTerms,
    count,
    preferences
  };

  // Make SSE request
  const response = await fetch(`${apiUrl}/feed/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.json();
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

      // Process complete events (split by \n\n)
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || ''; // Keep incomplete event in buffer

      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data: ')) continue;

        const jsonStr = line.substring(6); // Remove "data: " prefix
        
        try {
          const event = JSON.parse(jsonStr) as FeedGenerationEvent;

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
          console.error('Failed to parse SSE event:', jsonStr, err);
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

  // Build quiz generation request
  const messages = [
    {
      role: 'system',
      content: `You are a quiz generator. Create a 10-question multiple-choice quiz based on the provided content.

Each question should:
- Test understanding of the content
- Have 4 answer choices (A, B, C, D)
- Have exactly one correct answer
- Include a brief explanation (1-2 sentences)

OUTPUT FORMAT (JSON):
{
  "questions": [
    {
      "id": "unique_id",
      "prompt": "Question text?",
      "choices": [
        {"id": "a", "text": "Choice A"},
        {"id": "b", "text": "Choice B"},
        {"id": "c", "text": "Choice C"},
        {"id": "d", "text": "Choice D"}
      ],
      "correctChoiceId": "a",
      "explanation": "Why this is correct..."
    }
  ]
}`
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
      stream: false,
      temperature: 0.7,
      maxTokens: 2000
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || `Failed to generate quiz: ${response.statusText}`);
  }

  const data = await response.json();
  
  // Parse LLM response
  let quizData;
  try {
    // Try to extract JSON from response
    const content = data.response || data.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    quizData = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('Failed to parse quiz JSON:', data, err);
    throw new Error('Failed to parse quiz response');
  }

  // Validate and transform to FeedQuiz
  if (!quizData.questions || !Array.isArray(quizData.questions)) {
    throw new Error('Invalid quiz format: missing questions array');
  }

  // Ensure we have exactly 10 questions
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

  // Ensure we have exactly 10 questions
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
