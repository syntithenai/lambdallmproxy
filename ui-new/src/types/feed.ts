/**
 * Feed Feature Type Definitions
 */

export type FeedItemType = 'did-you-know' | 'qa';

export interface FeedItem {
  id: string;                    // UUID
  type: FeedItemType;            // Content type
  title: string;                 // Headline
  content: string;               // Main text/summary
  image?: string;                // Image URL (from Unsplash/Pexels)
  imageThumb?: string;           // Thumbnail URL
  imageSource?: string;          // Image provider: 'unsplash' | 'pexels'
  imagePhotographer?: string;    // Photographer name
  imagePhotographerUrl?: string; // Photographer profile URL
  imageAttribution?: string;     // Plain text attribution
  imageAttributionHtml?: string; // HTML attribution (with links)
  topics: string[];              // Extracted topics/tags
  sources: string[];             // Source URLs from search
  createdAt: string;             // ISO timestamp
  viewed: boolean;               // User has seen it
  stashed: boolean;              // Stashed to Swag
  trashed: boolean;              // User dismissed
}

export interface FeedPreferences {
  searchTerms: string[];         // Search queries for content
  likedTopics: string[];         // Topics from stashed items
  dislikedTopics: string[];      // Topics from trashed items
  lastGenerated: string;         // Last generation timestamp
}

export interface FeedQuiz {
  itemId: string;                // Related feed item
  title: string;                 // Quiz title
  questions: FeedQuizQuestion[]; // 10 questions
  sources: string[];             // Research sources
  generatedAt: string;           // ISO timestamp
}

export interface FeedQuizQuestion {
  id: string;
  prompt: string;
  choices: FeedQuizChoice[];
  correctChoiceId: string;
  explanation: string;
}

export interface FeedQuizChoice {
  id: string;
  text: string;
}

export interface GenerateFeedRequest {
  swagContent: string[];         // Snippet texts from Swag
  searchTerms: string[];         // Search queries
  count: number;                 // Number of items to generate
  preferences: FeedPreferences;  // User preferences
}

export interface GenerateFeedResponse {
  items: FeedItem[];
  searchResults: any[];
}
