import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ roleRequired }) => {
    const { isAuthenticated, isLoadingAuth, currentUserProfile, isLoadingUserProfile } = useAuth();
    const location = useLocation();

    if (isLoadingAuth || isLoadingUserProfile) {
        // Optional: Render a loading spinner or some placeholder
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div>Loading User Profile...</div>
            </div>
        );
    }

    if (!isAuthenticated) {
        // Redirect them to the /login page, but save the current location they were
        // trying to go to so we can send them along after they login.
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (roleRequired && currentUserProfile?.role !== roleRequired) {
        // User is authenticated but does not have the required role
        // Redirect to home page or an "Unauthorized" page
        // For now, redirecting to home page.
        console.warn(`User role '${currentUserProfile?.role}' does not match required role '${roleRequired}'. Redirecting.`);
        return <Navigate to="/" replace />;
    }

    return <Outlet />; // Render child routes/components if authenticated and role (if required) matches
};

export default ProtectedRoute;
