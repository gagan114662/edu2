import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const ProfileSettings = () => {
    const { user, updateUserProfile, loading: authLoading } = useAuth();
    const [gradeLevel, setGradeLevel] = useState('');
    const [framework, setFramework] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (user) {
            setGradeLevel(user.selected_grade_level || '');
            setFramework(user.curriculum_framework || '');
        }
    }, [user]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage('');
        setError('');
        setIsSaving(true);
        try {
            // Ensure that empty strings are submitted as null or undefined if the backend expects that for optional fields
            // or if you want to "unset" them. For this example, submitting empty strings is fine if backend handles it.
            // Alternatively, convert empty strings to null:
            // const gradeToSubmit = gradeLevel.trim() === '' ? null : gradeLevel;
            // const frameworkToSubmit = framework.trim() === '' ? null : framework;

            await updateUserProfile({
                selected_grade_level: gradeLevel, // gradeToSubmit,
                curriculum_framework: framework, // frameworkToSubmit,
            });
            setMessage('Profile updated successfully!');
        } catch (err) {
            setError(err.message || 'Failed to update profile.');
        } finally {
            setIsSaving(false);
        }
    };

    if (authLoading) {
        return <p className="text-center text-gray-500 my-6">Loading profile settings...</p>;
    }

    // This check might be redundant if AuthProvider doesn't render children until user is loaded,
    // or if HomePage itself shows a global loader. However, it's a good safeguard.
    if (!user) {
         return <p className="text-center text-gray-500 my-6">Please log in to manage curriculum settings.</p>;
    }

    return (
        <div className="p-6 bg-white shadow-md rounded-lg w-full max-w-lg mx-auto my-6">
            <h2 className="text-2xl font-semibold mb-6 text-gray-700">Curriculum Settings</h2>

            {message && (
                <div className="mb-4 p-3 text-sm text-green-700 bg-green-100 rounded-md border border-green-300">
                    {message}
                </div>
            )}
            {error && (
                <div className="mb-4 p-3 text-sm text-red-700 bg-red-100 rounded-md border border-red-300">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit}>
                <div className="mb-4">
                    <label htmlFor="gradeLevel" className="block text-sm font-medium text-gray-700 mb-1">
                        Preferred Grade Level
                    </label>
                    <input
                        type="text"
                        id="gradeLevel"
                        value={gradeLevel}
                        onChange={(e) => setGradeLevel(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="e.g., Grade 5, 5th Grade, Middle School"
                    />
                    <p className="mt-1 text-xs text-gray-500">This helps the AI tutor tailor responses to the student's level.</p>
                </div>

                <div className="mb-6">
                    <label htmlFor="framework" className="block text-sm font-medium text-gray-700 mb-1">
                        Curriculum Framework (Optional)
                    </label>
                    <input
                        type="text"
                        id="framework"
                        value={framework}
                        onChange={(e) => setFramework(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="e.g., Common Core, NGSS, State Standards"
                    />
                     <p className="mt-1 text-xs text-gray-500">Specify a curriculum framework if applicable.</p>
                </div>

                <button
                    type="submit"
                    disabled={isSaving || authLoading} // Also disable if auth is still loading for some reason
                    className="w-full bg-blue-500 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {isSaving ? 'Saving...' : 'Save Profile Settings'}
                </button>
            </form>
        </div>
    );
};

export default ProfileSettings;
