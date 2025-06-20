import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import { useAuth } from '../context/AuthContext';

// Mock AuthContext
jest.mock('../context/AuthContext');

// Dummy components for testing routes
const TestChildComponent = () => <div data-testid="child-component">Protected Content</div>;
const LoginPageForProtectedRouteTest = () => <div data-testid="login-page-for-protectedroute">Login Page</div>;

describe('ProtectedRoute', () => {
    beforeEach(() => {
        useAuth.mockReset();
        // localStorage interaction is no longer part of ProtectedRoute's core logic with Firebase AuthContext
        localStorage.clear();
    });

    const renderProtectedRoute = (authContextValue, initialEntry = '/protected') => {
        useAuth.mockReturnValue(authContextValue);
        render(
            <MemoryRouter initialEntries={[initialEntry]}>
                <Routes>
                    <Route element={<ProtectedRoute />}>
                        <Route path="/protected" element={<TestChildComponent />} />
                    </Route>
                    <Route path="/login" element={<LoginPageForProtectedRouteTest />} />
                </Routes>
            </MemoryRouter>
        );
    };

    test('displays loading indicator when isLoadingAuth is true', () => {
        renderProtectedRoute({ isAuthenticated: false, user: null, isLoadingAuth: true });
        // ProtectedRoute renders a "Loading..." div
        expect(screen.getByText(/Loading.../i)).toBeInTheDocument();
        expect(screen.queryByTestId('child-component')).not.toBeInTheDocument();
        expect(screen.queryByTestId('login-page-for-protectedroute')).not.toBeInTheDocument();
    });

    test('renders child component if authenticated and not loading', async () => {
        renderProtectedRoute({ isAuthenticated: true, user: { uid: 'test-uid' }, isLoadingAuth: false });
        // Wait for any potential async updates if ProtectedRoute had them (though it's sync after isLoadingAuth is false)
        await waitFor(() => {
            expect(screen.getByTestId('child-component')).toBeInTheDocument();
        });
        expect(screen.queryByTestId('login-page-for-protectedroute')).not.toBeInTheDocument();
    });

    test('redirects to login if not authenticated and not loading', async () => {
        renderProtectedRoute({ isAuthenticated: false, user: null, isLoadingAuth: false });
        // The Navigate component will cause a re-render, wait for it.
        await waitFor(() => {
            expect(screen.getByTestId('login-page-for-protectedroute')).toBeInTheDocument();
        });
        expect(screen.queryByTestId('child-component')).not.toBeInTheDocument();
    });

    test('handles initial loading state then authenticated', async () => {
        const mockUseAuth = jest.fn()
            .mockReturnValueOnce({ isAuthenticated: false, user: null, isLoadingAuth: true }) // Initial call: loading
            .mockReturnValueOnce({ isAuthenticated: true, user: { uid: 'test-uid' }, isLoadingAuth: false }); // Second call (after state update): authenticated
        useAuth.mockImplementation(mockUseAuth);

        const { rerender } = render(
            <MemoryRouter initialEntries={['/protected']}>
                <Routes>
                    <Route element={<ProtectedRoute />}>
                        <Route path="/protected" element={<TestChildComponent />} />
                    </Route>
                    <Route path="/login" element={<LoginPageForProtectedRouteTest />} />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText(/Loading.../i)).toBeInTheDocument();

        // Simulate AuthContext updating after Firebase load
        // Rerender with new context value (or rely on AuthProvider to do this if not mocking useAuth directly)
        // Since useAuth is directly mocked, a simple rerender with changed mock value might not trigger it right.
        // Instead, we'll assume the component re-renders due to context change.
        // For this test, we can simulate the context provider re-rendering its children.
        // This is tricky with direct useAuth mock. A better way is to wrap with real AuthProvider and use setMockUser.
        // However, sticking to useAuth mock:

        // This re-render simulates the parent (AuthProvider) re-rendering ProtectedRoute
        // after the isLoadingAuth changes.
        rerender(
             <MemoryRouter initialEntries={['/protected']}>
                <Routes>
                    <Route element={<ProtectedRoute />}>
                        <Route path="/protected" element={<TestChildComponent />} />
                    </Route>
                    <Route path="/login" element={<LoginPageForProtectedRouteTest />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByTestId('child-component')).toBeInTheDocument();
        });
        expect(screen.queryByText(/Loading.../i)).not.toBeInTheDocument();
    });
});
