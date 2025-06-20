import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import { useAuth } from '../context/AuthContext';

// Mock AuthContext
jest.mock('../context/AuthContext');

// Mock localStorage for this test suite (ProtectedRoute checks it as a fallback)
// jest-localstorage-mock should be globally configured via setupTests.js,
// but clearing it here ensures a clean state for these specific tests.
beforeEach(() => {
    localStorage.clear();
});


const TestChildComponent = () => <div data-testid="child-component">Protected Content</div>;
const LoginPage = () => <div data-testid="login-page">Login Page</div>;

describe('ProtectedRoute', () => {
    const renderWithRouter = (authValue, initialEntry = '/protected') => {
        useAuth.mockReturnValue(authValue); // Setup mock value for useAuth

        // Clear localStorage for each specific scenario unless specified
        if (!authValue.token && !authValue.isAuthenticated) { // if unauth, ensure no lingering token
             localStorage.removeItem('authToken');
        } else if (authValue.token) {
             localStorage.setItem('authToken', authValue.token);
        }


        render(
            <MemoryRouter initialEntries={[initialEntry]}>
                <Routes>
                    <Route element={<ProtectedRoute />}>
                        <Route path="/protected" element={<TestChildComponent />} />
                    </Route>
                    <Route path="/login" element={<LoginPage />} />
                </Routes>
            </MemoryRouter>
        );
    };

    test('renders child component if authenticated (via context)', () => {
        renderWithRouter({ isAuthenticated: true, token: 'fake-token' });
        expect(screen.getByTestId('child-component')).toBeInTheDocument();
        expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
    });

    test('redirects to login if not authenticated (via context)', () => {
        renderWithRouter({ isAuthenticated: false, token: null });
        expect(screen.queryByTestId('child-component')).not.toBeInTheDocument();
        expect(screen.getByTestId('login-page')).toBeInTheDocument(); // Check that we landed on login
    });

    test('renders child component if not authenticated by context but token exists in localStorage', () => {
        // This tests the fallback check in ProtectedRoute for robustness,
        // though ideally context and localStorage are in sync.
        localStorage.setItem('authToken', 'fallback-token');
        renderWithRouter({ isAuthenticated: false, token: null }); // Context says not auth

        // The ProtectedRoute currently prioritizes context. If context says false, it redirects.
        // To make it render child if localStorage token exists even if context is false (e.g. context not yet updated),
        // ProtectedRoute logic would need to be: if (context.isAuth || localStorage.getItem('authToken'))
        // Current logic: if (!isAuthenticated && !localStorage.getItem('authToken')) then redirect.
        // So, if isAuthenticated is false, but localStorage has token, it will still render child. Let's test that.
        // The provided ProtectedRoute code is: `if (!isAuthenticated && !localStorage.getItem('authToken')) { return <Navigate to="/login" replace />; }`
        // This means if EITHER isAuthenticated is true OR localStorage has a token, it should render Outlet.
        // So if context.isAuthenticated is false, but localStorage has a token, it should STILL render the child.
        expect(screen.getByTestId('child-component')).toBeInTheDocument();
    });

    test('redirects to login if not authenticated by context AND no token in localStorage', () => {
        localStorage.removeItem('authToken'); // Ensure no fallback token
        renderWithRouter({ isAuthenticated: false, token: null });
        expect(screen.queryByTestId('child-component')).not.toBeInTheDocument();
        expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });
});
