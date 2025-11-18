/**
 * QuizEditorDialog Component
 * 
 * Modal dialog for editing quiz questions and answers.
 * Allows adding, editing, and deleting questions and choices.
 */

import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Check } from 'lucide-react';
import type { Quiz, QuizQuestion } from './QuizCard';
import { useToast } from './ToastManager';

interface QuizEditorDialogProps {
  quiz: Quiz;
  onSave: (quiz: Quiz) => void;
  onClose: () => void;
}

const QuizEditorDialog: React.FC<QuizEditorDialogProps> = ({ quiz, onSave, onClose }) => {
  const { showError, showWarning } = useToast();
  
  // Normalize quiz data - handle both answerId and correctChoiceId
  const normalizedQuiz = {
    ...quiz,
    questions: quiz.questions.map((q: any) => ({
      ...q,
      answerId: q.answerId || q.correctChoiceId || (q.choices && q.choices[0]?.id) || 'a'
    }))
  };
  
  const [editedQuiz, setEditedQuiz] = useState<Quiz>(JSON.parse(JSON.stringify(normalizedQuiz)));
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Debug: Log the loaded quiz data
  useEffect(() => {
    console.log('📝 Quiz Editor - Loaded quiz:', {
      title: quiz.title,
      questionCount: quiz.questions.length,
      firstQuestion: quiz.questions[0],
      normalized: normalizedQuiz.questions[0]
    });
  }, []);

  // Track changes
  useEffect(() => {
    const changed = JSON.stringify(quiz) !== JSON.stringify(editedQuiz);
    setHasChanges(changed);
  }, [quiz, editedQuiz]);

  const currentQuestion = editedQuiz.questions[currentQuestionIndex];
  
  // Debug current question when it changes
  useEffect(() => {
    if (currentQuestion) {
      console.log('📋 Current Question:', {
        index: currentQuestionIndex,
        answerId: currentQuestion.answerId,
        choices: currentQuestion.choices.map(c => ({ id: c.id, text: c.text.substring(0, 30) }))
      });
    }
  }, [currentQuestionIndex, currentQuestion]);

  const handleTitleChange = (title: string) => {
    setEditedQuiz({ ...editedQuiz, title });
  };

  const handleQuestionPromptChange = (prompt: string) => {
    const updated = [...editedQuiz.questions];
    updated[currentQuestionIndex] = { ...updated[currentQuestionIndex], prompt };
    setEditedQuiz({ ...editedQuiz, questions: updated });
  };

  const handleQuestionExplanationChange = (explanation: string) => {
    const updated = [...editedQuiz.questions];
    updated[currentQuestionIndex] = { ...updated[currentQuestionIndex], explanation };
    setEditedQuiz({ ...editedQuiz, questions: updated });
  };

  const handleChoiceTextChange = (choiceIndex: number, text: string) => {
    const updated = [...editedQuiz.questions];
    const choices = [...updated[currentQuestionIndex].choices];
    choices[choiceIndex] = { ...choices[choiceIndex], text };
    updated[currentQuestionIndex] = { ...updated[currentQuestionIndex], choices };
    setEditedQuiz({ ...editedQuiz, questions: updated });
  };

  const handleSetCorrectAnswer = (choiceId: string) => {
    console.log('✅ Setting correct answer:', { 
      questionIndex: currentQuestionIndex, 
      choiceId,
      currentAnswerId: editedQuiz.questions[currentQuestionIndex].answerId
    });
    const updated = [...editedQuiz.questions];
    updated[currentQuestionIndex] = { ...updated[currentQuestionIndex], answerId: choiceId };
    setEditedQuiz({ ...editedQuiz, questions: updated });
  };

  const handleAddChoice = () => {
    const updated = [...editedQuiz.questions];
    const choices = [...updated[currentQuestionIndex].choices];
    const newChoiceId = String.fromCharCode(97 + choices.length); // a, b, c, d, e, etc.
    choices.push({
      id: newChoiceId,
      text: ''
    });
    updated[currentQuestionIndex] = { ...updated[currentQuestionIndex], choices };
    setEditedQuiz({ ...editedQuiz, questions: updated });
  };

  const handleDeleteChoice = (choiceIndex: number) => {
    const updated = [...editedQuiz.questions];
    const choices = [...updated[currentQuestionIndex].choices];
    const deletedChoiceId = choices[choiceIndex].id;
    
    // Don't allow deleting if only 2 choices remain
    if (choices.length <= 2) {
      showWarning('A question must have at least 2 choices');
      return;
    }

    choices.splice(choiceIndex, 1);
    
    // If we deleted the correct answer, set the first choice as correct
    let answerId = updated[currentQuestionIndex].answerId;
    if (answerId === deletedChoiceId) {
      answerId = choices[0].id;
    }
    
    updated[currentQuestionIndex] = { ...updated[currentQuestionIndex], choices, answerId };
    setEditedQuiz({ ...editedQuiz, questions: updated });
  };

  const handleAddQuestion = () => {
    const newQuestionId = `q${editedQuiz.questions.length + 1}`;
    const newQuestion: QuizQuestion = {
      id: newQuestionId,
      prompt: '',
      choices: [
        { id: 'a', text: '' },
        { id: 'b', text: '' }
      ],
      answerId: 'a',
      explanation: ''
    };
    
    setEditedQuiz({
      ...editedQuiz,
      questions: [...editedQuiz.questions, newQuestion]
    });
    setCurrentQuestionIndex(editedQuiz.questions.length);
  };

  const handleDeleteQuestion = () => {
    if (editedQuiz.questions.length <= 1) {
      showWarning('A quiz must have at least 1 question');
      return;
    }

    if (!confirm(`Delete question ${currentQuestionIndex + 1}?`)) {
      return;
    }

    const updated = [...editedQuiz.questions];
    updated.splice(currentQuestionIndex, 1);
    setEditedQuiz({ ...editedQuiz, questions: updated });
    
    // Adjust current index if needed
    if (currentQuestionIndex >= updated.length) {
      setCurrentQuestionIndex(updated.length - 1);
    }
  };

  const handleSave = () => {
    // Validate quiz
    if (!editedQuiz.title.trim()) {
      showError('Quiz title is required');
      return;
    }

    for (let i = 0; i < editedQuiz.questions.length; i++) {
      const q = editedQuiz.questions[i];
      
      if (!q.prompt.trim()) {
        showError(`Question ${i + 1} is missing a prompt`);
        return;
      }

      if (q.choices.length < 2) {
        showError(`Question ${i + 1} must have at least 2 choices`);
        return;
      }

      for (let j = 0; j < q.choices.length; j++) {
        if (!q.choices[j].text.trim()) {
          showError(`Question ${i + 1}, choice ${j + 1} is empty`);
          return;
        }
      }

      const hasCorrectAnswer = q.choices.some(c => c.id === q.answerId);
      if (!hasCorrectAnswer) {
        showError(`Question ${i + 1} has an invalid correct answer`);
        console.error('Invalid correct answer:', {
          question: i + 1,
          answerId: q.answerId,
          availableChoices: q.choices.map(c => c.id)
        });
        return;
      }
    }

    // Clean up quiz data - remove any legacy correctChoiceId fields
    const cleanedQuiz = {
      ...editedQuiz,
      questions: editedQuiz.questions.map(q => {
        const { correctChoiceId, ...cleanQuestion } = q as any;
        return cleanQuestion;
      })
    };

    console.log('💾 Editor saving cleaned quiz:', {
      title: cleanedQuiz.title,
      questionCount: cleanedQuiz.questions.length,
      firstQuestion: {
        answerId: cleanedQuiz.questions[0].answerId,
        hasCorrectChoiceId: 'correctChoiceId' in (editedQuiz.questions[0] as any)
      }
    });

    onSave(cleanedQuiz);
  };

  const handleCancel = () => {
    if (hasChanges) {
      if (!confirm('You have unsaved changes. Are you sure you want to close?')) {
        return;
      }
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Edit Quiz
          </h2>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Quiz Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Quiz Title
            </label>
            <input
              type="text"
              value={editedQuiz.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter quiz title"
            />
          </div>

          {/* Question Navigator */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Question {currentQuestionIndex + 1} of {editedQuiz.questions.length}
              </span>
              <div className="flex items-center gap-2">
                {/* Previous Button */}
                <button
                  onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
                  disabled={currentQuestionIndex === 0}
                  className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                  title="Previous question"
                >
                  ◀
                </button>
                <select
                  value={currentQuestionIndex}
                  onChange={(e) => setCurrentQuestionIndex(parseInt(e.target.value))}
                  className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                >
                  {editedQuiz.questions.map((_, idx) => (
                    <option key={idx} value={idx}>
                      Question {idx + 1}
                    </option>
                  ))}
                </select>
                {/* Next Button */}
                <button
                  onClick={() => setCurrentQuestionIndex(Math.min(editedQuiz.questions.length - 1, currentQuestionIndex + 1))}
                  disabled={currentQuestionIndex === editedQuiz.questions.length - 1}
                  className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                  title="Next question"
                >
                  ▶
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddQuestion}
                className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                Add Question
              </button>
              <button
                onClick={handleDeleteQuestion}
                disabled={editedQuiz.questions.length <= 1}
                className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm flex items-center gap-1"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          </div>

          {/* Current Question Editor */}
          {currentQuestion && (
            <div className="space-y-4 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              {/* Question Prompt */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Question Prompt
                </label>
                <textarea
                  value={currentQuestion.prompt}
                  onChange={(e) => handleQuestionPromptChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                  placeholder="Enter the question"
                />
              </div>

              {/* Answer Choices */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Answer Choices
                  </label>
                  <button
                    onClick={handleAddChoice}
                    className="px-2 py-1 bg-blue-600 text-white rounded text-xs flex items-center gap-1 hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Add Choice
                  </button>
                </div>
                <div className="space-y-2">
                  {currentQuestion.choices.map((choice, idx) => (
                    <div key={choice.id} className="flex items-center gap-2">
                      <button
                        onClick={() => handleSetCorrectAnswer(choice.id)}
                        className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                          currentQuestion.answerId === choice.id
                            ? 'border-green-500 bg-green-500'
                            : 'border-gray-300 dark:border-gray-600 hover:border-green-500'
                        }`}
                        title="Mark as correct answer"
                      >
                        {currentQuestion.answerId === choice.id && (
                          <Check className="w-4 h-4 text-white" />
                        )}
                      </button>
                      <span className="flex-shrink-0 w-6 text-sm font-medium text-gray-600 dark:text-gray-400">
                        {choice.id.toUpperCase()}
                      </span>
                      <input
                        type="text"
                        value={choice.text}
                        onChange={(e) => handleChoiceTextChange(idx, e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder={`Choice ${choice.id.toUpperCase()}`}
                      />
                      <button
                        onClick={() => handleDeleteChoice(idx)}
                        disabled={currentQuestion.choices.length <= 2}
                        className="flex-shrink-0 p-2 text-red-600 hover:text-red-700 disabled:text-gray-400 disabled:cursor-not-allowed"
                        title="Delete choice"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Explanation */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Explanation (Optional)
                </label>
                <textarea
                  value={currentQuestion.explanation || ''}
                  onChange={(e) => handleQuestionExplanationChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={2}
                  placeholder="Optional explanation for the correct answer"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {hasChanges && (
              <span className="text-orange-600 dark:text-orange-400">
                ● Unsaved changes
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuizEditorDialog;
