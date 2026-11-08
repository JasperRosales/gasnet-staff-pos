import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ConfirmDialog from './components/Confirm'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <ConfirmDialog />
  </StrictMode>,
)
