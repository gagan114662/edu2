import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios'; // Import axios

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(localStorage.getItem('authToken'));
    const [user, setUser] = useState(JSON.parse(localStorage.getItem('authUser')));
    const [isAuthenticated, setIsAuthenticated] = useState(!!token);

    useEffect(() => {
        if (token) {
            localStorage.setItem('authToken', token);
            setIsAuthenticated(true);
            if (user) {
                localStorage.setItem('authUser', JSON.stringify(user));
            } else {
                // If there's a token but no user object, try to parse from token
                // This might happen on initial load from localStorage if user wasn't stored separately
                // or if login only provided a token.
                try {
                    const payload = JSON.parse(atob(token.split('.')[1]));
                    const initialUser = {
                        email: payload.sub,
                        name: payload.name || 'User',
                        picture_url: payload.picture || null
                    };
                    setUser(initialUser);
                    localStorage.setItem('authUser', JSON.stringify(initialUser));
                } catch (e) {
                    console.warn("Could not parse user info from token on initial load:", e);
                }
            }
        } else {
            localStorage.removeItem('authToken');
            localStorage.removeItem('authUser');
            setIsAuthenticated(false);
            setUser(null);
        }
    }, [token]); // Removed `user` from dependency array to avoid re-saving stringified user on every user change. User saving is handled by login or this effect when token changes.

    const login = (newToken, userData) => {
        setToken(newToken); // This will trigger the useEffect
        if (userData) {
            setUser(userData);
            localStorage.setItem('authUser', JSON.stringify(userData)); // Explicitly save user on login
        } else {
            // If no explicit user data, try to parse from token as a fallback
             try {
                const payload = JSON.parse(atob(newToken.split('.')[1]));
                const parsedUser = {
                    email: payload.sub,
                    name: payload.name || 'User',
                    picture_url: payload.picture || null
                };
                setUser(parsedUser);
                localStorage.setItem('authUser', JSON.stringify(parsedUser));
            } catch (e) {
                console.warn("Could not parse user info from token during login:", e);
                setUser(null); // Ensure user state is cleared if parsing fails
                localStorage.removeItem('authUser');
            }
        }
    };

    const logout = async () => {
        if (token) {
            try {
                await axios.post('http://localhost:8000/api/auth/logout', {}, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                console.log('Logout request to backend successful.');
            } catch (error) {
                console.error('Logout request to backend failed:', error);
                // Proceed with frontend logout regardless of backend call success
            }
        }
        setToken(null); // This will trigger the useEffect to clear localStorage and isAuthenticated
    };

    return (
        <AuthContext.Provider value={{ token, user, isAuthenticated, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
