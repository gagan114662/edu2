import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios'; // Ensure axios is imported

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(localStorage.getItem('authToken'));
    // Ensure initial user state can accommodate new fields, or they'll be added when fetched/updated
    const [user, setUser] = useState(() => {
        const storedUser = localStorage.getItem('authUser');
        try {
            return storedUser ? JSON.parse(storedUser) : null;
        } catch (e) {
            console.error("Error parsing stored user JSON:", e);
            localStorage.removeItem('authUser'); // Clear corrupted data
            return null;
        }
    });
    const [isAuthenticated, setIsAuthenticated] = useState(!!token);
    const [loading, setLoading] = useState(true); // Added loading state for initial fetch

    // Function to fetch user profile (e.g., on initial load or after login)
    const fetchUserProfile = async (currentToken) => {
        if (!currentToken) {
            setUser(null);
            setIsAuthenticated(false);
            setLoading(false);
            localStorage.removeItem('authUser');
            localStorage.removeItem('authToken'); // Also clear token from storage if fetch fails due to bad token
            setToken(null); // Clear token from state
            return;
        }
        setLoading(true); // Set loading true at the start of fetch
        try {
            const response = await axios.get('http://localhost:8000/api/users/me', {
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });
            setUser(response.data);
            localStorage.setItem('authUser', JSON.stringify(response.data));
            setIsAuthenticated(true);
        } catch (error) {
            console.error('Failed to fetch user profile:', error);
            // If fetching user fails (e.g. invalid token), log out user
            setToken(null);
            setUser(null);
            setIsAuthenticated(false);
            localStorage.removeItem('authUser');
            localStorage.removeItem('authToken');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const currentTokenInStorage = localStorage.getItem('authToken');
        if (currentTokenInStorage) {
            if (!token) setToken(currentTokenInStorage); // Sync state if token was cleared but exists in storage
            fetchUserProfile(currentTokenInStorage);
        } else {
            setLoading(false); // No token, not loading user
            // Ensure user state is also cleared if no token
            setUser(null);
            setIsAuthenticated(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run once on mount

    // This effect syncs localStorage when token changes (e.g., on login/logout)
    useEffect(() => {
        if (token) {
            localStorage.setItem('authToken', token);
            // User data will be fetched by fetchUserProfile or set by login directly
        } else {
            localStorage.removeItem('authToken');
            localStorage.removeItem('authUser');
            setUser(null); // Clear user state
            setIsAuthenticated(false); // Update auth status
        }
    }, [token]);


    const login = (newToken) => {
        // The `token` state update will trigger the useEffect above.
        // fetchUserProfile will be called by the mount useEffect if token is already in localStorage,
        // or after successful OAuth callback sets the token.
        // If login is called with a new token (e.g. from OAuth redirect),
        // set it and then fetch profile.
        setToken(newToken);
        if (newToken) {
            fetchUserProfile(newToken);
        }
    };

    const updateUserProfile = async (profileData) => {
        if (!token) {
            console.error("No token available for updating profile.");
            throw new Error("Authentication required to update profile.");
        }
        try {
            const response = await axios.put(
                'http://localhost:8000/api/users/me/profile',
                profileData,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            setUser(response.data); // Update user state with response from backend
            localStorage.setItem('authUser', JSON.stringify(response.data));
            return response.data; // Return updated user data
        } catch (error) {
            console.error('Failed to update user profile:', error.response?.data?.detail || error.message);
            const errToThrow = new Error(error.response?.data?.detail || 'Failed to update profile.');
            // You could add more properties to errToThrow if needed, like status
            // e.g. errToThrow.status = error.response?.status;
            throw errToThrow;
        }
    };

    const logout = async () => {
        if (token) {
            try {
                // Backend logout is optional / depends on session management strategy
                await axios.post('http://localhost:8000/api/auth/logout', {}, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                console.log('Logout request to backend successful.');
            } catch (error) {
                console.error('Logout request to backend failed:', error);
            }
        }
        setToken(null); // This will trigger the useEffect to clear user, localStorage, and isAuthenticated
    };

    return (
        <AuthContext.Provider value={{ token, user, isAuthenticated, login, logout, updateUserProfile, loading, fetchUserProfile }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) { // Check for undefined specifically
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
