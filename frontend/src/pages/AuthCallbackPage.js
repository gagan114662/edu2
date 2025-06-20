import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const AuthCallbackPage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { login } = useAuth();

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const token = params.get('token');
        // const tokenType = params.get('token_type'); // 'bearer', not directly used by login function yet

        if (token) {
            // Here, you might want to decode the token to get basic user info if it's an ID token
            // or make a call to a /api/me endpoint to fetch user details.
            // For now, we're just storing the token. User data can be added later.
            // Let's assume the JWT `sub` claim is the email, and we can perhaps parse it (not secure for sensitive info).
            // For simplicity, we'll pass null for userData for now.
            // A more robust solution would be:
            // 1. Backend includes user info in JWT claims (if safe and small, like email, name, picture).
            // 2. Frontend makes a /me request to backend with the new token to get user data.

            // Simple decoding for demonstration (not for production if JWT is not an ID token)
            let userData = null;
            try {
                const payload = JSON.parse(atob(token.split('.')[1])); // Get payload
                userData = {
                    email: payload.sub, // Assuming 'sub' is email
                    name: payload.name || 'User', // Optional: if name is in token
                    picture_url: payload.picture || null // Optional: if picture is in token
                };
            } catch (e) {
                console.error("Failed to parse token or token doesn't contain expected user info:", e);
                // Fallback or handle error - perhaps redirect to login with error
            }

            login(token, userData);
            navigate('/'); // Redirect to HomePage
        } else {
            console.error('No token found in callback.');
            navigate('/login'); // Redirect to LoginPage if no token
        }
    }, [location, login, navigate]);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
            <p className="text-lg text-gray-700">Processing authentication...</p>
            {/* You could add a spinner here */}
        </div>
    );
};

export default AuthCallbackPage;
