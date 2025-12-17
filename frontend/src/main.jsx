import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import TourFilter from "./TourFilter.jsx"

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TourFilter />
  </StrictMode>,
)
