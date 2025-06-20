import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext'; // Assuming AuthContext is in the same directory
import { ParentDashboardProvider, useParentDashboard } from './ParentDashboardContext';

// Mock useAuth to control its return values for tests
jest.mock('./AuthContext', () => ({
  ...jest.requireActual('./AuthContext'), // Import and retain default behavior
  useAuth: jest.fn(),
}));

// Mock global fetch
global.fetch = jest.fn();

const TestConsumerComponent = () => {
  const context = useParentDashboard();
  if (!context) return null; // Should not happen if provider is used

  return (
    <div>
      <div data-testid="isLoadingChildren">{context.isLoadingChildren.toString()}</div>
      <div data-testid="errorChildren">{context.errorChildren || 'null'}</div>
      <div data-testid="linkedChildrenLength">{context.linkedChildren.length}</div>
      <div data-testid="selectedChildId">{context.selectedChildId || 'null'}</div>
      <button onClick={() => context.selectChild(123)}>Select Child 123</button>

      <div data-testid="isLoadingDashboardData">{context.isLoadingDashboardData.toString()}</div>
      <div data-testid="errorDashboardData">{context.errorDashboardData || 'null'}</div>
      <div data-testid="dashboardDataChildId">
        {context.dashboardData ? context.dashboardData.child_id : 'null'}
      </div>
    </div>
  );
};

