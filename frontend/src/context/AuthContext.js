import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { auth } from '../firebaseConfig'; // Adjust path if needed

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // Will store Firebase user object
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingUserProfile, setIsLoadingUserProfile] = useState(false); // Initially false, true during fetch

  // Function to get ID token for backend API calls - defined early for use in useEffect
  const getIdTokenInternal = async (firebaseUser) => {
    if (firebaseUser) {
      try {
        return await firebaseUser.getIdToken(true); // Pass true to force refresh if needed
      } catch (error) {
        console.error("Error getting ID token: ", error);
        // Could potentially trigger logout or re-authentication if token is invalid/expired
        if (error.code === 'auth/user-token-expired' || error.code === 'auth/invalid-user-token') {
            // Call logout which is defined below, ensure it handles state updates
            // This creates a slight challenge if logout itself uses getIdToken or relies on user state
            // For now, simple call, but might need refinement if logout logic is complex
            await firebaseSignOut(auth); // Directly sign out to avoid circular dependency issues
            setCurrentUserProfile(null); // Clear profile on token error
            // setUser(null) will be handled by onAuthStateChanged
        }
        return null;
      }
    }
    return null;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setIsLoadingAuth(false);

      if (firebaseUser) {
        localStorage.setItem('authUserDisplayName', firebaseUser.displayName || 'User');
        setIsLoadingUserProfile(true);
        try {
          const token = await getIdTokenInternal(firebaseUser);
          if (token) {
            const response = await fetch('/api/users/me', {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });
            if (response.ok) {
              const profileData = await response.json();
              setCurrentUserProfile(profileData);
            } else {
              console.error("Failed to fetch user profile:", response.status);
              setCurrentUserProfile(null);
              if (response.status === 401 || response.status === 403) { // Token might be invalid
                await firebaseSignOut(auth); // Log out user
              }
            }
          } else {
            setCurrentUserProfile(null); // No token, no profile
          }
        } catch (error) {
          console.error("Error fetching user profile:", error);
          setCurrentUserProfile(null);
        } finally {
          setIsLoadingUserProfile(false);
        }
      } else {
        localStorage.removeItem('authUserDisplayName');
        setCurrentUserProfile(null);
        setIsLoadingUserProfile(false); // No user, so not loading profile
      }
    });
    return () => unsubscribe(); // Cleanup subscription on unmount
  }, []); // Empty dependency array means this effect runs once on mount and cleans up on unmount

  const logout = async () => {
    // No need to set isLoadingAuth here as onAuthStateChanged will handle it
    try {
      await firebaseSignOut(auth);
      // setUser(null) and setCurrentUserProfile(null) will be handled by onAuthStateChanged
    } catch (error) {
      console.error("Error signing out: ", error);
      // If onAuthStateChanged doesn't fire due to an error here, manually reset states:
      setUser(null);
      setCurrentUserProfile(null);
      setIsLoadingAuth(false);
      setIsLoadingUserProfile(false);
    }
  };

  // Public getIdToken for components to use
  const getIdToken = async () => {
    return await getIdTokenInternal(user);
  }

  const isParent = currentUserProfile?.role === 'parent';

  const value = {
    user, // Firebase user object
    currentUserProfile,
    isAuthenticated: !!user, // True if user object is not null
    isLoadingAuth,
    isLoadingUserProfile,
    isParent,
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
