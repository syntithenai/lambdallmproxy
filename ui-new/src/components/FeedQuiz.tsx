/**
 * Feed Quiz Overlay - Quiz Component for Feed Items
 */

import { QuizCard } from './QuizCard';
import type { Quiz } from './QuizCard';
import type { FeedQuiz } from '../types/feed';

interface FeedQuizOverlayProps {
  quiz: FeedQuiz;
  onClose: () => void;
}

/**
 * Convert FeedQuiz to Quiz format expected by QuizCard
 */
function convertToQuizCardFormat(feedQuiz: FeedQuiz): Quiz {
  return {
    title: feedQuiz.title,
    questions: feedQuiz.questions.map(q => ({
      id: q.id,
      prompt: q.prompt,
      choices: q.choices,
      answerId: q.correctChoiceId,
      explanation: q.explanation
    }))
  };
}

export default function FeedQuizOverlay({ quiz, onClose }: FeedQuizOverlayProps) {
  const quizCardFormat = convertToQuizCardFormat(quiz);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="w-full max-w-2xl">
        <QuizCard 
          quiz={quizCardFormat} 
          onClose={onClose}
          onComplete={(score, total) => {
            console.log(`Feed quiz completed: ${score}/${total}`);
            // Could add analytics or achievements here
          }}
        />
      </div>
    </div>
  );
}
