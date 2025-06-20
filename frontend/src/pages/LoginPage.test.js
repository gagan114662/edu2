import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import LoginPage from './LoginPage';
import { useAuth } from '../context/AuthContext';
import { signInWithPopup } from 'firebase/auth'; // This will be the mock from __mocks__

// Mock react-router-dom's useNavigate
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useNavigate: () => mockNavigate,
}));

// Mock AuthContext
jest.mock('../context/AuthContext');

// Mock Firebase auth methods that are directly imported by LoginPage
// signInWithPopup is automatically mocked due to frontend/src/__mocks__/firebase/auth.js
// We can provide specific mock implementations per test if needed.

// Dummy HomePage for redirection testing
const HomePage = () => <div data-testid="home-page">Home Page</div>;

describe('LoginPage', () => {
    beforeEach(() => {
        mockNavigate.mockClear();
        signInWithPopup.mockClear(); // Clear mock calls from firebase/auth mock
        useAuth.mockReset(); // Reset useAuth mock state
    });

    const renderLoginPage = (authContextValue) => {
        useAuth.mockReturnValue(authContextValue);
        render(
            <MemoryRouter initialEntries={['/login']}>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/" element={<HomePage />} />
                </Routes>
            </MemoryRouter>
        );
    };

    test('renders sign-in button and page structure', () => {
        renderLoginPage({ isAuthenticated: false, isLoadingAuth: false });
        expect(screen.getByText(/welcome to ai tutor/i)).toBeInTheDocument();
        expect(screen.getByText(/please sign in to continue/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    });

    test('redirects to HomePage if already authenticated and not loading', () => {
        renderLoginPage({ isAuthenticated: true, isLoadingAuth: false });
        expect(mockNavigate).toHaveBeenCalledWith('/');
    });

    test('shows loading message if isLoadingAuth is true', () => {
        renderLoginPage({ isAuthenticated: false, isLoadingAuth: true });
        expect(screen.getByText(/loading authentication status/i)).toBeInTheDocument();
    });

    test('calls signInWithPopup on button click', async () => {
        renderLoginPage({ isAuthenticated: false, isLoadingAuth: false });
        signInWithPopup.mockResolvedValueOnce({ user: { uid: 'test-uid' } }); // Simulate successful sign-in

        const signInButton = screen.getByRole('button', { name: /sign in with google/i });
        fireEvent.click(signInButton);

        await waitFor(() => {
            expect(signInWithPopup).toHaveBeenCalledTimes(1);
            // auth and googleAuthProvider from firebaseConfig are used by signInWithPopup
            // These will be their mocked versions from __mocks__ if not specifically re-mocked here.
            // We can check if they are called with the correct (mocked) auth and provider objects.
            // expect(signInWithPopup).toHaveBeenCalledWith(expect.anything(), expect.anything());
        });
        // Note: Navigation after successful signInWithPopup is handled by onAuthStateChanged in AuthContext,
        // which then triggers useEffect in LoginPage to navigate.
        // Testing that full flow here would be more of an integration test.
        // For this unit test, we primarily care that signInWithPopup is called.
    });

    test('displays error message if signInWithPopup fails', async () => {
        renderLoginPage({ isAuthenticated: false, isLoadingAuth: false });
        const errorMessage = "Popup closed by user.";
        signInWithPopup.mockRejectedValueOnce({ message: errorMessage });

        const signInButton = screen.getByRole('button', { name: /sign in with google/i });
        fireEvent.click(signInButton);

        await waitFor(() => {
            expect(signInWithPopup).toHaveBeenCalledTimes(1);
        });

        expect(await screen.findByText(`Failed to sign in: ${errorMessage}`)).toBeInTheDocument();
    });
});
