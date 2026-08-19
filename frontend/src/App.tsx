import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import UploadPage from './pages/upload'
import AnalysisPage from './pages/analysis'
import HistoryPage from './pages/history'
import MatchesPage from './pages/matches'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<UploadPage />} />
        <Route path="/analysis/:cvId" element={<AnalysisPage />} />
        <Route path="/matches/:cvId" element={<MatchesPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
