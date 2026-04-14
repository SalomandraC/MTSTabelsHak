import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app';
import faviconLogo from './app/favicon/logo.png';
import './shared/styles/global.css';

const faviconLink = document.querySelector<HTMLLinkElement>("link[rel='icon']") ?? document.createElement('link');
faviconLink.rel = 'icon';
faviconLink.type = 'image/png';
faviconLink.href = faviconLogo;
if (!faviconLink.parentNode) {
  document.head.appendChild(faviconLink);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
