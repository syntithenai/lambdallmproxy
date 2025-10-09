/**
 * ProviderSetupGate Component
 * 
 * Blocks unauthorized users from using the application until they configure
 * at least one LLM provider. Shows a full-screen overlay with provider setup form.
 * 
 * This component is displayed when:
 * - User is authenticated but NOT authorized (not in ALLOWED_EMAILS)
 * - User has zero providers configured
 * - Backend returns 403 with requiresProviderSetup: true
 */

import React, { useState, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { ProviderForm } from './ProviderForm';
import type { ProviderConfig } from '../types/provider';

interface ProviderSetupGateProps {
  isBlocked: boolean;
  onUnblock: () => void;
}

const ProviderSetupGate: React.FC<ProviderSetupGateProps> = ({ isBlocked, onUnblock }) => {
  const { settings } = useSettings();
  const [showForm, setShowForm] = useState(false);

  // Check if user has providers - if they do, automatically unblock
  useEffect(() => {
    if (isBlocked && settings.providers && settings.providers.length > 0) {
      console.log('✅ User has providers configured, unblocking UI');
      onUnblock();
    }
  }, [isBlocked, settings.providers, onUnblock]);

  // Handle provider added event
  useEffect(() => {
    const handleProviderAdded = (event: CustomEvent<ProviderConfig>) => {
      console.log('🎉 Provider added:', event.detail);
      // Give settings context time to update
      setTimeout(() => {
        if (settings.providers && settings.providers.length > 0) {
          onUnblock();
        }
      }, 100);
    };

    window.addEventListener('provider-added', handleProviderAdded as EventListener);

    return () => {
      window.removeEventListener('provider-added', handleProviderAdded as EventListener);
    };
  }, [settings.providers, onUnblock]);

  if (!isBlocked) {
    return null;
  }

  return (
    <div className="provider-setup-gate">
      <div className="gate-overlay">
        <div className="gate-content">
          <div className="gate-header">
            <h1>🔐 Provider Setup Required</h1>
            <p className="gate-subtitle">
              To use this service, you need to configure at least one LLM provider with your own API key.
            </p>
          </div>

          <div className="gate-info">
            <div className="info-box">
              <h3>Why do I need to add a provider?</h3>
              <p>
                This service requires API credentials to access Large Language Models (LLMs).
                You can use free tier providers like Groq or Gemini to get started at no cost.
              </p>
            </div>

            <div className="info-box">
              <h3>Recommended: Free Tier Providers</h3>
              <ul>
                <li>
                  <strong>Groq (Free):</strong> Fast inference with generous free tier
                  <br />
                  <a href="https://console.groq.com/" target="_blank" rel="noopener noreferrer">
                    Get API key →
                  </a>
                </li>
                <li>
                  <strong>Gemini (Free):</strong> Google's LLM with free tier
                  <br />
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
                    Get API key →
                  </a>
                </li>
              </ul>
            </div>

            <div className="info-box">
              <h3>Your API keys are secure</h3>
              <p>
                All API keys are stored locally in your browser and transmitted securely to our backend.
                We never store your API keys on our servers.
              </p>
            </div>
          </div>

          <div className="gate-action">
            {!showForm ? (
              <button 
                className="btn-primary btn-large"
                onClick={() => setShowForm(true)}
              >
                Add Your First Provider
              </button>
            ) : (
              <div className="gate-form">
                <h3>Configure Provider</h3>
                <ProviderForm 
                  onSave={() => {
                    console.log('✅ Provider added successfully');
                    setShowForm(false);
                    // The useEffect above will handle unblocking
                  }}
                  onCancel={() => setShowForm(false)}
                />
              </div>
            )}
          </div>

          <div className="gate-footer">
            <p className="text-muted">
              Once you add a provider, you'll be able to use all features of the application.
            </p>
          </div>
        </div>
      </div>

      <style>{`
        .provider-setup-gate {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 10000;
          background: rgba(0, 0, 0, 0.95);
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(10px);
        }

        .gate-overlay {
          width: 100%;
          height: 100%;
          overflow-y: auto;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
        }

        .gate-content {
          max-width: 800px;
          width: 100%;
          background: #1a1a1a;
          border-radius: 12px;
          padding: 3rem;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
          border: 1px solid #333;
        }

        .gate-header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .gate-header h1 {
          font-size: 2rem;
          margin: 0 0 1rem 0;
          color: #fff;
        }

        .gate-subtitle {
          font-size: 1.1rem;
          color: #bbb;
          margin: 0;
        }

        .gate-info {
          margin-bottom: 2rem;
        }

        .info-box {
          background: #252525;
          border-radius: 8px;
          padding: 1.5rem;
          margin-bottom: 1rem;
          border: 1px solid #333;
        }

        .info-box h3 {
          margin: 0 0 0.75rem 0;
          color: #fff;
          font-size: 1.1rem;
        }

        .info-box p {
          margin: 0;
          color: #bbb;
          line-height: 1.6;
        }

        .info-box ul {
          margin: 0.5rem 0 0 0;
          padding-left: 1.5rem;
          color: #bbb;
        }

        .info-box li {
          margin-bottom: 0.75rem;
          line-height: 1.6;
        }

        .info-box a {
          color: #4a9eff;
          text-decoration: none;
          font-size: 0.95rem;
        }

        .info-box a:hover {
          text-decoration: underline;
        }

        .gate-action {
          text-align: center;
          margin-bottom: 2rem;
        }

        .gate-form {
          background: #252525;
          border-radius: 8px;
          padding: 2rem;
          border: 1px solid #333;
        }

        .gate-form h3 {
          margin: 0 0 1.5rem 0;
          color: #fff;
        }

        .btn-primary {
          background: #4a9eff;
          color: white;
          border: none;
          padding: 1rem 2rem;
          border-radius: 8px;
          font-size: 1.1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-primary:hover {
          background: #357ac9;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(74, 158, 255, 0.3);
        }

        .btn-large {
          padding: 1.25rem 2.5rem;
          font-size: 1.2rem;
        }

        .gate-footer {
          text-align: center;
          border-top: 1px solid #333;
          padding-top: 1.5rem;
        }

        .text-muted {
          color: #888;
          font-size: 0.95rem;
          margin: 0;
        }

        @media (max-width: 768px) {
          .gate-content {
            padding: 2rem 1.5rem;
          }

          .gate-header h1 {
            font-size: 1.5rem;
          }

          .gate-subtitle {
            font-size: 1rem;
          }
        }
      `}</style>
    </div>
  );
};

export default ProviderSetupGate;
