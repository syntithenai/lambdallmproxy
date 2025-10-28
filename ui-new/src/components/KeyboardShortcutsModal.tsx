import React from 'react';
import { useTranslation } from 'react-i18next';
import { FocusTrap } from 'focus-trap-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutCategory {
  title: string;
  shortcuts: Array<{
    keys: string[];
    description: string;
  }>;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const categories: ShortcutCategory[] = [
    {
      title: t('keyboardShortcuts.general', { defaultValue: 'General' }),
      shortcuts: [
        { keys: ['Ctrl', 'K'], description: t('keyboardShortcuts.openHelp', { defaultValue: 'Open keyboard shortcuts help' }) },
        { keys: ['?'], description: t('keyboardShortcuts.openHelpAlt', { defaultValue: 'Show this help dialog' }) },
        { keys: ['Esc'], description: t('keyboardShortcuts.closeModal', { defaultValue: 'Close modal / Clear input' }) },
        { keys: ['Tab'], description: t('keyboardShortcuts.navigateForward', { defaultValue: 'Navigate forward' }) },
        { keys: ['Shift', 'Tab'], description: t('keyboardShortcuts.navigateBackward', { defaultValue: 'Navigate backward' }) },
      ],
    },
    {
      title: t('keyboardShortcuts.chat', { defaultValue: 'Chat' }),
      shortcuts: [
        { keys: ['Ctrl', 'Enter'], description: t('keyboardShortcuts.sendMessage', { defaultValue: 'Send message' }) },
        { keys: ['Shift', 'Enter'], description: t('keyboardShortcuts.newLine', { defaultValue: 'New line in message' }) },
        { keys: ['↑'], description: t('keyboardShortcuts.previousPrompt', { defaultValue: 'Previous prompt in history' }) },
        { keys: ['↓'], description: t('keyboardShortcuts.nextPrompt', { defaultValue: 'Next prompt in history' }) },
      ],
    },
    {
      title: t('keyboardShortcuts.modals', { defaultValue: 'Modals & Dialogs' }),
      shortcuts: [
        { keys: ['Esc'], description: t('keyboardShortcuts.closeDialog', { defaultValue: 'Close current dialog' }) },
        { keys: ['Tab'], description: t('keyboardShortcuts.cycleFocus', { defaultValue: 'Cycle through controls (focus trap active)' }) },
        { keys: ['Enter'], description: t('keyboardShortcuts.confirmAction', { defaultValue: 'Confirm action / Submit form' }) },
      ],
    },
  ];

  return (
    <FocusTrap active={isOpen}>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
        <div className="card max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              ⌨️ {t('keyboardShortcuts.title', { defaultValue: 'Keyboard Shortcuts' })}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              aria-label="Close keyboard shortcuts help"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-6">
            {categories.map((category, idx) => (
              <div key={idx} className="border-b border-gray-200 dark:border-gray-700 pb-4 last:border-b-0">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">
                  {category.title}
                </h3>
                <div className="space-y-2">
                  {category.shortcuts.map((shortcut, sidx) => (
                    <div
                      key={sidx}
                      className="flex items-center justify-between py-2 px-3 rounded bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {shortcut.description}
                      </span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, kidx) => (
                          <React.Fragment key={kidx}>
                            <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded shadow-sm">
                              {key}
                            </kbd>
                            {kidx < shortcut.keys.length - 1 && (
                              <span className="text-xs text-gray-500 dark:text-gray-400">+</span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>{t('keyboardShortcuts.tip', { defaultValue: 'Tip' })}:</strong>{' '}
              {t('keyboardShortcuts.macNote', { 
                defaultValue: 'On Mac, use ⌘ (Cmd) instead of Ctrl for most shortcuts.' 
              })}
            </p>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button onClick={onClose} className="btn-primary">
              {t('common.close', { defaultValue: 'Close' })}
            </button>
          </div>
        </div>
      </div>
    </FocusTrap>
  );
};
