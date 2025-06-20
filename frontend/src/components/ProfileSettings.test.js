import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import ProfileSettings from './ProfileSettings';
import { AuthContext } from '../context/AuthContext';

// Mock the AuthContext value
const mockUpdateUserProfile = jest.fn();
const mockUser = {
  email: 'test@example.com',
  name: 'Test User',
  selected_grade_level: 'Grade 5',
  curriculum_framework: 'Common Core',
};

// Default AuthContext value, can be overridden by providerProps in renderWithAuthProvider
const defaultAuthContextValue = {
  user: mockUser,
  updateUserProfile: mockUpdateUserProfile,
  loading: false, // Auth loading state
  // Add any other properties from useAuth() that ProfileSettings might consume
  token: 'test-token',
  isAuthenticated: true,
  login: jest.fn(),
  logout: jest.fn(),
  fetchUserProfile: jest.fn(),
};

const renderWithAuthProvider = (ui, { providerProps, ...renderOptions }) => {
  return render(
    <AuthContext.Provider value={{ ...defaultAuthContextValue, ...providerProps }}>
      {ui}
    </AuthContext.Provider>,
    renderOptions
  );
};

describe('ProfileSettings Component', () => {
  beforeEach(() => {
    mockUpdateUserProfile.mockClear();
    // Reset user object if it's mutable and modified by tests, or provide fresh mock each time
    defaultAuthContextValue.user = { ...mockUser };
  });

  test('renders with initial user profile data and allows updates', async () => {
    // Mock a successful update that returns the new user profile
    const updatedUser = {
        ...mockUser,
        selected_grade_level: 'Grade 6',
        curriculum_framework: 'StateX Syllabus'
    };
    mockUpdateUserProfile.mockResolvedValueOnce(updatedUser);

    renderWithAuthProvider(<ProfileSettings />);

    // Check if initial values from mockUser are populated
    expect(screen.getByLabelText(/Preferred Grade Level/i)).toHaveValue('Grade 5');
    expect(screen.getByLabelText(/Curriculum Framework/i)).toHaveValue('Common Core');

    // Change values
    fireEvent.change(screen.getByLabelText(/Preferred Grade Level/i), { target: { value: 'Grade 6' } });
    fireEvent.change(screen.getByLabelText(/Curriculum Framework/i), { target: { value: 'StateX Syllabus' } });

    expect(screen.getByLabelText(/Preferred Grade Level/i)).toHaveValue('Grade 6');
    expect(screen.getByLabelText(/Curriculum Framework/i)).toHaveValue('StateX Syllabus');

    // Click save
    fireEvent.click(screen.getByRole('button', { name: /Save Profile Settings/i }));

    // Check if updateUserProfile was called with correct data
    await waitFor(() => {
      expect(mockUpdateUserProfile).toHaveBeenCalledWith({
        selected_grade_level: 'Grade 6',
        curriculum_framework: 'StateX Syllabus',
      });
    });

    // Check for success message
    expect(await screen.findByText(/Profile updated successfully!/i)).toBeInTheDocument();
  });

  test('displays an error message if profile update fails', async () => {
    const errorMessage = 'Failed to update profile due to server error';
    mockUpdateUserProfile.mockRejectedValueOnce(new Error(errorMessage));

    renderWithAuthProvider(<ProfileSettings />);

    fireEvent.change(screen.getByLabelText(/Preferred Grade Level/i), { target: { value: 'Grade 7' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Profile Settings/i }));

    await waitFor(() => {
      expect(mockUpdateUserProfile).toHaveBeenCalled();
    });

    expect(await screen.findByText(errorMessage)).toBeInTheDocument();
    // Check that the success message is not present
    expect(screen.queryByText(/Profile updated successfully!/i)).not.toBeInTheDocument();
  });

  test('shows loading message when auth context is loading', () => {
    renderWithAuthProvider(<ProfileSettings />, { providerProps: { loading: true } });
    expect(screen.getByText(/Loading profile settings.../i)).toBeInTheDocument();
  });

  test('shows login message when no user is present and auth is not loading', () => {
    renderWithAuthProvider(<ProfileSettings />, { providerProps: { user: null, loading: false } });
    expect(screen.getByText(/Please log in to manage curriculum settings./i)).toBeInTheDocument();
  });

  test('Save button is disabled during submission and re-enabled after', async () => {
    mockUpdateUserProfile.mockImplementationOnce(() =>
      new Promise(resolve => setTimeout(() => resolve({ ...mockUser }), 100)) // Simulate network delay
    );

    renderWithAuthProvider(<ProfileSettings />);

    const saveButton = screen.getByRole('button', { name: /Save Profile Settings/i });
    expect(saveButton).not.toBeDisabled(); // Initially enabled

    fireEvent.click(saveButton);

    expect(saveButton).toBeDisabled();
    expect(saveButton).toHaveTextContent(/Saving.../i);

    await waitFor(() => {
      expect(saveButton).not.toBeDisabled(); // Re-enabled after promise resolves
      expect(saveButton).toHaveTextContent(/Save Profile Settings/i);
    });
    expect(await screen.findByText(/Profile updated successfully!/i)).toBeInTheDocument();
  });

  test('form fields are updated when user prop changes externally', () => {
    const { rerender } = renderWithAuthProvider(<ProfileSettings />, {
        providerProps: { user: mockUser }
    });

    expect(screen.getByLabelText(/Preferred Grade Level/i)).toHaveValue('Grade 5');
    expect(screen.getByLabelText(/Curriculum Framework/i)).toHaveValue('Common Core');

    const updatedExternalUser = {
        ...mockUser,
        selected_grade_level: 'Grade 10',
        curriculum_framework: 'IB',
    };

    // Simulate user prop update by re-rendering with new context value
    rerender(
        <AuthContext.Provider value={{ ...defaultAuthContextValue, user: updatedExternalUser }}>
            <ProfileSettings />
        </AuthContext.Provider>
    );

    expect(screen.getByLabelText(/Preferred Grade Level/i)).toHaveValue('Grade 10');
    expect(screen.getByLabelText(/Curriculum Framework/i)).toHaveValue('IB');
  });

});
