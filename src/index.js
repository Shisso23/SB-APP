import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { Provider } from 'react-redux';
import store from './redux/store';
import { onSessionExpired } from './services/api/session';

// Surface an expired Firebase session instead of silently failing reads.
onSessionExpired(() => {
  // The API client already rejected the request; the auth provider will reflect the
  // signed-out state on the next auth event.
  // eslint-disable-next-line no-console
  console.warn('PredictXI session expired; sign in again to continue.');
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Provider store={store}>
        <App />
    </Provider>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
