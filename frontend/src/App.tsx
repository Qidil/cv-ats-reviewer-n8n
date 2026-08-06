import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import UploadPage from './pages/upload'
import AnalysisPage from './pages/analysis'
import ApprovalPage from './pages/approval'
import ResultPage from './pages/result'
import HistoryPage from './pages/history'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<UploadPage />} />
        <Route path="/analysis/:cvId" element={<AnalysisPage />} />
        <Route path="/approval/:reviewId" element={<ApprovalPage />} />
        <Route path="/result/:rewriteId" element={<ResultPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
