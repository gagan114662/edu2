import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import HomePage from './HomePage';
import { useAuth } from '../context/AuthContext';
// signOut from firebase/auth will be used by the actual AuthContext's logout
// We don't need to directly mock it here if we're mocking useAuth's returned logout
// However, if AuthContext's logout is NOT mocked by useAuth, then firebaseSignOut would be called.
// For simplicity, we mock the logout function provided by useAuth.

// Mock AuthContext
jest.mock('../context/AuthContext');

// Mock react-router-dom's useNavigate
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useNavigate: () => mockNavigate,
}));

const LoginPageForHomePageTest = () => <div data-testid="login-page-for-home">Login Page</div>;

describe('HomePage', () => {
    beforeEach(() => {
        useAuth.mockReset();
        mockNavigate.mockClear();
    });

    const renderHomePageWithAuth = (authContextValue) => {
        useAuth.mockReturnValue(authContextValue);
        render(
            <MemoryRouter initialEntries={['/']}>
                <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/login" element={<LoginPageForHomePageTest />} />
                </Routes>
            </MemoryRouter>
        );
    };

    test('displays loading message when isLoadingAuth is true', () => {
        renderHomePageWithAuth({ isAuthenticated: false, user: null, isLoadingAuth: true, logout: jest.fn() });
        expect(screen.getByText(/loading user information/i)).toBeInTheDocument();
    });

    test('displays welcome message and Firebase user info if authenticated', () => {
        const mockFirebaseUser = {
            displayName: 'Firebase Test User',
            email: 'firebase.test@example.com',
            photoURL: 'http://example.com/firebase.jpg'
        };
        renderHomePageWithAuth({ isAuthenticated: true, user: mockFirebaseUser, isLoadingAuth: false, logout: jest.fn() });

        expect(screen.getByText(/welcome to ai tutor!/i)).toBeInTheDocument();
        expect(screen.getByText(`Hello, ${mockFirebaseUser.displayName}!`)).toBeInTheDocument();
        expect(screen.getByText(`Email: ${mockFirebaseUser.email}`)).toBeInTheDocument();
        expect(screen.getByRole('img', { name: mockFirebaseUser.displayName })).toHaveAttribute('src', mockFirebaseUser.photoURL);
        expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
    });

    test('displays fallback "User" if displayName is missing', () => {
        const mockFirebaseUser = { email: 'firebase.test@example.com', photoURL: null }; // displayName missing
        renderHomePageWithAuth({ isAuthenticated: true, user: mockFirebaseUser, isLoadingAuth: false, logout: jest.fn() });
        expect(screen.getByText(/Hello, User!/i)).toBeInTheDocument(); // Falls back to "User"
    });

    test('calls logout from context and navigates to login on logout button click', async () => {
        const mockContextLogout = jest.fn(async () => {}); // Mock the logout from AuthContext
        renderHomePageWithAuth({
            isAuthenticated: true,
            user: { displayName: 'Test User' },
            isLoadingAuth: false,
            logout: mockContextLogout
        });

        const logoutButton = screen.getByRole('button', { name: /logout/i });

        // Use act for events and state updates
        await act(async () => {
            fireEvent.click(logoutButton);
            // Wait for any promises inside handleLogout to resolve, if any
            // (e.g., if mockContextLogout was a real async function)
        });

        expect(mockContextLogout).toHaveBeenCalledTimes(1);
        // HomePage itself now calls navigate('/login') after awaiting logout()
        expect(mockNavigate).toHaveBeenCalledWith('/login');
    });

    test('redirects to login if not authenticated and not loading (defensive check)', () => {
        renderHomePageWithAuth({ isAuthenticated: false, user: null, isLoadingAuth: false, logout: jest.fn() });
        expect(screen.getByTestId('login-page-for-home')).toBeInTheDocument();
        expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
});
