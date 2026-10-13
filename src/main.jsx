import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

const loadBrandFonts=()=>{if(navigator.connection?.saveData||['slow-2g','2g'].includes(navigator.connection?.effectiveType))return;const link=document.createElement('link');link.rel='stylesheet';link.href='https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,400;1,400&display=swap';document.head.appendChild(link);};
if(document.readyState==='complete')setTimeout(loadBrandFonts,1000);else window.addEventListener('load',()=>setTimeout(loadBrandFonts,1000),{once:true});
