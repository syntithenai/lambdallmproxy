import React, { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';

// Track if we've already attempted One Tap in this session
// to prevent "Cannot continue with Google" popup on rapid re-renders
let hasAttemptedOneTap = false;

export const LoginScreen: React.FC = () => {
  const { login } = useAuth();
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (buttonRef.current) {
      const initializeGoogleButton = () => {
        if (typeof google !== 'undefined' && google.accounts) {
          console.log('LoginScreen: Initializing Google Sign-In');
          (google.accounts.id.initialize as any)({
            client_id: '927667106833-7od90q7nh5oage0shc3kka5s9vtg2loj.apps.googleusercontent.com',
            callback: (response: any) => {
              if (response.credential) {
                console.log('LoginScreen: Login successful');
                login(response.credential);
              }
            },
            // Enable auto-select for returning users
            auto_select: true,
            cancel_on_tap_outside: false
          });

          (google.accounts.id.renderButton as any)(
            buttonRef.current!,
            {
              theme: 'filled_blue',
              size: 'large',
              text: 'signin_with',
              shape: 'rectangular',
              width: 300
            }
          );

          // Attempt silent sign-in for returning users
          // Only attempt once per session to prevent "Cannot continue with Google" popup
          if (!hasAttemptedOneTap) {
            hasAttemptedOneTap = true;
            console.log('LoginScreen: Attempting One Tap sign-in (first time this session)');
            
            try {
              (google.accounts.id.prompt as any)((notification: any) => {
                if (notification.isNotDisplayed && notification.isNotDisplayed()) {
                  console.log('LoginScreen: One Tap not displayed:', notification.getNotDisplayedReason());
                } else if (notification.isSkippedMoment && notification.isSkippedMoment()) {
                  console.log('LoginScreen: One Tap skipped:', notification.getSkippedReason());
                } else {
                  console.log('LoginScreen: One Tap displayed successfully');
                }
              });
            } catch (error) {
              // Silently catch any Google One Tap errors to prevent popup
              console.log('LoginScreen: One Tap prompt failed silently:', error);
            }
          } else {
            console.log('LoginScreen: Skipping One Tap (already attempted this session)');
          }
        } else {
          console.log('LoginScreen: Google SDK not loaded yet, retrying...');
          setTimeout(initializeGoogleButton, 100);
        }
      };

      initializeGoogleButton();
    }
  }, [login]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-12 max-w-md w-full mx-4">
        <div className="text-center mb-8">
          {/* App Logo/Icon */}
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full mb-4">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            LLM Proxy
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            AI-powered research assistant with web search
          </p>
        </div>

        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4 text-center">
            Sign in to continue
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-6">
            Authentication is required to use this application
          </p>
        </div>

        {/* Google Sign-In Button */}
        <div className="flex justify-center">
          <div 
            ref={buttonRef} 
            id="login-screen-google-signin"
            className="min-w-[300px] min-h-[44px]"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          ></div>
        </div>

        <div className="mt-6 text-xs text-gray-500 dark:text-gray-400 text-center">
          Secure authentication powered by Google
        </div>
      </div>
    </div>
  );
};
