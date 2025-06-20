import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
// AuthCallbackPage is removed
import ProtectedRoute from './components/ProtectedRoute';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* The /auth/callback route is no longer needed with Firebase a uth handling the redirect flow */}
        {/* <Route path="/auth/callback" element={<AuthCallbackPage />} /> */}

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
