/**
 * Project Context - Manages project state and operations
 * 
 * Provides project management functionality including CRUD operations,
 * current project tracking, and project-based content filtering across
 * the application.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { projectDB } from '../db/projectDb';
import type { Project } from '../db/projectDb';

interface ProjectContextType {
  // State
  projects: Project[];
  currentProject: Project | null;
  isLoading: boolean;
  
  // Actions
  loadProjects: () => Promise<void>;
  createProject: (name: string) => Promise<Project>;
  updateProject: (id: string, name: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  selectProject: (id: string | null) => void;
  clearProject: () => void;
  
  // Utilities
  getCurrentProjectId: () => string | null;
  getProjectName: (id: string | undefined) => string;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

interface ProjectProviderProps {
  children: ReactNode;
}

export const ProjectProvider: React.FC<ProjectProviderProps> = ({ children }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Load all projects from database
   */
  const loadProjects = useCallback(async () => {
    try {
      setIsLoading(true);
      const allProjects = await projectDB.getAllProjects();
      setProjects(allProjects);
      
      // Load current project
      const currentId = projectDB.getCurrentProject();
      if (currentId) {
        const current = allProjects.find(p => p.id === currentId);
        setCurrentProject(current || null);
        
        // If current project not found (deleted), clear it
        if (!current) {
          projectDB.setCurrentProject(null);
        }
      }
    } catch (error) {
      console.error('❌ Failed to load projects:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Create a new project
   */
  const createProject = useCallback(async (name: string): Promise<Project> => {
    try {
      const newProject = await projectDB.createProject(name);
      await loadProjects(); // Reload to get updated list
      
      // Auto-select the newly created project
      projectDB.setCurrentProject(newProject.id);
      setCurrentProject(newProject);
      
      return newProject;
    } catch (error) {
      console.error('❌ Failed to create project:', error);
      throw error;
    }
  }, [loadProjects]);

  /**
   * Update a project's name
   */
  const updateProject = useCallback(async (id: string, name: string): Promise<void> => {
    try {
      await projectDB.updateProject(id, { name });
      await loadProjects(); // Reload to get updated list
    } catch (error) {
      console.error('❌ Failed to update project:', error);
      throw error;
    }
  }, [loadProjects]);

  /**
   * Delete a project
   */
  const deleteProject = useCallback(async (id: string): Promise<void> => {
    try {
      await projectDB.deleteProject(id);
      await loadProjects(); // Reload to get updated list
    } catch (error) {
      console.error('❌ Failed to delete project:', error);
      throw error;
    }
  }, [loadProjects]);

  /**
   * Select a project (or clear selection with null)
   */
  const selectProject = useCallback((id: string | null) => {
    projectDB.setCurrentProject(id);
    
    if (id === null) {
      setCurrentProject(null);
    } else {
      const project = projects.find(p => p.id === id);
      setCurrentProject(project || null);
    }
  }, [projects]);

  /**
   * Clear current project selection
   */
  const clearProject = useCallback(() => {
    selectProject(null);
  }, [selectProject]);

  /**
   * Get current project ID
   */
  const getCurrentProjectId = useCallback((): string | null => {
    return projectDB.getCurrentProject();
  }, []);

  /**
   * Get project name by ID (returns empty string if not found)
   */
  const getProjectName = useCallback((id: string | undefined): string => {
    if (!id) return '';
    const project = projects.find(p => p.id === id);
    return project?.name || '';
  }, [projects]);

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Listen for project changes from other components/tabs
  useEffect(() => {
    const handleProjectChange = (event: CustomEvent) => {
      const { projectId } = event.detail;
      if (projectId === null) {
        setCurrentProject(null);
      } else {
        const project = projects.find(p => p.id === projectId);
        setCurrentProject(project || null);
      }
    };

    window.addEventListener('projectChanged', handleProjectChange as EventListener);
    
    return () => {
      window.removeEventListener('projectChanged', handleProjectChange as EventListener);
    };
  }, [projects]);

  const value: ProjectContextType = {
    projects,
    currentProject,
    isLoading,
    loadProjects,
    createProject,
    updateProject,
    deleteProject,
    selectProject,
    clearProject,
    getCurrentProjectId,
    getProjectName
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
};

/**
 * Hook to use ProjectContext
 */
export const useProject = (): ProjectContextType => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
};
