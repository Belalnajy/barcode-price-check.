import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { STR } from './i18n';
import './styles.css';

function currentStrings() {
  try {
    return STR[localStorage.getItem('lang') === 'en' ? 'en' : 'ar'];
  } catch {
    return STR.ar;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary t={currentStrings()}>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
