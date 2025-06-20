import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom'; // Will still use navigate for post-logout

const HomePage = () => {
    // useAuth now returns Firebase user object, isAuthenticated, isLoadingAuth, and Firebase logout function
    const { user, isAuthenticated, isLoadingAuth, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = async () => {
        await logout(); // This is the Firebase logout from AuthContext
        // onAuthStateChanged will update user to null,
        // ProtectedRoute or this component's effect might redirect.
        // For explicit redirect after logout:
        navigate('/login');
    };

    if (isLoadingAuth) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
                <p className="text-lg text-gray-700">Loading user information...</p>
                {/* Spinner could go here */}
            </div>
        );
    }

    if (!isAuthenticated) {
        // This is a fallback, ProtectedRoute should handle this.
        // Or, if the page is accessed directly somehow while unauthenticated after loading.
        navigate('/login');
        return null;
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
            <div className="p-8 bg-white shadow-md rounded-lg text-center">
                <h1 className="text-3xl font-bold mb-4">Welcome to AI Tutor!</h1>
                {user && user.photoURL && (
                    <img
                        src={user.photoURL}
                        alt={user.displayName || 'User Avatar'}
                        className="w-24 h-24 rounded-full mx-auto mb-4 border-2 border-blue-500"
                    />
                )}
                {user ? (
                    <>
                        <p className="text-xl mb-2">
                            Hello, <span className="font-semibold">{user.displayName || 'User'}</span>!
                        </p>
                        <p className="text-md text-gray-600 mb-6">
                            Email: {user.email}
                        </p>
                    </>
                ) : (
                    <p className="text-xl mb-6">You are logged in.</p> // Should not happen if !isAuthenticated check is effective
                )}
                <button
                    onClick={handleLogout}
                    className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
                >
                    Logout
                </button>
            </div>
        </div>
    );
};

export default HomePage;
