import { Navigate, Route, Routes } from 'react-router-dom'
import HomePage from './pages/HomePage'
import OrderPage from './pages/OrderPage'
import DashboardPage from './pages/DashboardPage'
import QrPrintPage from './pages/QrPrintPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/order" element={<OrderPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/qr" element={<QrPrintPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
