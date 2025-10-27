/**
 * Speakable Summary Service
 * 
 * Generates concise, natural-sounding summaries for TTS
 * Uses existing LLM providers for summary generation
 */

import type { ProviderConfig } from '../../types/provider';
import { prepareTextForSpeech, truncateForSpeech } from '../../utils/textPreprocessing';

export class SpeakableSummaryService {
  /**
   * Generate a concise, speakable summary of long content
   */
  async generateSpeakableSummary(
    text: string,
    provider: ProviderConfig
  ): Promise<string> {
    // Skip summarization for short text
    if (text.length < 500) {
      return prepareTextForSpeech(text);
    }

    const prompt = `Convert the following text into a concise, natural-sounding spoken summary. 
The summary should:
- Be 2-3 sentences maximum
- Sound natural when read aloud
- Capture the key points
- Avoid technical jargon or formatting
- Use conversational language

Text to summarize:
${text}

Speakable summary:`;

    try {
      // Use the Lambda API endpoint to generate summary
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are a helpful assistant that creates concise, natural-sounding spoken summaries.' },
            { role: 'user', content: prompt }
          ],
          provider: provider.type,
          apiKey: provider.apiKey,
          maxTokens: 200,
          temperature: 0.7,
          ttsMode: true // Flag to indicate this is for TTS
        })
      });

      if (!response.ok) {
        throw new Error(`Summary API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Extract the summary from the response
      let summary = '';
      if (data.choices && data.choices[0]?.message?.content) {
        summary = data.choices[0].message.content;
      } else if (data.content) {
        summary = data.content;
      } else {
        throw new Error('No summary content in response');
      }

      return prepareTextForSpeech(summary);
    } catch (error) {
      console.error('Failed to generate speakable summary:', error);
      // Fallback to truncated original text
      return truncateForSpeech(text, 500);
    }
  }

  /**
   * Determine if text should be summarized
   */
  shouldSummarize(text: string, autoSummarize: boolean, threshold: number = 500): boolean {
    if (!autoSummarize) return false;
    return text.length > threshold;
  }
}