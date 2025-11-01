/**
 * Project Database - IndexedDB for Project Management
 * 
 * Manages project entities used for filtering chat history, Swag snippets,
 * quizzes, and feed items. Projects are simple organizational units with
 * only a name, providing lightweight categorization across all content types.
 */

const PROJECT_DB_NAME = 'ProjectDB';
const PROJECT_DB_VERSION = 1;
const PROJECTS_STORE = 'projects';
const CURRENT_PROJECT_KEY = 'llm_proxy_current_project';

export interface Project {
  id: string;           // UUID
  name: string;         // Project name (user-defined)
  createdAt: number;    // Timestamp
  updatedAt: number;    // Timestamp
}

class ProjectDatabase {
  private db: IDBDatabase | null = null;

  /**
   * Initialize IndexedDB database
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(PROJECT_DB_NAME, PROJECT_DB_VERSION);

      request.onerror = () => {
        console.error('❌ Failed to open ProjectDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('✅ ProjectDB initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create projects store if it doesn't exist
        if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
          const objectStore = db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
          
          // Create indexes for efficient querying
          objectStore.createIndex('name', 'name', { unique: false });
          objectStore.createIndex('createdAt', 'createdAt', { unique: false });
          objectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          
          console.log('✅ Projects object store created');
        }
      };
    });
  }

  /**
   * Generate UUID v4
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Ensure database is initialized
   */
  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    if (!this.db) {
      throw new Error('Failed to initialize ProjectDB');
    }
    return this.db;
  }

  /**
   * Create a new project
   */
  async createProject(name: string): Promise<Project> {
    const db = await this.ensureDB();
    const trimmedName = name.trim();
    
    if (!trimmedName) {
      throw new Error('Project name cannot be empty');
    }

    // Check for duplicate names
    const existing = await this.getAllProjects();
    if (existing.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
      throw new Error(`Project "${trimmedName}" already exists`);
    }

    const project: Project = {
      id: this.generateUUID(),
      name: trimmedName,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([PROJECTS_STORE], 'readwrite');
      const store = transaction.objectStore(PROJECTS_STORE);
      const request = store.add(project);

      request.onsuccess = () => {
        console.log(`✅ Project created: ${project.name}`);
        resolve(project);
      };

      request.onerror = () => {
        console.error('❌ Failed to create project:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get all projects sorted by name
   */
  async getAllProjects(): Promise<Project[]> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([PROJECTS_STORE], 'readonly');
      const store = transaction.objectStore(PROJECTS_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const projects = request.result || [];
        // Sort alphabetically by name (case-insensitive)
        projects.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
        resolve(projects);
      };

      request.onerror = () => {
        console.error('❌ Failed to get all projects:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get a single project by ID
   */
  async getProject(id: string): Promise<Project | null> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([PROJECTS_STORE], 'readonly');
      const store = transaction.objectStore(PROJECTS_STORE);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        console.error('❌ Failed to get project:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Update a project's name
   */
  async updateProject(id: string, updates: Partial<Omit<Project, 'id' | 'createdAt'>>): Promise<void> {
    const db = await this.ensureDB();
    const project = await this.getProject(id);

    if (!project) {
      throw new Error(`Project with ID ${id} not found`);
    }

    // Validate name if updating
    if (updates.name !== undefined) {
      const trimmedName = updates.name.trim();
      if (!trimmedName) {
        throw new Error('Project name cannot be empty');
      }

      // Check for duplicate names (excluding current project)
      const existing = await this.getAllProjects();
      if (existing.some(p => p.id !== id && p.name.toLowerCase() === trimmedName.toLowerCase())) {
        throw new Error(`Project "${trimmedName}" already exists`);
      }

      updates.name = trimmedName;
    }

    const updatedProject: Project = {
      ...project,
      ...updates,
      updatedAt: Date.now()
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([PROJECTS_STORE], 'readwrite');
      const store = transaction.objectStore(PROJECTS_STORE);
      const request = store.put(updatedProject);

      request.onsuccess = () => {
        console.log(`✅ Project updated: ${updatedProject.name}`);
        resolve();
      };

      request.onerror = () => {
        console.error('❌ Failed to update project:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Delete a project
   */
  async deleteProject(id: string): Promise<void> {
    const db = await this.ensureDB();
    const project = await this.getProject(id);

    if (!project) {
      throw new Error(`Project with ID ${id} not found`);
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([PROJECTS_STORE], 'readwrite');
      const store = transaction.objectStore(PROJECTS_STORE);
      const request = store.delete(id);

      request.onsuccess = () => {
        console.log(`✅ Project deleted: ${project.name}`);
        
        // If this was the current project, clear selection
        if (this.getCurrentProject() === id) {
          this.setCurrentProject(null);
        }
        
        resolve();
      };

      request.onerror = () => {
        console.error('❌ Failed to delete project:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get current project ID from localStorage
   */
  getCurrentProject(): string | null {
    try {
      return localStorage.getItem(CURRENT_PROJECT_KEY);
    } catch (error) {
      console.error('❌ Failed to get current project:', error);
      return null;
    }
  }

  /**
   * Set current project ID in localStorage
   * Pass null to clear selection
   */
  setCurrentProject(id: string | null): void {
    try {
      if (id === null) {
        localStorage.removeItem(CURRENT_PROJECT_KEY);
        console.log('✅ Current project cleared');
      } else {
        localStorage.setItem(CURRENT_PROJECT_KEY, id);
        console.log(`✅ Current project set: ${id}`);
      }
      
      // Broadcast change event for other components
      window.dispatchEvent(new CustomEvent('projectChanged', { detail: { projectId: id } }));
    } catch (error) {
      console.error('❌ Failed to set current project:', error);
    }
  }

  /**
   * Clear current project selection
   */
  clearCurrentProject(): void {
    this.setCurrentProject(null);
  }
}

// Export singleton instance
export const projectDB = new ProjectDatabase();

// Initialize on module load
projectDB.init().catch(err => {
  console.error('❌ Failed to initialize ProjectDB:', err);
});
