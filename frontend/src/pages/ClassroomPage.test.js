import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'; // Added fireEvent, within
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios'; // Will be mocked
import { AuthContext } from '../context/AuthContext'; // To provide mock context
import ClassroomPage from './ClassroomPage';

// Mock axios module
jest.mock('axios');

// Default mock for AuthContext value
const mockAuthContextValue = {
  token: 'test-token',
  isAuthenticated: true,
  user: { name: 'Test User' }, // Add any other user fields ClassroomPage might access
  loading: false, // Auth loading state, assuming auth is resolved for these tests
  // Include any functions ClassroomPage might call from useAuth
  logout: jest.fn(),
  // Add other functions from useAuth if ClassroomPage uses them directly
  updateUserProfile: jest.fn(),
  fetchUserProfile: jest.fn(),
};

// Helper to render with AuthContext provider
const renderWithContext = (ui, providerProps) => {
  return render(
    <AuthContext.Provider value={{ ...mockAuthContextValue, ...providerProps }}>
      <MemoryRouter> {/* ClassroomPage might use Link or other router features */}
        {ui}
      </MemoryRouter>
    </AuthContext.Provider>
  );
};

// Adjusted describe block name to be more encompassing
describe('ClassroomPage - Rendering and Data States', () => {
  beforeEach(() => {
    axios.get.mockReset();
    // Ensure all functions from context that might be called are reset if necessary
    // For example, if ClassroomPage called logout on auth error:
    // mockAuthContextValue.logout.mockClear();
  });

  // Test 1
  test('Test 1: shows loading message for courses initially when authenticated and auth loaded', () => {
    axios.get.mockImplementation(() => new Promise(() => {}));
    // Explicitly pass context for this state: auth loaded, user authenticated
    renderWithContext(<ClassroomPage />, { providerProps: { loading: false, isAuthenticated: true, token: 'test-token' } });
    expect(screen.getByText(/Loading Google Classroom courses.../i)).toBeInTheDocument();
    expect(screen.queryByText(/Error:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No courses found/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Authenticating/i)).not.toBeInTheDocument();
  });

  // Test 2
  test('Test 2: fetches and displays courses successfully', async () => {
    const sampleCourses = [
      { id: '1', name: 'Math 101', descriptionHeading: 'Full Year Course', courseState: 'ACTIVE', alternateLink: '#' },
      { id: '2', name: 'History Buffs', descriptionHeading: 'History alevel', courseState: 'ACTIVE', alternateLink: '#' },
    ];
    // Ensure the mock targets the specific URL for courses
    axios.get.mockImplementation(url => {
        if (url === 'http://localhost:8000/api/classroom/courses') {
            return Promise.resolve({ data: sampleCourses });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });


    renderWithContext(<ClassroomPage />, { providerProps: { loading: false, isAuthenticated: true, token: 'test-token' } });

    await waitFor(() => expect(screen.queryByText(/Loading Google Classroom courses.../i)).not.toBeInTheDocument());
    expect(screen.getByText('Math 101')).toBeInTheDocument();
    expect(screen.getByText('History Buffs')).toBeInTheDocument();
    expect(screen.getByText('Full Year Course')).toBeInTheDocument();
    expect(screen.queryByText(/Error:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No courses found/i)).not.toBeInTheDocument();
  });

  // Test 3
  test('Test 3: displays an error message if fetching courses fails', async () => {
    const errorMessageDetail = "Backend detail error for courses";
    const mockError = {
        isAxiosError: true,
        message: "Network Error: Failed to fetch courses",
        response: { data: { detail: errorMessageDetail } }
    };

    axios.get.mockImplementation(url => {
        if (url === 'http://localhost:8000/api/classroom/courses') {
            return Promise.reject(mockError);
        }
        return Promise.reject(new Error(`Unknown endpoint: ${url}`));
    });

    renderWithContext(<ClassroomPage />, { providerProps: { loading: false, isAuthenticated: true, token: 'test-token' } });

    await waitFor(() => expect(screen.queryByText(/Loading Google Classroom courses.../i)).not.toBeInTheDocument());
    expect(await screen.findByText(`Error: ${errorMessageDetail}`)).toBeInTheDocument();
    expect(screen.queryByText('Math 101')).not.toBeInTheDocument();
    expect(screen.queryByText(/No courses found. Ensure you are enrolled/i)).not.toBeInTheDocument();
  });

  // Test 4: Initial Render - Authenticating State
  test('Test 4: shows "Authenticating..." message when auth context is loading', () => {
    // Override context to simulate auth loading
    renderWithContext(<ClassroomPage />, { providerProps: { loading: true } });

    expect(screen.getByText(/Authenticating and loading user data.../i)).toBeInTheDocument(); // Adjusted text to match component

    // Ensure other states are not shown
    expect(screen.queryByText(/Loading Google Classroom courses.../i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Please log in/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Error:/i)).not.toBeInTheDocument();
    expect(axios.get).not.toHaveBeenCalled(); // API call for courses should not be made yet
  });

  // Test 5: Initial Render - Not Authenticated State
  test('Test 5: shows "Please log in" message when not authenticated and auth not loading', () => {
    // Override context for not authenticated and auth loading complete
    renderWithContext(<ClassroomPage />, {
      providerProps: {
        isAuthenticated: false,
        loading: false,
        token: null,
        user: null
      }
    });

    // The ClassroomPage component itself has a check for isAuthenticated after authLoading is false.
    expect(screen.getByText(/Please log in to view Google Classroom data./i)).toBeInTheDocument();

    // Ensure other states are not shown
    expect(screen.queryByText(/Authenticating and loading user data.../i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Loading Google Classroom courses.../i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Error:/i)).not.toBeInTheDocument();
    expect(axios.get).not.toHaveBeenCalled(); // API call for courses should not be made
  });
});

describe('ClassroomPage - Interactions and Assignment Loading', () => {
  beforeEach(() => {
    axios.get.mockReset();
     // Reset AuthContext mock values that might be changed by tests, if any specific to interactions
    mockAuthContextValue.user = { name: 'Test User' }; // Reset user to a default for these tests
    mockAuthContextValue.loading = false;
    mockAuthContextValue.isAuthenticated = true;
    mockAuthContextValue.token = 'test-token';
  });

  const sampleCourses = [
    { id: 'course123', name: 'Math Advanced', descriptionHeading: 'Full Year', courseState: 'ACTIVE', alternateLink: '#' },
    { id: 'course456', name: 'History Intro', descriptionHeading: 'Semester 1', courseState: 'ACTIVE', alternateLink: '#' },
  ];

  test('Test 6: shows loading message for assignments when a course is selected', async () => {
    // Mock GET for courses - resolves successfully
    axios.get.mockImplementation(url => {
      if (url === 'http://localhost:8000/api/classroom/courses') {
        return Promise.resolve({ data: sampleCourses });
      }
      // Mock GET for assignments for course123 - never resolves for this test
      if (url === 'http://localhost:8000/api/classroom/courses/course123/assignments') {
        return new Promise(() => {}); // Pending promise to keep it in loading state
      }
      return Promise.reject(new Error(`Unhandled GET request to ${url}`));
    });

    renderWithContext(<ClassroomPage />);

    // Wait for courses to load and be displayed
    const courseElement = await screen.findByText('Math Advanced'); // Course name to click
    expect(courseElement).toBeInTheDocument();

    // Simulate clicking the first course to select it.
    // The clickable area is the div containing the course name and toggle icon.
    fireEvent.click(courseElement.closest('.flex.justify-between.items-center'));

    // After clicking, the assignments section for 'course123' should appear and show loading.
    await waitFor(() => {
        // The text "Loading assignments..." is expected inside the expanded course section.
        // This text is specific to assignment loading state.
        expect(screen.getByText(/Loading assignments.../i)).toBeInTheDocument();
    });

    // Ensure no actual assignments are displayed yet
    expect(screen.queryByText(/Homework Title Example/i)).not.toBeInTheDocument();
    // Ensure that the main course error state is not triggered for this specific interaction.
    // The assignment-specific error state (`assignmentError`) is what we'd check if assignments failed.
    // Here, it's just loading, so no error yet.
    expect(screen.queryByText(/Error loading assignments/i)).not.toBeInTheDocument();
  });

  // Test 7: Displaying Assignments Successfully
  test('Test 7: fetches and displays assignments successfully for a selected course', async () => {
    const sampleAssignments = [
      { id: 'assign1', title: 'Algebra Homework 1', description: 'Chapter 1 problems', dueDate: '2023-10-15', maxPoints: 100, workType: 'ASSIGNMENT', alternateLink: '#' },
      { id: 'assign2', title: 'Geometry Quiz A', description: 'Circles and Triangles', dueDate: '2023-10-20', maxPoints: 20, workType: 'QUIZ', alternateLink: '#' },
    ];

    axios.get.mockImplementation(url => {
      if (url === 'http://localhost:8000/api/classroom/courses') {
        return Promise.resolve({ data: sampleCourses }); // Use sampleCourses from outer scope
      }
      if (url === 'http://localhost:8000/api/classroom/courses/course123/assignments') {
        return Promise.resolve({ data: sampleAssignments });
      }
      return Promise.reject(new Error(`Unhandled GET request to ${url} in Test 7`));
    });

    renderWithContext(<ClassroomPage />, { providerProps: { loading: false, isAuthenticated: true, token: 'test-token' }});

    // Wait for courses to load and click the first course
    const courseElement = await screen.findByText('Math Advanced');
    // Click the clickable area which is the parent div of courseElement with specific classes
    fireEvent.click(courseElement.closest('.flex.justify-between.items-center'));

    // Wait for "Loading assignments..." to appear and then disappear
    await screen.findByText(/Loading assignments.../i); // Ensure loading state is briefly there
    await waitFor(() => {
      expect(screen.queryByText(/Loading assignments.../i)).not.toBeInTheDocument();
    });

    // Check if assignment titles are displayed
    expect(screen.getByText('Algebra Homework 1')).toBeInTheDocument();
    expect(screen.getByText('Geometry Quiz A')).toBeInTheDocument();

    // Optionally check for other details like description or due date
    expect(screen.getByText(/Chapter 1 problems/i)).toBeInTheDocument(); // Description is truncated in component
    expect(screen.getByText(/Due: 2023-10-15/i)).toBeInTheDocument();
    expect(screen.getByText(/Points: 100/i)).toBeInTheDocument();
    expect(screen.getByText(/Type: ASSIGNMENT/i)).toBeInTheDocument();


    // Ensure no assignment-specific error message is shown
    expect(screen.queryByText(/Error loading assignments/i)).not.toBeInTheDocument();
    // Ensure the general course error is also not shown
    expect(screen.queryByText(/Error fetching courses/i)).not.toBeInTheDocument();
  });

  // Test 8: Handling Assignment Fetch Error
  test('Test 8: displays an error message if fetching assignments fails for a selected course', async () => {
    const assignmentErrorMessage = "Specific assignment fetch error";
    axios.get.mockImplementation(url => {
      if (url === 'http://localhost:8000/api/classroom/courses') {
        return Promise.resolve({ data: sampleCourses }); // Courses load fine
      }
      if (url === 'http://localhost:8000/api/classroom/courses/course123/assignments') {
        return Promise.reject({ // Assignments fetch fails
            isAxiosError: true,
            message: "Network problem for assignments",
            response: { data: { detail: assignmentErrorMessage } }
        });
      }
      return Promise.reject(new Error(`Unhandled GET request to ${url} in Test 8`));
    });

    renderWithContext(<ClassroomPage />, { providerProps: { loading: false, isAuthenticated: true, token: 'test-token' }});

    const courseElement = await screen.findByText('Math Advanced');
    // Click the course to trigger assignment loading
    fireEvent.click(courseElement.closest('.flex.justify-between.items-center'));

    // Wait for "Loading assignments..." to potentially appear and then for the error to be processed.
    // The error message for assignments is set in `assignmentError` state.
    // The component displays: <p className="text-red-500 bg-red-100 p-3 rounded-md">{assignmentError}</p>
    await waitFor(async () => {
      // Loading message for assignments should disappear
      expect(screen.queryByText(/Loading assignments.../i)).not.toBeInTheDocument();
      // The specific error message for assignments should be visible
      expect(await screen.findByText(assignmentErrorMessage)).toBeInTheDocument();
    });

    // Ensure no assignment data is displayed
    expect(screen.queryByText('Algebra Homework 1')).not.toBeInTheDocument();
    // Ensure the main course error state is not displayed for this specific assignment error
    expect(screen.queryByText(/Error fetching courses/i)).not.toBeInTheDocument();
  });

  // Test 9: Toggling Course Selection (Deselecting)
  test('Test 9: clicking a selected course again hides its assignments', async () => {
    axios.get.mockImplementation(url => {
      if (url === 'http://localhost:8000/api/classroom/courses') {
        return Promise.resolve({ data: sampleCourses });
      }
      if (url === 'http://localhost:8000/api/classroom/courses/course123/assignments') {
        return Promise.resolve({ data: sampleAssignments }); // Defined sampleAssignments for this test
      }
      return Promise.reject(new Error(`Unhandled GET request to ${url} in Test 9`));
    });

    const sampleAssignments = [ // Define sampleAssignments used in this test's mock
        { id: 'assign1', title: 'Algebra Homework 1', description: 'Chapter 1 problems', dueDate: '2023-10-15', maxPoints: 100, workType: "ASSIGNMENT" },
    ];

    renderWithContext(<ClassroomPage />, { providerProps: { loading: false, isAuthenticated: true, token: 'test-token' }});

    // Find and click the first course to show assignments
    const courseTitleElement = await screen.findByText('Math Advanced');
    const courseClickableArea = courseTitleElement.closest('.flex.justify-between.items-center');
    fireEvent.click(courseClickableArea);

    // Wait for assignments to be displayed
    expect(await screen.findByText('Algebra Homework 1')).toBeInTheDocument();
    // Check that the toggle indicator shows it's open (e.g., '▼')
    // Assuming the toggle indicator is within the clickable area and changes based on selection
    expect(within(courseClickableArea).getByText('▼')).toBeInTheDocument();


    // Click the same course again to hide assignments
    fireEvent.click(courseClickableArea);

    // Wait for assignments to be hidden
    await waitFor(() => {
      expect(screen.queryByText('Algebra Homework 1')).not.toBeInTheDocument();
      // Check for a more specific element that would only exist if assignments are shown, e.g., the assignments list container or heading
      expect(screen.queryByText('Assignments')).not.toBeInTheDocument();
    });

    // Check that the toggle indicator shows it's closed (e.g., '▶')
    expect(within(courseClickableArea).getByText('▶')).toBeInTheDocument();
    // Ensure the other course is still there
    expect(screen.getByText('History Intro')).toBeInTheDocument();
  });
});
