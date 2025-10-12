import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { ChatMessage } from '../utils/api';

// Extend Window interface for Cast SDK
declare global {
  interface Window {
    chrome?: any;
    cast?: any;
  }
}

declare const chrome: any;

interface CastContextType {
  isAvailable: boolean;
  isConnected: boolean;
  deviceName: string | null;
  initializeCast: () => void;
  requestSession: () => void;
  endSession: () => void;
  sendMessages: (messages: ChatMessage[]) => void;
  sendScrollPosition: (position: number) => void;
}

const CastContext = createContext<CastContextType | undefined>(undefined);

export const useCast = () => {
  const context = useContext(CastContext);
  if (!context) {
    throw new Error('useCast must be used within a CastProvider');
  }
  return context;
};

interface CastProviderProps {
  children: ReactNode;
}

export const CastProvider: React.FC<CastProviderProps> = ({ children }) => {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [session, setSession] = useState<any>(null);

  // Registered Application ID from Google Cast Console
  // Receiver URL: https://syntithenai.github.io/lambdallmproxy/chromecast-receiver.html
  const APPLICATION_ID = 'DE7507EF';

  const initializeCast = useCallback(() => {
    if (!window.chrome?.cast) {
      console.log('Cast API not available yet, will retry...');
      return;
    }

    const sessionRequest = new chrome.cast.SessionRequest(APPLICATION_ID);
    const apiConfig = new chrome.cast.ApiConfig(
      sessionRequest,
      (session: any) => {
        console.log('Cast session started:', session);
        setSession(session);
        setIsConnected(true);
        setDeviceName(session.receiver.friendlyName);
      },
      (status: string) => {
        console.log('Cast receiver availability:', status);
        setIsAvailable(status === chrome.cast.ReceiverAvailability.AVAILABLE);
      }
    );

    chrome.cast.initialize(
      apiConfig,
      () => console.log('Cast initialized successfully'),
      (error: any) => console.error('Cast initialization failed:', error)
    );
  }, [APPLICATION_ID]);

  const requestSession = useCallback(() => {
    if (!chrome?.cast) {
      console.error('Cast API not available');
      return;
    }

    chrome.cast.requestSession(
      (session: any) => {
        console.log('Cast session requested successfully:', session);
        setSession(session);
        setIsConnected(true);
        setDeviceName(session.receiver.friendlyName);

        // Listen for session events
        session.addUpdateListener((isAlive: boolean) => {
          console.log('Cast session update:', isAlive);
          if (!isAlive) {
            setIsConnected(false);
            setSession(null);
            setDeviceName(null);
          }
        });
      },
      (error: any) => {
        console.error('Error requesting cast session:', error);
      }
    );
  }, []);

  const endSession = useCallback(() => {
    if (session) {
      session.stop(
        () => {
          console.log('Cast session stopped');
          setIsConnected(false);
          setSession(null);
          setDeviceName(null);
        },
        (error: any) => console.error('Error stopping session:', error)
      );
    }
  }, [session]);

  const sendMessages = useCallback((messages: ChatMessage[]) => {
    if (!session || !isConnected) {
      console.log('No active cast session');
      return;
    }

    try {
      // Send messages to receiver via custom namespace
      const namespace = 'urn:x-cast:com.lambdallmproxy.chat';
      const message = {
        type: 'MESSAGES_UPDATE',
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
          name: msg.name,
          tool_call_id: msg.tool_call_id,
          isStreaming: msg.isStreaming
        }))
      };

      session.sendMessage(
        namespace,
        message,
        () => console.log('Messages sent to receiver'),
        (error: any) => console.error('Error sending messages:', error)
      );
    } catch (error) {
      console.error('Error in sendMessages:', error);
    }
  }, [session, isConnected]);

  const sendScrollPosition = useCallback((position: number) => {
    if (!session || !isConnected) return;

    try {
      const namespace = 'urn:x-cast:com.lambdallmproxy.chat';
      const message = {
        type: 'SCROLL_UPDATE',
        position
      };

      session.sendMessage(
        namespace,
        message,
        () => console.log('Scroll position sent:', position),
        (error: any) => console.error('Error sending scroll:', error)
      );
    } catch (error) {
      console.error('Error in sendScrollPosition:', error);
    }
  }, [session, isConnected]);

  // Load Cast SDK when component mounts
  useEffect(() => {
    // Check if script already exists
    if (document.getElementById('cast-sdk')) {
      if (window.chrome?.cast) {
        initializeCast();
      }
      return;
    }

    const script = document.createElement('script');
    script.id = 'cast-sdk';
    script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
    script.async = true;
    
    script.onload = () => {
      console.log('Cast SDK loaded');
      // Wait for cast API to be ready
      const checkCastReady = setInterval(() => {
        if (window.chrome?.cast) {
          clearInterval(checkCastReady);
          initializeCast();
        }
      }, 100);

      // Stop checking after 10 seconds
      setTimeout(() => clearInterval(checkCastReady), 10000);
    };

    document.head.appendChild(script);

    return () => {
      // Cleanup if needed (don't remove script as it might be used elsewhere)
    };
  }, [initializeCast]);

  const value: CastContextType = {
    isAvailable,
    isConnected,
    deviceName,
    initializeCast,
    requestSession,
    endSession,
    sendMessages,
    sendScrollPosition
  };

  return <CastContext.Provider value={value}>{children}</CastContext.Provider>;
};
