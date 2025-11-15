/**
 * TTS Highlighted Text Component
 * 
 * Renders text with visual highlighting for TTS playback:
 * - All sentences are shown with a subtle background (clickable)
 * - Current sentence being spoken has a stronger highlight
 * - Clicking a sentence stops playback and restarts from that sentence
 */

import React from 'react';
import { useTTS } from '../contexts/TTSContext';
import { MarkdownRenderer } from './MarkdownRenderer';
import { extractSpeakableText } from '../utils/textPreprocessing';

interface TTSHighlightedTextProps {
  text: string;
  renderAsMarkdown?: boolean;
  chartDescription?: string;
}

export const TTSHighlightedText: React.FC<TTSHighlightedTextProps> = ({ 
  text, 
  renderAsMarkdown = false,
  chartDescription 
}) => {
  const { state, seekToChunk } = useTTS();

  // Only highlight if TTS is playing and we have chunks
  const isCurrentlyPlaying = state.isPlaying && state.chunks.length > 0;

  // Check if this is the text being spoken
  // Compare the cleaned/processed versions since TTSContext uses extractSpeakableText
  const speakableText = extractSpeakableText(text);
  const isThisText = state.currentText?.trim() === speakableText.trim();

  if (!isCurrentlyPlaying || !isThisText) {
    // Not playing this text - render normally
    
    // Use MarkdownRenderer for markdown content, plain text otherwise
    if (renderAsMarkdown) {
      return <MarkdownRenderer content={text} chartDescription={chartDescription} />;
    }
    return <span className="whitespace-pre-wrap">{text}</span>;
  }

  const handleChunkClick = (chunkIndex: number) => {
    seekToChunk(chunkIndex);
  };

  // Currently playing - show highlighted chunks (plain text, markdown already processed by TTS)
  return (
    <div className="whitespace-pre-wrap">
      {state.chunks.map((chunk: string, index: number) => {
        const isCurrent = index === state.currentChunkIndex;
        const isPast = index < state.currentChunkIndex;
        
        return (
          <span
            key={index}
            onClick={() => handleChunkClick(index)}
            className={`
              cursor-pointer transition-colors duration-200 rounded px-0.5
              ${isCurrent ? 'bg-yellow-300 dark:bg-yellow-500/60 font-medium shadow-sm' : ''}
              ${isPast ? 'bg-gray-200 dark:bg-gray-700/40 opacity-70' : ''}
              ${!isCurrent && !isPast ? 'bg-blue-100 dark:bg-blue-900/30' : ''}
              hover:bg-blue-300 dark:hover:bg-blue-700/50
            `}
            title={`Sentence ${index + 1}/${state.totalChunks} - Click to play from here`}
          >
            {chunk}
          </span>
        );
      })}
    </div>
  );
};
