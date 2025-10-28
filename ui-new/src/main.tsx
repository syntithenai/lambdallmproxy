import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n/config' // Initialize i18n
import App from './App.tsx'
import { resetApiBase } from './utils/api'
import { ragDB } from './utils/ragDB'

// Expose ragDB to window for debugging
if (typeof window !== 'undefined') {
  (window as any).ragDB = ragDB;
  console.log('🔧 ragDB exposed to window.ragDB for debugging');
}

// Load PayPal SDK dynamically with client ID from environment
const loadPayPalSDK = () => {
  const clientId = import.meta.env.VITE_PP_CID;
  if (!clientId) {
    console.warn('⚠️ VITE_PAYPAL_CLIENT_ID not found in environment - PayPal integration disabled');
    return;
  }
  
  const script = document.createElement('script');
  script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD`;
  script.async = true;
  script.onload = () => console.log('✅ PayPal SDK loaded successfully');
  script.onerror = () => console.error('❌ Failed to load PayPal SDK');
  document.head.appendChild(script);
};

loadPayPalSDK();

// Register Service Worker for PWA functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('✅ Service Worker registered successfully:', registration.scope);
        
        // Check for updates periodically
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000); // Check every hour
        
        // Listen for service worker updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New service worker available - notify user
                console.log('🔄 New version available! Please refresh the page.');
                // Optional: Show toast notification to user
                const event = new CustomEvent('sw-update-available');
                window.dispatchEvent(event);
              }
            });
          }
        });
      })
      .catch((error) => {
        console.error('❌ Service Worker registration failed:', error);
      });
  });
} else {
  console.warn('⚠️ Service Workers not supported in this browser');
}

// Check for ?reset=true URL parameter to clear remote Lambda preference
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('reset') === 'true') {
  console.log('🔄 Reset parameter detected - clearing remote Lambda preference');
  resetApiBase();
  // Remove the reset parameter from URL to avoid repeated resets on reload
  urlParams.delete('reset');
  const newSearch = urlParams.toString();
  const newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '') + window.location.hash;
  window.history.replaceState({}, '', newUrl);
}

// StrictMode disabled temporarily due to AWS Lambda concurrency limit (10)
// StrictMode causes effects to run twice in development, doubling API calls
// Re-enable once AWS concurrency limit is increased to 1000
createRoot(document.getElementById('root')!).render(
  <App />
)
