import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { PricingProvider } from './PricingContext';
import { CinematicBackground } from './components/CinematicBackground';
import './styles.css';
import './mobile-premium.css';
import './landing-premium.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <PricingProvider>
        <CinematicBackground />
        <App />
      </PricingProvider>
    </BrowserRouter>
  </React.StrictMode>
);
