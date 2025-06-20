import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import ProtectedRoute from './components/ProtectedRoute'; // Import ProtectedRoute
import './App.css'; // Assuming you have some global styles, or use index.css

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        {/* Protected Routes: */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<HomePage />} />
          {/* Add other protected routes here as children of ProtectedRoute */}
        </Route>
        {/* You can add a 404 Not Found page here */}
        {/* <Route path="*" element={<NotFoundPage />} /> */}
      </Routes>
    </Router>
  );
}

export default App;
