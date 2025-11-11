import { useState, useEffect } from 'react';
import type { FormEvent, ChangeEvent } from 'react';
import { useProject } from '../contexts/ProjectContext';
import { useTranslation } from 'react-i18next';
import { X, Plus, Trash2, FolderOpen } from 'lucide-react';
import type { Project } from '../db/projectDb';

interface ProjectSelectorDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * ProjectSelectorDialog - Modal for managing and selecting projects
 * 
 * Features:
 * - List all projects with radio button selection
 * - Create new project with input validation
 * - Delete projects with confirmation
 * - Select "All Projects" to clear filter
 * - Keyboard navigation (Escape to close)
 * - Internationalized labels
 */
export default function ProjectSelectorDialog({ isOpen, onClose }: ProjectSelectorDialogProps) {
  const { t } = useTranslation();
  const {
    projects,
    currentProject,
    createProject,
    deleteProject,
    selectProject,
    clearProject,
  } = useProject();

  const [newProjectName, setNewProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  const handleCreateProject = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = newProjectName.trim();
    if (!trimmedName) {
      setError(t('projects.errors.emptyName', 'Project name cannot be empty'));
      return;
    }

    // Check for duplicate names
    if (projects.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
      setError(t('projects.errors.duplicateName', 'A project with this name already exists'));
      return;
    }

    setIsCreating(true);
    try {
      await createProject(trimmedName);
      setNewProjectName('');
      setError(null);
      onClose(); // Close dialog after successful creation
    } catch (err) {
      setError(err instanceof Error ? err.message : t('projects.errors.createFailed', 'Failed to create project'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (deleteConfirmId === projectId) {
      // Confirmed - delete it
      try {
        await deleteProject(projectId);
        setDeleteConfirmId(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('projects.errors.deleteFailed', 'Failed to delete project'));
      }
    } else {
      // First click - show confirmation
      setDeleteConfirmId(projectId);
      // Auto-clear confirmation after 3 seconds
      setTimeout(() => setDeleteConfirmId(null), 3000);
    }
  };

  const handleSelectProject = async (project: Project | null) => {
    if (project) {
      await selectProject(project.id);
    } else {
      await clearProject();
    }
    onClose();
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setNewProjectName(e.target.value);
    if (error) setError(null);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-dialog-title"
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2
            id="project-dialog-title"
            className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2"
          >
            <FolderOpen className="w-5 h-5" />
            {t('projects.selectProject', 'Select Project')}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 
                       focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg p-1"
            aria-label={t('common.close', 'Close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Project List */}
          <div className="space-y-2 mb-6">
            {/* All Projects Option */}
            <label
              className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors
                ${!currentProject 
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500' 
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 border-2 border-transparent'
                }`}
            >
              <input
                type="radio"
                name="project"
                checked={!currentProject}
                onChange={() => handleSelectProject(null)}
                className="w-4 h-4 text-blue-600 focus:ring-blue-500"
              />
              <span className="flex-1 font-medium text-gray-900 dark:text-white">
                {t('projects.default', 'Default')}
              </span>
            </label>

            {/* Individual Projects */}
            {projects.map((project) => (
              <div
                key={project.id}
                className={`flex items-center gap-3 p-3 rounded-lg transition-colors
                  ${currentProject?.id === project.id 
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500' 
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700 border-2 border-transparent'
                  }`}
              >
                <label className="flex items-center gap-3 flex-1 cursor-pointer">
                  <input
                    type="radio"
                    name="project"
                    checked={currentProject?.id === project.id}
                    onChange={() => handleSelectProject(project)}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="flex-1 text-gray-900 dark:text-white">
                    {project.name}
                  </span>
                </label>
                <button
                  onClick={() => handleDeleteProject(project.id)}
                  className={`p-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500
                    ${deleteConfirmId === project.id
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                      : 'text-gray-400 hover:text-red-600 dark:hover:text-red-400'
                    }`}
                  title={deleteConfirmId === project.id 
                    ? t('projects.confirmDelete', 'Click again to confirm') 
                    : t('projects.delete', 'Delete project')}
                  aria-label={deleteConfirmId === project.id 
                    ? t('projects.confirmDelete', 'Click again to confirm') 
                    : t('projects.delete', 'Delete project')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Create New Project Form */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <form onSubmit={handleCreateProject} className="space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('projects.createNew', 'Create New Project')}
                </span>
                <div className="flex gap-2 mt-1">
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={handleInputChange}
                    placeholder={t('projects.namePlaceholder', 'Project name...')}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                             placeholder-gray-400 dark:placeholder-gray-500
                             focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={isCreating}
                  />
                  <button
                    type="submit"
                    disabled={isCreating || !newProjectName.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg
                             hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500
                             disabled:opacity-50 disabled:cursor-not-allowed
                             transition-colors duration-200 flex items-center gap-2"
                    aria-label={t('projects.create', 'Create')}
                  >
                    <Plus className="w-4 h-4" />
                    {t('projects.create', 'Create')}
                  </button>
                </div>
              </label>

              {/* Error Message */}
              {error && (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  {error}
                </p>
              )}
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('projects.description', 'Projects help organize your content, chats, quizzes, and feed.')}
          </p>
        </div>
      </div>
    </div>
  );
}
