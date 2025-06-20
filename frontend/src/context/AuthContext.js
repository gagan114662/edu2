import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { auth } from '../firebaseConfig'; // Adjust path if needed

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // Will store Firebase user object
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setIsLoadingAuth(false);
      // No need to manage localStorage for token here, Firebase SDK handles it.
      // If you were storing user profile info separately in localStorage, you might update it here.
      if (firebaseUser) {
        localStorage.setItem('authUserDisplayName', firebaseUser.displayName || 'User');
      } else {
        localStorage.removeItem('authUserDisplayName');
      }
    });
    return () => unsubscribe(); // Cleanup subscription on unmount
  }, []);

  const logout = async () => {
    setIsLoadingAuth(true); // Optional: set loading true during logout process
    try {
      await firebaseSignOut(auth);
      // setUser(null) will be handled by onAuthStateChanged
      // setIsLoadingAuth(false) will also be handled by onAuthStateChanged
    } catch (error) {
      console.error("Error signing out: ", error);
      setIsLoadingAuth(false); // Ensure loading is false if error occurs
    }
  };

  // Function to get ID token for backend API calls
  const getIdToken = async () => {
    if (user) {
      try {
        return await user.getIdToken(true); // Pass true to force refresh if needed
      } catch (error) {
        console.error("Error getting ID token: ", error);
        // Could potentially trigger logout or re-authentication if token is invalid/expired
        if (error.code === 'auth/user-token-expired' || error.code === 'auth/invalid-user-token') {
            await logout(); // Log out user if token is invalid
        }
        return null;
      }
    }
    return null;
  };

  const value = {
    user, // Firebase user object
    isAuthenticated: !!user, // True if user object is not null
    isLoadingAuth,
    logout, // Firebase logout
    getIdToken // Function to get Firebase ID token
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
