import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { connectBackendSocket } from './services/socket.js'

// Auto-connect to the real backend when configured.
// Set VITE_SOCKET_URL=http://localhost:5000 in .env (see .env.example).
// Without it the app stays in mock/demo mode — nothing breaks.
connectBackendSocket(import.meta.env.VITE_SOCKET_URL);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
