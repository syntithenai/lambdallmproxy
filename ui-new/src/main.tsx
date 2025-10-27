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
