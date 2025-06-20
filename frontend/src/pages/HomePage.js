import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import ChatInterface from '../components/ChatInterface'; // Added import

const HomePage = () => {
    const { isAuthenticated, user, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login'); // Redirect to login page after logout
    };

    if (!isAuthenticated) {
        // This check is more for safety, ProtectedRoute should handle unauthorized access.
        // However, if a user lands here somehow without being authenticated, redirect.
        navigate('/login');
        return null; // Or a loading spinner
    }

    return (
        <div className="flex flex-col items-center min-h-screen bg-gray-100 p-4">
            <div className="w-full max-w-4xl"> {/* Added a wrapper to constrain width */}
                <div className="p-8 bg-white shadow-md rounded-lg text-center mb-6"> {/* Existing welcome box */}
                    <h1 className="text-3xl font-bold mb-4">Welcome to AI Tutor!</h1>
                    {user && user.picture_url && (
                        <img
                        src={user.picture_url}
                        alt={user.name || 'User Avatar'}
                        className="w-24 h-24 rounded-full mx-auto mb-4 border-2 border-blue-500"
                    />
                )}
                {user ? (
                    <p className="text-xl mb-6">
                        Hello, <span className="font-semibold">{user.name || user.email || 'User'}</span>!
                    </p>
                ) : (
                    <p className="text-xl mb-6">You are logged in.</p>
                )}
                <button
                    onClick={handleLogout}
                    className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
                >
                    Logout
                </button>
                </div>

                {/* Add ChatInterface below the welcome box */}
                <ChatInterface />
            </div>
        </div>
    );
};

export default HomePage;
