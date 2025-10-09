import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

export type Provider = 'groq' | 'openai';

export interface Settings {
  provider: Provider;
  llmApiKey: string;
  tavilyApiKey: string;
  apiEndpoint: string;
  smallModel?: string;
  largeModel?: string;
  reasoningModel?: string;
}

interface SettingsContextValue {
  settings: Settings;
  setSettings: (settings: Settings) => void;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

// Lambda proxy endpoint - handles LLM requests, transcription, search tools, etc.
const LAMBDA_PROXY_URL = 'https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws';

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useLocalStorage<Settings>('app_settings', {
    provider: 'groq',
    llmApiKey: '',
    tavilyApiKey: '',
    apiEndpoint: `${LAMBDA_PROXY_URL}/openai/v1`,
    smallModel: 'llama-3.1-8b-instant',
    largeModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    reasoningModel: 'openai/gpt-oss-120b'
  });

  return (
    <SettingsContext.Provider value={{ settings, setSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
