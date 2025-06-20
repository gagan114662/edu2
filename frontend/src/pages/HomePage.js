import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom'; // Import Link
import ChatInterface from '../components/ChatInterface';
import ProfileSettings from '../components/ProfileSettings';

const HomePage = () => {
    const { isAuthenticated, user, logout, loading: authLoading } = useAuth(); // get loading state
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    // ProtectedRoute should handle this, but good to be safe if HomePage is accessed directly
    // AuthProvider now handles its own loading state display so this might not be strictly needed here
    // if children are not rendered by AuthProvider until its loading is false.
    if (authLoading) { // If still loading auth, can show a global page loader
        return <div className="flex justify-center items-center min-h-screen text-xl text-gray-700">Loading user information...</div>;
    }

    if (!isAuthenticated) { // If not authenticated AND not loading (covered by above), redirect
        navigate('/login');
        return null;
    }

    return (
        <div className="flex flex-col items-center min-h-screen bg-gray-100 p-4">
            <div className="w-full max-w-4xl">
                <div className="p-8 bg-white shadow-md rounded-lg text-center mb-6">
                    <h1 className="text-3xl font-bold mb-4">Welcome to AI Tutor!</h1>
                    {user && user.picture_url && (
                        <img
                        src={user.picture_url}
                        alt={user.name || 'User Avatar'}
                        className="w-24 h-24 rounded-full mx-auto mb-4 border-2 border-blue-500"
                    />
                )}
                {user ? (
                    <div className="text-xl mb-6"> {/* Changed to div for better structure of multiple lines */}
                        <p>Hello, <span className="font-semibold">{user.name || user.email || 'User'}</span>!</p>
                        {(user.selected_grade_level || user.curriculum_framework) && ( // Display only if at least one is set
                            <p className="text-sm text-gray-600 mt-1">
                                Grade: {user.selected_grade_level || 'Not set'} | Framework: {user.curriculum_framework || 'Not set'}
                            </p>
                        )}
                    </div>
                ) : (
                    <p className="text-xl mb-6">You are logged in.</p>
                )}
                <button
                    onClick={handleLogout}
                    className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline mr-2" // Added mr-2 for spacing
                >
                    Logout
                </button>
                {/* Link to Curriculum Browser */}
                <Link to="/curriculum" className="ml-2 bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline">
                    Browse Curriculum
                </Link>
                </div> {/* End of the user info box's content, button container */}
                {/* ProfileSettings and ChatInterface are outside the user info box, but within the max-w-4xl container */}
                <ProfileSettings />
                <ChatInterface />
            </div> {/* End of w-full max-w-4xl */}
        </div> {/* End of main flex container */}
    );
};

export default HomePage;