describe('ParentDashboardContext', () => {
  let mockGetIdToken;

  beforeEach(() => {
    jest.clearAllMocks(); // Clear mocks before each test
    mockGetIdToken = jest.fn().mockResolvedValue('test-token');
    // Default mock for useAuth
    useAuth.mockReturnValue({
      getIdToken: mockGetIdToken,
      currentUserProfile: { role: 'parent' }, // Simulate a parent user
      isParent: true,
      isLoadingAuth: false,
      isLoadingUserProfile: false,
    });
    global.fetch.mockClear(); // Clear fetch mocks specifically
  });

  test('initial state is correct', () => {
    const { getByTestId } = render(
      <AuthProvider> {/* AuthProvider might not be strictly needed if useAuth is fully mocked, but good for completeness */}
        <ParentDashboardProvider>
          <TestConsumerComponent />
        </ParentDashboardProvider>
      </AuthProvider>
    );
    expect(getByTestId('isLoadingChildren').textContent).toBe('false'); // Initially false, becomes true on fetch
    expect(getByTestId('errorChildren').textContent).toBe('null');
    expect(getByTestId('linkedChildrenLength').textContent).toBe('0');
    expect(getByTestId('selectedChildId').textContent).toBe('null');
    expect(getByTestId('isLoadingDashboardData').textContent).toBe('false');
    expect(getByTestId('errorDashboardData').textContent).toBe('null');
    expect(getByTestId('dashboardDataChildId').textContent).toBe('null');
  });

  describe('Fetching Linked Children', () => {
    test('fetches linked children successfully and sets first child as selected', async () => {
      const mockChildren = [{ id: 1, full_name: 'Child One' }, { id: 2, full_name: 'Child Two' }];
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockChildren,
      });

      let getByTestId;
      await act(async () => {
        const rendered = render(
          <ParentDashboardProvider>
            <TestConsumerComponent />
          </ParentDashboardProvider>
        );
        getByTestId = rendered.getByTestId;
      });

      // Wait for state updates after fetch
      await waitFor(() => {
        expect(getByTestId('isLoadingChildren').textContent).toBe('false');
      });

      expect(global.fetch).toHaveBeenCalledWith('/api/users/me/children', expect.any(Object));
      expect(getByTestId('linkedChildrenLength').textContent).toBe('2');
      expect(getByTestId('selectedChildId').textContent).toBe('1'); // First child selected
      expect(getByTestId('errorChildren').textContent).toBe('null');
    });

    test('handles error when fetching linked children', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ detail: 'Server Error' }),
      });

      let getByTestId;
      await act(async () => {
        const rendered = render(
          <ParentDashboardProvider>
            <TestConsumerComponent />
          </ParentDashboardProvider>
        );
        getByTestId = rendered.getByTestId;
      });

      await waitFor(() => {
         expect(getByTestId('isLoadingChildren').textContent).toBe('false');
      });
      expect(getByTestId('errorChildren').textContent).toBe('Server Error');
      expect(getByTestId('linkedChildrenLength').textContent).toBe('0');
    });

    test('does not fetch children if user is not a parent', async () => {
      useAuth.mockReturnValue({ // Override default mock for this test
        getIdToken: mockGetIdToken,
        currentUserProfile: { role: 'student' },
        isParent: false,
        isLoadingAuth: false,
        isLoadingUserProfile: false,
      });

      render(
        <ParentDashboardProvider>
          <TestConsumerComponent />
        </ParentDashboardProvider>
      );
      // Wait for any potential initial effects, though fetchLinkedChildren should bail early
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0)); // Allow microtasks to run
      });

      expect(global.fetch).not.toHaveBeenCalledWith('/api/users/me/children', expect.any(Object));
    });
  });

  describe('Fetching Dashboard Data', () => {
    test('fetches dashboard data when a child is selected', async () => {
      const mockChildren = [{ id: 101, full_name: 'Child One Zero One' }];
      const mockDashboard = { child_id: 101, child_full_name: 'Child One Zero One', total_tutoring_time_week_minutes: 120 };

      // First fetch for children
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockChildren
      });
      // Second fetch for dashboard data
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockDashboard
      });

      let getByTestId;
      await act(async () => {
        const rendered = render(
          <ParentDashboardProvider>
            <TestConsumerComponent />
          </ParentDashboardProvider>
        );
        getByTestId = rendered.getByTestId;
      });

      // Wait for children to load and selectedChildId to be set, triggering dashboard fetch
      await waitFor(() => {
        expect(getByTestId('selectedChildId').textContent).toBe('101');
      });
      await waitFor(() => {
        expect(getByTestId('isLoadingDashboardData').textContent).toBe('false');
      });

      expect(global.fetch).toHaveBeenCalledTimes(2); // Once for children, once for dashboard
      expect(global.fetch).toHaveBeenCalledWith('/api/parent/children/101/dashboard', expect.any(Object));
      expect(getByTestId('dashboardDataChildId').textContent).toBe('101');
      expect(getByTestId('errorDashboardData').textContent).toBe('null');
    });

    test('handles error when fetching dashboard data', async () => {
      const mockChildren = [{ id: 202, full_name: 'Child Two Zero Two' }];
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => mockChildren }); // Children fetch
      global.fetch.mockResolvedValueOnce({ // Dashboard fetch fails
        ok: false,
        status: 500,
        json: async () => ({ detail: 'Dashboard Error' }),
      });

      let getByTestId;
      await act(async () => {
        const rendered = render(
          <ParentDashboardProvider>
            <TestConsumerComponent />
          </ParentDashboardProvider>
        );
        getByTestId = rendered.getByTestId;
      });

      await waitFor(() => {
        expect(getByTestId('selectedChildId').textContent).toBe('202');
      });
      await waitFor(() => {
         expect(getByTestId('isLoadingDashboardData').textContent).toBe('false');
      });

      expect(getByTestId('errorDashboardData').textContent).toBe('Dashboard Error');
      expect(getByTestId('dashboardDataChildId').textContent).toBe('null');
    });
  });

  test('selectChild updates selectedChildId', async () => {
    const mockChildren = [{ id: 1, full_name: 'Child One' }, { id: 2, full_name: 'Child Two' }];
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => mockChildren }); // Children fetch
    // Mock fetch for dashboard of child 2, as selectChild will trigger it
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ child_id: 2, /* ... */}) });


    let getByTestId;
    let user;
    await act(async () => {
      const rendered = render(
        <ParentDashboardProvider>
          <TestConsumerComponent />
        </ParentDashboardProvider>
      );
      getByTestId = rendered.getByTestId;
      // user = rendered.user; // If using @testing-library/user-event
    });

    await waitFor(() => expect(getByTestId('selectedChildId').textContent).toBe('1')); // Initial selection

    // Simulate user selecting child '2' (assuming value is string from select)
    // Need to get the button or simulate the action that calls selectChild
    // The TestConsumerComponent has a button that calls selectChild(123)
    const selectButton = getByTestId('isLoadingChildren').closest('div').querySelector('button'); // Hacky way to get button

    await act(async () => {
      // Fire event on a conceptual select or directly call if testing function
      // For this TestConsumer, we have a button that calls selectChild(123)
       if (selectButton) selectButton.click();
    });
     await waitFor(() => expect(getByTestId('selectedChildId').textContent).toBe('123'));
  });

});
