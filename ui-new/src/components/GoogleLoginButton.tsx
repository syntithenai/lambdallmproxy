import React, { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';

export const GoogleLoginButton: React.FC = () => {
  const { isAuthenticated, user, login, logout } = useAuth();
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAuthenticated && buttonRef.current) {
      // Wait for Google SDK to load
      const initializeGoogleButton = () => {
        if (typeof google !== 'undefined' && google.accounts) {
          console.log('GoogleLoginButton: Initializing Google Sign-In');
          google.accounts.id.initialize({
            client_id: '927667106833-7od90q7nh5oage0shc3kka5s9vtg2loj.apps.googleusercontent.com',
            callback: (response: any) => {
              if (response.credential) {
                login(response.credential);
              }
            }
          });

          google.accounts.id.renderButton(
            buttonRef.current!,
            {
              theme: 'outline',
              size: 'large',
              text: 'signin_with',
              shape: 'rectangular'
            }
          );
          console.log('GoogleLoginButton: Button rendered');
        } else {
          console.log('GoogleLoginButton: Google SDK not loaded yet, retrying...');
          // Retry after a short delay
          setTimeout(initializeGoogleButton, 100);
        }
      };

      initializeGoogleButton();
    }
  }, [isAuthenticated, login]);

  if (isAuthenticated && user) {
    return (
      <div className="flex items-center gap-3">
        <img
          src={user.picture}
          alt={user.name}
          className="w-10 h-10 rounded-full border-2 border-primary-500"
        />
        <div className="hidden md:block">
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {user.name}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {user.email}
          </div>
        </div>
        <button
          onClick={logout}
          className="btn-secondary text-sm"
        >
          Sign Out
        </button>
      </div>
    );
  }

  // Only show login button when not authenticated
  return (
    <div 
      ref={buttonRef} 
      id="google-signin-button"
      className="min-w-[120px] min-h-[40px]"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    ></div>
  );
};
