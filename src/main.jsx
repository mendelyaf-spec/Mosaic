import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import MosaicApp from './MosaicApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MosaicApp />
  </StrictMode>,
)
