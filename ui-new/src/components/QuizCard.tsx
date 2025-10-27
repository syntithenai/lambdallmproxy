import React, { useState } from 'react';
import { X, RotateCcw, CheckCircle2, XCircle, Trophy, Brain } from 'lucide-react';
import confetti from 'canvas-confetti';

export interface QuizChoice {
  id: string;
  text: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  choices: QuizChoice[];
  answerId: string;
  explanation?: string;
}

export interface Quiz {
  title: string;
  questions: QuizQuestion[];
}

interface QuizCardProps {
  quiz: Quiz;
  onClose: () => void;
  onComplete?: (_score: number, _totalQuestions: number) => void;
}

type QuizState = 'question' | 'answered' | 'completed';

export const QuizCard: React.FC<QuizCardProps> = ({ quiz, onClose, onComplete }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [state, setState] = useState<QuizState>('question');
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState<{ questionId: string; selectedId: string; correct: boolean }[]>([]);

  const currentQuestion = quiz.questions[currentQuestionIndex];
  const progress = currentQuestionIndex + 1;
  const total = quiz.questions.length;

  const handleAnswerSelect = (choiceId: string) => {
    if (state !== 'question') return;

    setSelectedAnswer(choiceId);
    const isCorrect = choiceId === currentQuestion.answerId;
    
    if (isCorrect) {
      setScore(score + 1);
    }

    setAnswers([...answers, {
      questionId: currentQuestion.id,
      selectedId: choiceId,
      correct: isCorrect
    }]);

    setState('answered');
  };

  const handleNext = () => {
    if (currentQuestionIndex < quiz.questions.length - 1) {
      // Move to next question
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedAnswer(null);
      setState('question');
    } else {
      // Quiz completed
      setState('completed');
      
      // Fire confetti if score is good
      const percentage = (score / quiz.questions.length) * 100;
      if (percentage >= 70) {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
      }

      // Call onComplete callback
      if (onComplete) {
        onComplete(score, quiz.questions.length);
      }
    }
  };

  const handleReset = () => {
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setState('question');
    setScore(0);
    setAnswers([]);
  };

  const getChoiceClassName = (choice: QuizChoice) => {
    const baseClasses = 'w-full p-4 text-left rounded-lg border-2 transition-all duration-200';
    
    if (state === 'question') {
      return `${baseClasses} border-gray-300 hover:border-blue-400 hover:bg-blue-50 cursor-pointer`;
    }

    // Answered state - show correct/incorrect
    const isSelected = selectedAnswer === choice.id;
    const isCorrect = choice.id === currentQuestion.answerId;

    if (isCorrect) {
      return `${baseClasses} border-green-500 bg-green-50 text-green-900`;
    }

    if (isSelected && !isCorrect) {
      return `${baseClasses} border-red-500 bg-red-50 text-red-900`;
    }

    return `${baseClasses} border-gray-300 bg-gray-50 text-gray-500 cursor-not-allowed`;
  };

  const getChoiceIcon = (choice: QuizChoice) => {
    if (state === 'question') return null;

    const isSelected = selectedAnswer === choice.id;
    const isCorrect = choice.id === currentQuestion.answerId;

    if (isCorrect) {
      return <CheckCircle2 className="w-5 h-5 text-green-600" />;
    }

    if (isSelected && !isCorrect) {
      return <XCircle className="w-5 h-5 text-red-600" />;
    }

    return null;
  };

  if (state === 'completed') {
    const percentage = Math.round((score / quiz.questions.length) * 100);
    const passed = percentage >= 70;

    return (
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-2">
            <Trophy className={`w-8 h-8 ${passed ? 'text-yellow-500' : 'text-gray-400'}`} />
            <h2 className="text-2xl font-bold text-gray-800">Quiz Complete!</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Close quiz"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Score */}
        <div className="text-center mb-8">
          <div className={`text-6xl font-bold mb-2 ${passed ? 'text-green-600' : 'text-orange-600'}`}>
            {percentage}%
          </div>
          <div className="text-xl text-gray-600 mb-4">
            {score} out of {quiz.questions.length} correct
          </div>
          <div className={`text-lg font-semibold ${passed ? 'text-green-600' : 'text-orange-600'}`}>
            {passed ? '🎉 Great job!' : '💪 Keep practicing!'}
          </div>
        </div>

        {/* Review */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Review</h3>
          <div className="space-y-2">
            {answers.map((answer, index) => (
              <div
                key={answer.questionId}
                className={`flex items-center gap-3 p-3 rounded-lg ${
                  answer.correct ? 'bg-green-50' : 'bg-red-50'
                }`}
              >
                {answer.correct ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                )}
                <span className="text-sm text-gray-700">
                  Question {index + 1}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleReset}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            <RotateCcw className="w-4 h-4" />
            Retake Quiz
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-800">{quiz.title}</h2>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span className="font-medium">
              Question {progress} of {total}
            </span>
            <span>
              Score: {score}/{total}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="Close quiz"
        >
          <X className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${(progress / total) * 100}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          {currentQuestion.prompt}
        </h3>

        {/* Choices */}
        <div className="space-y-3">
          {currentQuestion.choices.map((choice) => (
            <button
              key={choice.id}
              onClick={() => handleAnswerSelect(choice.id)}
              disabled={state !== 'question'}
              className={getChoiceClassName(choice)}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex-1 text-left">{choice.text}</span>
                {getChoiceIcon(choice)}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Explanation (shown after answering) */}
      {state === 'answered' && currentQuestion.explanation && (
        <div className="mb-6 p-4 bg-blue-50 border-l-4 border-blue-500 rounded">
          <h4 className="font-semibold text-blue-900 mb-1">Explanation</h4>
          <p className="text-blue-800 text-sm">{currentQuestion.explanation}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {state === 'answered' && (
          <button
            onClick={handleNext}
            className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            {currentQuestionIndex < quiz.questions.length - 1 ? 'Next Question →' : 'Finish Quiz'}
          </button>
        )}
        <button
          onClick={onClose}
          className="py-3 px-4 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium"
        >
          Quit
        </button>
      </div>
    </div>
  );
};

export default QuizCard;
