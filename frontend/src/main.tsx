import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { bootstrapTheme } from './stores/themeStore';
import { bootstrapTeamStore } from './stores/teamStore';
import { queryClient } from './lib/react-query';
import '@fontsource-variable/geist/wght.css';
import './index.css';

// Hydrate state BEFORE first render
bootstrapTheme();
bootstrapTeamStore();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
