import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

// Wait for LIFF to initialize before rendering the app (if running in LINE)
// We use a dummy LIFF ID for development/skeleton purposes
const LIFF_ID = import.meta.env.VITE_LIFF_ID || "dummy-liff-id";

async function initializeApp() {
  try {
    if (window.liff && LIFF_ID !== "dummy-liff-id") {
      await window.liff.init({ liffId: LIFF_ID });
      console.log('LIFF Initialized');
    } else {
      console.log('Using dummy LIFF mode, skipping liff.init');
    }
  } catch (error) {
    console.error('LIFF Initialization failed', error);
  }

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

initializeApp();
