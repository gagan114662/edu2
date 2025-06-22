import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import ProgressDashboardPage from './pages/ProgressDashboardPage';
import CurriculumPage from './pages/CurriculumPage';
import ChatPage from './pages/ChatPage';
import SettingsPage from './pages/SettingsPage';
import ParentDashboardPage from './pages/ParentDashboardPage';
import Navigation from './components/Navigation';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';
import './App.css';

function App() {
  const { user } = useAuth();

  return (
    <Router>
      <div className="min-h-screen bg-gray-100">
        {user && <Navigation />}
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* Protected Routes: */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/dashboard" element={<ProgressDashboardPage />} />
            <Route path="/curriculum" element={<CurriculumPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/parent-dashboard" element={<ParentDashboardPage />} />
          </Route>

          {/* 404 Not Found page */}
          <Route path="*" element={
            <div className="min-h-screen flex items-center justify-center">
              <div className="text-center">
                <h1 className="text-4xl font-bold text-gray-800 mb-4">404</h1>
                <p className="text-gray-600">Page not found</p>
              </div>
            </div>
          } />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
