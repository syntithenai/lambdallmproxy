import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { resetApiBase } from './utils/api'

// Check for ?reset=true URL parameter to clear remote Lambda preference
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('reset') === 'true') {
  console.log('🔄 Reset parameter detected - clearing remote Lambda preference');
  resetApiBase();
  // Remove the reset parameter from URL to avoid repeated resets on reload
  urlParams.delete('reset');
  const newSearch = urlParams.toString();
  const newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '');
  window.history.replaceState({}, '', newUrl);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
