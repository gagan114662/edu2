import React from 'react';
import LoginButton from '../components/LoginButton';

const LoginPage = () => {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
            <div className="p-8 bg-white shadow-md rounded-lg">
                <h1 className="text-2xl font-bold mb-4 text-center">Welcome!</h1>
                <p className="mb-6 text-center text-gray-600">Please log in to continue.</p>
                <LoginButton />
            </div>
        </div>
    );
};

export default LoginPage;
