import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = () => {
    const { isAuthenticated, isLoadingAuth, user } = useAuth();

    if (isLoadingAuth) {
        // Optional: Render a loading spinner or some placeholder while auth state is loading
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div>Loading...</div>
            </div>
        );
    }

    // No need to check localStorage directly anymore, as onAuthStateChanged is the source of truth.
    // isAuthenticated is derived from the Firebase user object.
    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return <Outlet />; // Render child routes/components if authenticated
};

export default ProtectedRoute;
