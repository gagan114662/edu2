import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleAuthProvider } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext';

const LoginPage = () => {
    const { isAuthenticated, isLoadingAuth } = useAuth();
    const navigate = useNavigate();
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!isLoadingAuth && isAuthenticated) {
            navigate('/'); // Redirect to HomePage if already authenticated and not loading
        }
    }, [isAuthenticated, isLoadingAuth, navigate]);

    const handleGoogleSignIn = async () => {
        setError(null); // Clear previous errors
        try {
            console.log("Attempting Google Sign-in...");
            console.log("Auth object:", auth);
            console.log("Google provider:", googleAuthProvider);
            
            const result = await signInWithPopup(auth, googleAuthProvider);
            console.log("Sign-in successful:", result.user);
            // onAuthStateChanged in AuthContext will handle navigation or state update
            // No explicit navigation here is needed after successful signInWithPopup
        } catch (err) {
            console.error("Firebase Sign-In Error: ", err);
            console.error("Error code:", err.code);
            console.error("Error message:", err.message);
            
            let errorMessage = `Failed to sign in: ${err.message}`;
            
            // Provide specific guidance for common errors
            if (err.code === 'auth/operation-not-allowed') {
                errorMessage = "Google Sign-in is not enabled. Please check Firebase Console: Authentication → Sign-in method → Google (make sure it's enabled and support email is set)";
            } else if (err.code === 'auth/unauthorized-domain') {
                errorMessage = "This domain is not authorized. Please add your domain to Firebase Console: Authentication → Sign-in method → Authorized domains";
            } else if (err.code === 'auth/popup-blocked') {
                errorMessage = "Popup was blocked by browser. Please allow popups for this site and try again.";
            } else if (err.code === 'auth/popup-closed-by-user') {
                errorMessage = "Sign-in was cancelled. Please try again.";
            }
            
            setError(errorMessage);
        }
    };

    if (isLoadingAuth) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
                <p className="text-lg text-gray-700">Loading authentication status...</p>
                {/* You could add a spinner here */}
            </div>
        );
    }

    // If already authenticated after loading, this component might briefly render then redirect due to useEffect.
    // Or, if redirection has already happened, this part won't be visible.

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
            <div className="p-8 bg-white shadow-md rounded-lg text-center">
                <h1 className="text-2xl font-bold mb-4">Welcome to AI Tutor</h1>
                <p className="mb-6 text-gray-600">Please sign in to continue.</p>
                {error && <p className="mb-4 text-red-500">{error}</p>}
                <button
                    onClick={handleGoogleSignIn}
                    className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline flex items-center justify-center"
                >
                    {/* You can add a Google icon here if you wish */}
                    <svg className="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48px" height="48px"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571l0.001-0.001l6.19,5.238C39.705,34.636,44,29.891,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path></svg>
                    Sign in with Google
                </button>
            </div>
        </div>
    );
};

export default LoginPage;
