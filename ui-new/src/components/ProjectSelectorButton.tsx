import { useState } from 'react';
import type { MouseEvent } from 'react';
import { useProject } from '../contexts/ProjectContext';
import { useTranslation } from 'react-i18next';
import { FolderOpen } from 'lucide-react';
import ProjectSelectorDialog from './ProjectSelectorDialog';

/**
 * ProjectSelectorButton - Top-left navigation button for project selection
 * 
 * Features:
 * - Shows current project name or "All Projects"
 * - Folder icon with dropdown indicator
 * - Opens ProjectSelectorDialog on click
 * - Internationalized labels
 */
export default function ProjectSelectorButton() {
  const { t } = useTranslation();
  const { currentProject } = useProject();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
  };

  // Display text: project name or "Default"
  const displayText = currentProject?.name || t('projects.default', 'Default');

  return (
    <>
      <button
        onClick={handleClick}
        className="flex items-center justify-center p-2 text-gray-700 dark:text-gray-200 
                   bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 
                   rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                   transition-colors duration-200"
        title={`${t('projects.selectProject', 'Select Project')}: ${displayText}`}
        aria-label={`${t('projects.selectProject', 'Select Project')}: ${displayText}`}
      >
        <FolderOpen className="w-5 h-5" />
      </button>

      {isDialogOpen && (
        <ProjectSelectorDialog
          isOpen={isDialogOpen}
          onClose={handleCloseDialog}
        />
      )}
    </>
  );
}
