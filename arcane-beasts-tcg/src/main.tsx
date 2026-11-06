import React from 'react';
import ReactDOM from 'react-dom/client';
import './fonts';
import './styles/global.css';
import { installSkins } from './styles/skin';
import { App } from './App';
import { initPwa } from './lib/pwa';

initPwa();
installSkins();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
