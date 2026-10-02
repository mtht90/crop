import React from 'react';
import ReactDOM from 'react-dom/client';
import './fonts';
import './styles/global.css';
import { App } from './App';
import { initPwa } from './lib/pwa';
import { installChrome } from './ui/chrome';

initPwa();
installChrome();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
