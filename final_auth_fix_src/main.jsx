import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Mount the root of our application. We wrap the App in
// React.StrictMode to catch potential problems during
// development. The HTML page is assumed to have a root
// element with id="root" where the app will be rendered.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);