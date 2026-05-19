import React from 'react'
import { createRoot } from 'react-dom/client'

function App() {
  return <div>Tickets plugin — scaffolding ok</div>
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
