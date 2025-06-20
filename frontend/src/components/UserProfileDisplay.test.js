import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UserProfileDisplay from './UserProfileDisplay';

describe('UserProfileDisplay', () => {
  const mockUser = {
    displayName: 'Test User',
    email: 'test@example.com',
    photoURL: 'http://example.com/avatar.jpg',
  };
  const mockOnLogout = jest.fn();

  test('renders loading state', () => {
    render(<UserProfileDisplay user={null} onLogout={mockOnLogout} isLoadingAuth={true} />);
    expect(screen.getByText(/Loading user.../i)).toBeInTheDocument();
  });

  test('renders no user data available state', () => {
    render(<UserProfileDisplay user={null} onLogout={mockOnLogout} isLoadingAuth={false} />);
    expect(screen.getByText(/No user data available./i)).toBeInTheDocument();
  });

  test('renders user information correctly', () => {
    render(<UserProfileDisplay user={mockUser} onLogout={mockOnLogout} isLoadingAuth={false} />);

    expect(screen.getByAltText(/Test User Avatar/i)).toHaveAttribute('src', mockUser.photoURL);
    expect(screen.getByText(`Hello, ${mockUser.displayName}!`)).toBeInTheDocument();
    expect(screen.getByText(mockUser.email)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
  });

  test('renders fallback if parts of user info are missing', () => {
    const partialUser = { email: 'test@example.com' }; // No displayName, no photoURL
    render(<UserProfileDisplay user={partialUser} onLogout={mockOnLogout} isLoadingAuth={false} />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText(/Hello, User!/i)).toBeInTheDocument(); // Fallback to "User"
    expect(screen.getByText(partialUser.email)).toBeInTheDocument();
  });

  test('does not render email if not provided', () => {
    const userWithoutEmail = { displayName: 'No Email User', photoURL: 'http://example.com/avatar.jpg' };
    render(<UserProfileDisplay user={userWithoutEmail} onLogout={mockOnLogout} isLoadingAuth={false} />);
    expect(screen.queryByText(/Email:/i)).not.toBeInTheDocument(); // Assuming email is only shown if present
  });

  test('calls onLogout when logout button is clicked', () => {
    render(<UserProfileDisplay user={mockUser} onLogout={mockOnLogout} isLoadingAuth={false} />);
    const logoutButton = screen.getByRole('button', { name: /logout/i });
    fireEvent.click(logoutButton);
    expect(mockOnLogout).toHaveBeenCalledTimes(1);
  });
});
