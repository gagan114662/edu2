import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const AuthDebug = () => {
  const { user, isAuthenticated, getIdToken } = useAuth();
  const [tokenTest, setTokenTest] = useState('');
  const [tokenError, setTokenError] = useState('');

  const testToken = async () => {
    try {
      setTokenError('');
      setTokenTest('Testing...');
      
      const token = await getIdToken();
      if (token) {
        setTokenTest(`Token obtained: ${token.substring(0, 50)}...`);
      } else {
        setTokenTest('Token is null or undefined');
      }
    } catch (error) {
      setTokenError(`Error getting token: ${error.message}`);
      setTokenTest('');
    }
  };

  return (
    <div className="bg-gray-100 p-4 rounded-lg border">
      <h3 className="font-bold mb-2">Authentication Debug</h3>
      
      <div className="space-y-2 text-sm">
        <p><strong>User authenticated:</strong> {isAuthenticated ? 'Yes' : 'No'}</p>
        <p><strong>User object:</strong> {user ? 'Present' : 'None'}</p>
        {user && (
          <>
            <p><strong>User email:</strong> {user.email || 'No email'}</p>
            <p><strong>User UID:</strong> {user.uid || 'No UID'}</p>
          </>
        )}
        
        <button 
          onClick={testToken}
          className="bg-blue-500 text-white px-3 py-1 rounded text-sm"
        >
          Test Get Token
        </button>
        
        {tokenTest && (
          <p className="text-green-600"><strong>Token Test:</strong> {tokenTest}</p>
        )}
        
        {tokenError && (
          <p className="text-red-600"><strong>Token Error:</strong> {tokenError}</p>
        )}
      </div>
    </div>
  );
};

export default AuthDebug;