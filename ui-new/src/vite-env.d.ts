/// <reference types="vite/client" />

// Environment variables
interface ImportMetaEnv {
  readonly VITE_SHARE_BASE_URL?: string;
  readonly VITE_API?: string;
  readonly VITE_LAM?: string;
  readonly VITE_LOCAL?: string;
  readonly VITE_GGL_CID?: string;
  readonly VITE_PP_CID?: string;
  readonly BASE_URL?: string;
  readonly DEV?: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Google OAuth types
declare global {
  interface Window {
    google: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            element: HTMLElement,
            config: {
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
            }
          ) => void;
          prompt: () => void;
        };
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: {
              access_token: string;
              expires_in: number;
              scope: string;
              token_type: string;
              id_token?: string;
              error?: string;
              error_description?: string;
            }) => void;
            error_callback?: (error: any) => void;
          }) => {
            requestAccessToken: (options?: { prompt?: string }) => void;
          };
        };
      };
    };
    googleUser: any;
    googleAccessToken: string;
  }

  const google: Window['google'];
}

export {};
