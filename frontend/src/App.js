import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import ProtectedRoute from './components/ProtectedRoute';
import CurriculumPage from './pages/CurriculumPage';
import ClassroomPage from './pages/ClassroomPage'; // Import the new ClassroomPage
import { AuthProvider } from './context/AuthContext'; // Import AuthProvider
import './App.css';

function App() {
  return (
    <Router>
      <AuthProvider> {/* Ensure AuthProvider wraps all routes that might use useAuth */}
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          {/* Protected Routes: */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/curriculum" element={<CurriculumPage />} />
            <Route path="/classroom" element={<ClassroomPage />} /> {/* Add new Classroom route */}
          </Route>
          {/* You can add a 404 Not Found page here */}
        {/* <Route path="*" element={<NotFoundPage />} /> */}
      </Routes>
    </Router>
  );
}

export default App;
