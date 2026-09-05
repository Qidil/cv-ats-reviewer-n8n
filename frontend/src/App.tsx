import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import UploadPage from './pages/upload'
import AnalysisPage from './pages/analysis'
import MatchesPage from './pages/matches'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<UploadPage />} />
        <Route path="/analysis/:cvId" element={<AnalysisPage />} />
        <Route path="/matches/:cvId" element={<MatchesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
