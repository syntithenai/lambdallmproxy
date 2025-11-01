import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { getCachedApiBase } from '../utils/api';

export interface AvailableFeatures {
  chat: boolean;
  imageGeneration: boolean;
  imageEditing: boolean;
  imageEditingBasic: boolean;  // Sharp-based transforms (always true)
  imageEditingAI: boolean;      // AI-powered features (requires providers)
  transcription: boolean;
  textToSpeech: boolean;
  embeddings: boolean;
  webSearch: boolean;
}

interface FeaturesContextType {
  features: AvailableFeatures | null;
  loading: boolean;
  error: string | null;
  refreshFeatures: () => Promise<void>;
}

const FeaturesContext = createContext<FeaturesContextType | undefined>(undefined);

export const useFeatures = () => {
  const context = useContext(FeaturesContext);
  if (!context) {
    throw new Error('useFeatures must be used within a FeaturesProvider');
  }
  return context;
};

interface FeaturesProviderProps {
  children: ReactNode;
}

export const FeaturesProvider: React.FC<FeaturesProviderProps> = ({ children }) => {
  const { getToken, isAuthenticated } = useAuth();
  const [features, setFeatures] = useState<AvailableFeatures | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFeatures = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = await getToken();
      if (!token) {
        // Set default features when not authenticated
        setFeatures({
          chat: false,
          imageGeneration: false,
          imageEditing: false,
          imageEditingBasic: true,   // Always available (Sharp-based)
          imageEditingAI: false,      // Requires providers
          transcription: false,
          textToSpeech: false,
          embeddings: false,
          webSearch: true // Always available
        });
        setLoading(false);
        return;
      }

      const apiBase = await getCachedApiBase();
      const response = await fetch(`${apiBase}/billing`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.features) {
        // Ensure new fields have defaults if backend doesn't provide them yet
        setFeatures({
          ...data.features,
          imageEditingBasic: data.features.imageEditingBasic ?? true,  // Default true
          imageEditingAI: data.features.imageEditingAI ?? data.features.imageEditing ?? false
        });
      } else {
        // Fallback to default features
        setFeatures({
          chat: false,
          imageGeneration: false,
          imageEditing: false,
          imageEditingBasic: true,   // Always available
          imageEditingAI: false,      // Requires providers
          transcription: false,
          textToSpeech: false,
          embeddings: false,
          webSearch: true
        });
      }

      setLoading(false);
    } catch (err: any) {
      console.error('Failed to load features:', err);
      setError(err.message || 'Failed to load features');
      // Set default features on error
      setFeatures({
        chat: false,
        imageGeneration: false,
        imageEditing: false,
        imageEditingBasic: true,   // Always available
        imageEditingAI: false,      // Requires providers
        transcription: false,
        textToSpeech: false,
        embeddings: false,
        webSearch: true
      });
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadFeatures();
    } else {
      // Set default features when not authenticated
      setFeatures({
        chat: false,
        imageGeneration: false,
        imageEditing: false,
        imageEditingBasic: true,   // Always available
        imageEditingAI: false,      // Requires providers
        transcription: false,
        textToSpeech: false,
        embeddings: false,
        webSearch: true
      });
      setLoading(false);
    }
  }, [isAuthenticated]);

  const refreshFeatures = async () => {
    await loadFeatures();
  };

  return (
    <FeaturesContext.Provider value={{ features, loading, error, refreshFeatures }}>
      {children}
    </FeaturesContext.Provider>
  );
};
