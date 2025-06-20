import React from 'react';
import { render, act, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
// Firebase mocks are automatically applied due to __mocks__ directory
import { signOut as firebaseSignOut, setMockUser, clearFirebaseAuthState } from 'firebase/auth';

// Test component to consume and display context values
const TestConsumerComponent = () => {
    const { user, isAuthenticated, isLoadingAuth, logout, getIdToken } = useAuth();

    const handleGetIdToken = async () => {
        const token = await getIdToken();
        // console.log("TestConsumerComponent ID Token:", token);
        // You could display this token in the test component if needed for assertions
    };

    return (
        <div>
            <div data-testid="isLoadingAuth">{isLoadingAuth.toString()}</div>
            <div data-testid="isAuthenticated">{isAuthenticated.toString()}</div>
            <div data-testid="user">{user ? JSON.stringify({ uid: user.uid, displayName: user.displayName, email: user.email }) : 'null'}</div>
            <button onClick={logout}>Logout</button>
            <button onClick={handleGetIdToken}>Get ID Token</button>
        </div>
    );
};

describe('AuthContext with Firebase', () => {
    beforeEach(() => {
        // Reset Firebase auth mock state and any other mocks
        clearFirebaseAuthState(); // Resets mockCurrentUser in firebase/auth mock
        jest.clearAllMocks(); // Clears call counts etc. for jest.fn()
        localStorage.clear(); // Clear localStorage if AuthContext still uses it for anything (e.g. displayName)
    });

    test('initial state is loading, then not authenticated', async () => {
        render(
            <AuthProvider>
                <TestConsumerComponent />
            </AuthProvider>
        );
        // Initially, isLoadingAuth should be true
        expect(screen.getByTestId('isLoadingAuth').textContent).toBe('true');

        // Wait for onAuthStateChanged to fire (simulated by our mock)
        await waitFor(() => {
            expect(screen.getByTestId('isLoadingAuth').textContent).toBe('false');
        });

        expect(screen.getByTestId('isAuthenticated').textContent).toBe('false');
        expect(screen.getByTestId('user').textContent).toBe('null');
    });

    test('state updates when Firebase user logs in', async () => {
        render(
            <AuthProvider>
                <TestConsumerComponent />
            </AuthProvider>
        );

        const mockFirebaseUser = {
            uid: 'test-uid1',
            displayName: 'Firebase User',
            email: 'firebase@example.com',
            getIdToken: jest.fn(() => Promise.resolve('mock-id-token-1'))
        };

        act(() => {
            setMockUser(mockFirebaseUser); // Simulate Firebase onAuthStateChanged event
        });

        await waitFor(() => {
            expect(screen.getByTestId('isLoadingAuth').textContent).toBe('false');
        });
        expect(screen.getByTestId('isAuthenticated').textContent).toBe('true');
        expect(JSON.parse(screen.getByTestId('user').textContent)).toEqual({
            uid: 'test-uid1',
            displayName: 'Firebase User',
            email: 'firebase@example.com'
        });
    });

    test('logout calls firebaseSignOut and updates state', async () => {
        // Simulate initial logged-in state
        const mockFirebaseUser = {
            uid: 'test-uid2',
            displayName: 'User To Logout',
            email: 'logout@example.com',
            getIdToken: jest.fn(() => Promise.resolve('mock-id-token-2'))
        };
        act(() => {
            setMockUser(mockFirebaseUser);
        });

        render(
            <AuthProvider>
                <TestConsumerComponent />
            </AuthProvider>
        );

        // Wait for initial state to settle
        await waitFor(() => expect(screen.getByTestId('isAuthenticated').textContent).toBe('true'));

        // Click logout button
        act(() => {
            screen.getByText('Logout').click();
        });

        await waitFor(() => {
            expect(firebaseSignOut).toHaveBeenCalledTimes(1);
        });

        // onAuthStateChanged (mocked) should set user to null after signOut
        // and isLoadingAuth back to false
        await waitFor(() => {
             expect(screen.getByTestId('isLoadingAuth').textContent).toBe('false');
        });
        expect(screen.getByTestId('isAuthenticated').textContent).toBe('false');
        expect(screen.getByTestId('user').textContent).toBe('null');
    });

    test('getIdToken returns token for authenticated user', async () => {
        const mockIdToken = 'retrieved-mock-id-token';
        const mockFirebaseUser = {
            uid: 'test-uid3',
            displayName: 'Token User',
            email: 'token@example.com',
            getIdToken: jest.fn(() => Promise.resolve(mockIdToken))
        };

        let authContextValue;
        const TestConsumerForGetIdToken = () => {
            authContextValue = useAuth();
            return null;
        };

        render(
            <AuthProvider>
                <TestConsumerForGetIdToken />
            </AuthProvider>
        );

        act(() => {
            setMockUser(mockFirebaseUser); // Simulate login
        });

        await waitFor(() => expect(authContextValue.isAuthenticated).toBe(true));

        let retrievedToken;
        await act(async () => {
            retrievedToken = await authContextValue.getIdToken();
        });

        expect(mockFirebaseUser.getIdToken).toHaveBeenCalledTimes(1);
        expect(retrievedToken).toBe(mockIdToken);
    });

    test('getIdToken returns null for unauthenticated user', async () => {
         let authContextValue;
        const TestConsumerForGetIdToken = () => {
            authContextValue = useAuth();
            return null;
        };

        render(
            <AuthProvider>
                <TestConsumerForGetIdToken />
            </AuthProvider>
        );

        act(() => {
            setMockUser(null); // Simulate logout/initial state
        });

        await waitFor(() => expect(authContextValue.isAuthenticated).toBe(false));

        let retrievedToken;
        await act(async () => {
            retrievedToken = await authContextValue.getIdToken();
        });
        expect(retrievedToken).toBeNull();
    });
});
