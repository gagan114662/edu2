import React from 'react';
import { render, act, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import axios from 'axios';

// Mock axios
jest.mock('axios');

// A simple test component to consume the context
const TestConsumerComponent = () => {
    const { token, user, isAuthenticated, login, logout } = useAuth();
    return (
        <div>
            <div data-testid="isAuthenticated">{isAuthenticated.toString()}</div>
            <div data-testid="token">{token}</div>
            <div data-testid="user">{JSON.stringify(user)}</div>
            <button onClick={() => login('test-token', { name: 'Test User', email: 'test@example.com' })}>Login</button>
            <button onClick={logout}>Logout</button>
        </div>
    );
};

describe('AuthContext', () => {
    beforeEach(() => {
        // Clear localStorage before each test
        localStorage.clear();
        // Reset axios mocks
        axios.post.mockReset();
    });

    test('initial state with no token in localStorage', () => {
        render(
            <AuthProvider>
                <TestConsumerComponent />
            </AuthProvider>
        );
        expect(screen.getByTestId('isAuthenticated').textContent).toBe('false');
        expect(screen.getByTestId('token').textContent).toBe('');
        expect(screen.getByTestId('user').textContent).toBe('null');
    });

    test('initial state with token in localStorage', () => {
        localStorage.setItem('authToken', 'stored-token');
        localStorage.setItem('authUser', JSON.stringify({ name: 'Stored User' }));
        render(
            <AuthProvider>
                <TestConsumerComponent />
            </AuthProvider>
        );
        expect(screen.getByTestId('isAuthenticated').textContent).toBe('true');
        expect(screen.getByTestId('token').textContent).toBe('stored-token');
        expect(JSON.parse(screen.getByTestId('user').textContent)).toEqual({ name: 'Stored User' });
    });

    test('login function updates state and localStorage', () => {
        render(
            <AuthProvider>
                <TestConsumerComponent />
            </AuthProvider>
        );
        act(() => {
            screen.getByText('Login').click();
        });
        expect(screen.getByTestId('isAuthenticated').textContent).toBe('true');
        expect(screen.getByTestId('token').textContent).toBe('test-token');
        expect(JSON.parse(screen.getByTestId('user').textContent)).toEqual({ name: 'Test User', email: 'test@example.com' });
        expect(localStorage.getItem('authToken')).toBe('test-token');
        expect(JSON.parse(localStorage.getItem('authUser'))).toEqual({ name: 'Test User', email: 'test@example.com' });
    });

    test('logout function clears state, localStorage, and calls API', async () => {
        localStorage.setItem('authToken', 'test-token');
        localStorage.setItem('authUser', JSON.stringify({ name: 'Test User' }));
        axios.post.mockResolvedValue({ data: { message: 'Logout successful' } }); // Mock successful API call

        render(
            <AuthProvider>
                <TestConsumerComponent />
            </AuthProvider>
        );

        // Ensure initial state is logged in
        expect(screen.getByTestId('isAuthenticated').textContent).toBe('true');

        act(() => {
            screen.getByText('Logout').click();
        });

        // Wait for async operations in logout (API call)
        await waitFor(() => {
            expect(axios.post).toHaveBeenCalledWith(
                'http://localhost:8000/api/auth/logout',
                {},
                { headers: { 'Authorization': `Bearer test-token` } }
            );
        });

        expect(screen.getByTestId('isAuthenticated').textContent).toBe('false');
        expect(screen.getByTestId('token').textContent).toBe('');
        expect(screen.getByTestId('user').textContent).toBe('null');
        expect(localStorage.getItem('authToken')).toBeNull();
        expect(localStorage.getItem('authUser')).toBeNull();
    });

    test('logout function proceeds even if API call fails', async () => {
        localStorage.setItem('authToken', 'test-token');
        axios.post.mockRejectedValue(new Error('API call failed')); // Mock failed API call

        render(
            <AuthProvider>
                <TestConsumerComponent />
            </AuthProvider>
        );

        act(() => {
            screen.getByText('Logout').click();
        });

        await waitFor(() => {
            expect(axios.post).toHaveBeenCalledTimes(1);
        });

        expect(screen.getByTestId('isAuthenticated').textContent).toBe('false');
        expect(screen.getByTestId('token').textContent).toBe('');
        expect(localStorage.getItem('authToken')).toBeNull();
    });
});
