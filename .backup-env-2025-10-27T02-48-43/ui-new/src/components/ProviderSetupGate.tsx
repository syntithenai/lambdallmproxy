/**
 * ProviderSetupGate Component
 * 
 * Shows "Buy Credits" screen for authenticated users who need to purchase credits.
 */

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import type { ProviderConfig } from '../types/provider';

interface ProviderSetupGateProps {
  isBlocked: boolean;
  onUnblock: () => void;
}

const ProviderSetupGate: React.FC<ProviderSetupGateProps> = ({ isBlocked, onUnblock }) => {
  const { settings } = useSettings();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isBlocked) {
      const hasUIProviders = settings.providers && settings.providers.length > 0;
      if (hasUIProviders) {
        console.log('User has UI providers configured, unblocking UI');
        onUnblock();
        return;
      }
    }
  }, [isBlocked, settings.providers, onUnblock]);

  useEffect(() => {
    const handleProviderAdded = (event: CustomEvent<ProviderConfig>) => {
      console.log('Provider added:', event.detail);
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

  if (isAuthenticated) {
    return (
      <div className="provider-setup-gate">
        <div className="gate-overlay">
          <div className="gate-content">
            <div className="gate-header">
              <h1>💳 Credits Required</h1>
              <p className="gate-subtitle">
                To use this service, you need to purchase credits.
              </p>
            </div>

            <div className="gate-info">
              <div className="info-box">
                <h3>How does it work?</h3>
                <p>
                  This is a pay-as-you-go service. Purchase credits to access our LLM providers 
                  without needing your own API keys. Your credits are tracked automatically, 
                  and you will be charged based on actual usage.
                </p>
              </div>

              <div className="info-box">
                <h3>Pricing</h3>
                <ul>
                  <li><strong>Small models:</strong> approximately $0.0001 per request</li>
                  <li><strong>Large models:</strong> approximately $0.001 per request</li>
                  <li><strong>Minimum purchase:</strong> $5.00 (5,000-50,000 requests)</li>
                </ul>
                <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#888' }}>
                  Actual costs vary based on model and tokens used.
                </p>
              </div>

              <div className="info-box">
                <h3>Secure Payment</h3>
                <p>
                  Payments are processed securely through PayPal. Your credit balance 
                  is updated instantly after purchase.
                </p>
              </div>
            </div>

            <div className="gate-action">
              <button 
                className="btn-primary btn-large"
                onClick={() => {
                  console.log('Navigating to billing page');
                  onUnblock();
                  navigate('/settings?tab=billing');
                }}
              >
                Buy Credits Now
              </button>
            </div>

            <div className="gate-footer">
              <p className="text-muted">
                Your balance will be displayed in the top left corner after purchase. 
                New users receive trial credits that expire after 24 hours.
              </p>
            </div>
          </div>
        </div>

        <style>{`.provider-setup-gate{position:fixed;top:0;left:0;right:0;bottom:0;z-index:10000;background:rgba(0,0,0,0.95);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(10px)}.gate-overlay{width:100%;height:100%;overflow-y:auto;display:flex;align-items:center;justify-content:center;padding:2rem}.gate-content{max-width:800px;width:100%;background:#1a1a1a;border-radius:12px;padding:3rem;box-shadow:0 20px 60px rgba(0,0,0,0.5);border:1px solid #333}.gate-header{text-align:center;margin-bottom:2rem}.gate-header h1{font-size:2rem;margin:0 0 1rem 0;color:#fff}.gate-subtitle{font-size:1.1rem;color:#bbb;margin:0}.gate-info{margin-bottom:2rem}.info-box{background:#252525;border-radius:8px;padding:1.5rem;margin-bottom:1rem;border:1px solid #333}.info-box h3{margin:0 0 0.75rem 0;color:#fff;font-size:1.1rem}.info-box p{margin:0;color:#bbb;line-height:1.6}.info-box ul{margin:0.5rem 0 0 0;padding-left:1.5rem;color:#bbb}.info-box li{margin-bottom:0.75rem;line-height:1.6}.gate-action{text-align:center;margin-bottom:2rem}.btn-primary{background:#4a9eff;color:white;border:none;padding:1rem 2rem;border-radius:8px;font-size:1.1rem;font-weight:600;cursor:pointer;transition:all 0.2s ease}.btn-primary:hover{background:#357ac9;transform:translateY(-2px);box-shadow:0 4px 12px rgba(74,158,255,0.3)}.btn-large{padding:1.25rem 2.5rem;font-size:1.2rem}.gate-footer{text-align:center;border-top:1px solid #333;padding-top:1.5rem}.text-muted{color:#888;font-size:0.95rem;margin:0}@media (max-width:768px){.gate-content{padding:2rem 1.5rem}.gate-header h1{font-size:1.5rem}.gate-subtitle{font-size:1rem}}`}</style>
      </div>
    );
  }

  return null;
};

export default ProviderSetupGate;
