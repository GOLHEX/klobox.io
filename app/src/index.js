//index.js
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import registerServiceWorker from './registerServiceWorker.js';

const root = createRoot(document.getElementById('root'));
root.render(<App />);
registerServiceWorker();