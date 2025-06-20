import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = () => {
    const { isAuthenticated, token } = useAuth(); // Check token as well, as isAuthenticated might have a slight delay in updating from localStorage

    // console.log("ProtectedRoute isAuthenticated:", isAuthenticated);
    // console.log("ProtectedRoute token:", token);


    if (!isAuthenticated && !localStorage.getItem('authToken')) { // Double check with localStorage for robustness
        return <Navigate to="/login" replace />;
    }

    return <Outlet />; // Render child routes/components
};

export default ProtectedRoute;
