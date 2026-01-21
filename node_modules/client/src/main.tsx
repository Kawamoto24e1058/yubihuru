import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './fatal-fx.css'
import App from './App.tsx'

// PWA Service Worker Registration
// PWA Service Worker Registration (一時停止)
// if ('serviceWorker' in navigator) {
//   window.addEventListener('load', () => {
//     navigator.serviceWorker.register('/sw.js', { scope: '/' })
//       .then((registration) => {
//         console.log('✅ PWA: Service Worker registered successfully:', registration.scope)
//         // Check for updates periodically
//         setInterval(() => {
//           registration.update()
//         }, 60000) // Check every 60 seconds
//       })
//       .catch((error) => {
//         console.warn('⚠️ PWA: Service Worker registration failed:', error)
//       })
//   })
// }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
