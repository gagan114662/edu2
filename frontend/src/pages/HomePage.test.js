import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import HomePage from './HomePage';
import { useAuth } from '../context/AuthContext';

// Mock AuthContext
jest.mock('../context/AuthContext');

// Mock react-router-dom's useNavigate
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useNavigate: () => mockNavigate,
}));

const LoginPage = () => <div data-testid="login-page">Login Page</div>;

describe('HomePage', () => {
    beforeEach(() => {
        useAuth.mockReset();
        mockNavigate.mockClear();
    });

    const renderHomePage = (authValue) => {
        useAuth.mockReturnValue(authValue);
        render(
            <MemoryRouter initialEntries={['/']}>
                <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/login" element={<LoginPage />} />
                </Routes>
            </MemoryRouter>
        );
    };

    test('displays welcome message and user info if authenticated', () => {
        const mockUser = { name: 'Test User', email: 'test@example.com', picture_url: 'http://example.com/pic.jpg' };
        renderHomePage({ isAuthenticated: true, user: mockUser, logout: jest.fn() });

        expect(screen.getByText(/welcome to ai tutor!/i)).toBeInTheDocument();
        expect(screen.getByText(`Hello, ${mockUser.name}!`)).toBeInTheDocument();
        expect(screen.getByRole('img', { name: mockUser.name })).toHaveAttribute('src', mockUser.picture_url);
        expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
    });

    test('displays fallback user info if parts of user object are missing', () => {
        const mockUser = { email: 'test@example.com' }; // Name and picture_url missing
        renderHomePage({ isAuthenticated: true, user: mockUser, logout: jest.fn() });

        expect(screen.getByText(`Hello, ${mockUser.email}!`)).toBeInTheDocument();
        expect(screen.queryByRole('img')).not.toBeInTheDocument(); // No picture
    });

    test('displays "User" if no name or email, but authenticated', () => {
        const mockUser = {}; // Empty user object
        renderHomePage({ isAuthenticated: true, user: mockUser, logout: jest.fn() });
        expect(screen.getByText(/Hello, User!/i)).toBeInTheDocument();
    });


    test('calls logout and navigates to login on logout button click', () => {
        const mockLogout = jest.fn();
        renderHomePage({ isAuthenticated: true, user: { name: 'Test User' }, logout: mockLogout });

        const logoutButton = screen.getByRole('button', { name: /logout/i });
        act(() => {
            fireEvent.click(logoutButton);
        });

        expect(mockLogout).toHaveBeenCalledTimes(1);
        expect(mockNavigate).toHaveBeenCalledWith('/login');
    });

    test('redirects to login if not authenticated (defensive check)', () => {
        // This tests the defensive navigation inside HomePage itself,
        // although ProtectedRoute should typically prevent this scenario.
        renderHomePage({ isAuthenticated: false, user: null, logout: jest.fn() });

        // Check that we've been navigated to the login page
        expect(screen.getByTestId('login-page')).toBeInTheDocument();
        expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
});
