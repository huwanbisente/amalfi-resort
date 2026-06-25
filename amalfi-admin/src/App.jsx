import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AdminDashboard } from './pages/AdminDashboard';
import BookingWorkspace from './pages/BookingWorkspace';
import PrintReport from './pages/PrintReport';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-transparent">
        <Routes>
          <Route path="/" element={<AdminDashboard />} />
          <Route path="/bookings/:bookingRef" element={<BookingWorkspace />} />
          <Route path="/print-report" element={<PrintReport />} />
          <Route path="*" element={<AdminDashboard />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
