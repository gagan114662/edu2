import React from 'react';

const LoginButton = () => {
    const handleLogin = () => {
        // Redirect to the backend Google login endpoint
        window.location.href = 'http://localhost:8000/auth/google/login';
    };

    return (
        <button
            onClick={handleLogin}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        >
            Login with Google
        </button>
    );
};

export default LoginButton;
