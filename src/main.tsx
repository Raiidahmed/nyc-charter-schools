import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles/base.css';
import './styles/topbar.css';
import './styles/filters.css';
import './styles/panel.css';
import './styles/map.css';
import './styles/dialogs.css';
import './styles/phone.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
