import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { bootstrapTheme } from './stores/themeStore';
import './index.css';

// Hydrate theme BEFORE first render so data-theme is set on <html>
// and avoids FOUC. Safe to call before React mounts.
bootstrapTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
