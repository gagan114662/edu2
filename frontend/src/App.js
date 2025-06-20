import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import ParentDashboardPage from './pages/ParentDashboardPage'; // Import new page
import { ParentDashboardProvider } from './context/ParentDashboardContext'; // Import the provider
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext'; // To get user role for nav link
import './App.css';

// Simple Navbar for demonstration
const Navbar = () => {
  const { isAuthenticated, logout, isParent, isLoadingAuth, isLoadingUserProfile } = useAuth();

  if (isLoadingAuth || isLoadingUserProfile) {
    return <div>Loading navigation...</div>;
  }

  return (
    <nav style={{ padding: '10px', borderBottom: '1px solid #ccc', marginBottom: '20px' }}>
      <Link to="/" style={{ marginRight: '10px' }}>Home</Link>
      {!isAuthenticated && <Link to="/login" style={{ marginRight: '10px' }}>Login</Link>}
      {isAuthenticated && isParent && (
        <Link to="/parent-dashboard" style={{ marginRight: '10px' }}>Parent Dashboard</Link>
      )}
      {isAuthenticated && <button onClick={logout}>Logout</button>}
    </nav>
  );
};


function App() {
  return (
    <Router>
      <Navbar /> {/* Add Navbar here */}
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Protected Routes for general authenticated users */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<HomePage />} />
          {/* Add other general protected routes here */}
        </Route>

        {/* Protected Routes for parents */}
        <Route element={<ProtectedRoute roleRequired="parent" />}>
          <Route
            path="/parent-dashboard"
            element={
              <ParentDashboardProvider>
                <ParentDashboardPage />
              </ParentDashboardProvider>
            }
          />
          {/* Add other parent-specific routes here, potentially also wrapped by ParentDashboardProvider if they need the same context */}
        </Route>

        {/* You can add a 404 Not Found page here */}
        {/* <Route path="*" element={<NotFoundPage />} /> */}
      </Routes>
    </Router>
  );
}

export default App;
