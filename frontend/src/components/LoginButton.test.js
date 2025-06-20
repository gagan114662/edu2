import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import LoginButton from './LoginButton';

describe('LoginButton', () => {
    const originalLocation = window.location;

    beforeAll(() => {
        // Mock window.location.href
        delete window.location;
        window.location = { href: '' };
    });

    afterAll(() => {
        // Restore original window.location
        window.location = originalLocation;
    });

    beforeEach(() => {
        // Reset href for each test
        window.location.href = '';
    });

    test('renders the button', () => {
        render(<LoginButton />);
        expect(screen.getByRole('button', { name: /login with google/i })).toBeInTheDocument();
    });

    test('redirects to Google login URL on click', () => {
        render(<LoginButton />);
        const button = screen.getByRole('button', { name: /login with google/i });

        fireEvent.click(button);

        expect(window.location.href).toBe('http://localhost:8000/auth/google/login');
    });
});
