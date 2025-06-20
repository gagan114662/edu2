import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ParentDashboardProvider, useParentDashboard } from '../context/ParentDashboardContext'; // Adjust path
import ParentDashboardPage from './ParentDashboardPage';

// Mock the context hook
jest.mock('../context/ParentDashboardContext', () => ({
  ...jest.requireActual('../context/ParentDashboardContext'), // Import and retain default behavior for Provider if needed by wrapper
  useParentDashboard: jest.fn(),
}));

// Mock the PerformanceChart component as it's lazy-loaded and complex
jest.mock('../components/PerformanceChart', () => () => <div data-testid="performance-chart-mock">Performance Chart Mock</div>);


describe('ParentDashboardPage', () => {
  const mockSelectChild = jest.fn();

  const initialMockContextValue = {
    linkedChildren: [],
    selectedChildId: null,
    selectChild: mockSelectChild,
    isLoadingChildren: false,
    errorChildren: null,
    dashboardData: null,
    isLoadingDashboardData: false,
    errorDashboardData: null,
  };

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    useParentDashboard.mockReturnValue(initialMockContextValue); // Default mock
  });

  test('renders loading state for children', () => {
    useParentDashboard.mockReturnValue({ ...initialMockContextValue, isLoadingChildren: true });
    render(<ParentDashboardPage />);
    expect(screen.getByText(/Loading linked children.../i)).toBeInTheDocument();
  });

  test('renders error state for children', () => {
    useParentDashboard.mockReturnValue({ ...initialMockContextValue, errorChildren: 'Failed to fetch children' });
    render(<ParentDashboardPage />);
    expect(screen.getByText(/Error loading children: Failed to fetch children/i)).toBeInTheDocument();
  });

  test('renders "no children linked" message', () => {
    useParentDashboard.mockReturnValue({ ...initialMockContextValue, linkedChildren: [] });
    render(<ParentDashboardPage />);
    expect(screen.getByText(/No children linked to your account/i)).toBeInTheDocument();
  });

  describe('With Linked Children', () => {
    const mockChildren = [
      { id: 1, full_name: 'Child Alpha' },
      { id: 2, full_name: 'Child Beta' },
    ];

    test('renders child selection dropdown when children are loaded', () => {
      useParentDashboard.mockReturnValue({ ...initialMockContextValue, linkedChildren: mockChildren, selectedChildId: 1 });
      render(<ParentDashboardPage />);
      expect(screen.getByLabelText(/Select Child:/i)).toBeInTheDocument();
      expect(screen.getByDisplayValue('Child Alpha')).toBeInTheDocument(); // Checks selected option
      expect(screen.getAllByRole('option').length).toBe(2);
    });

    test('calls selectChild when dropdown selection changes', () => {
      useParentDashboard.mockReturnValue({ ...initialMockContextValue, linkedChildren: mockChildren, selectedChildId: 1 });
      render(<ParentDashboardPage />);
      const dropdown = screen.getByLabelText(/Select Child:/i);
      fireEvent.change(dropdown, { target: { value: '2' } });
      expect(mockSelectChild).toHaveBeenCalledWith('2');
    });

    test('renders loading state for dashboard data', () => {
      useParentDashboard.mockReturnValue({
        ...initialMockContextValue,
        linkedChildren: mockChildren,
        selectedChildId: 1,
        isLoadingDashboardData: true
      });
      render(<ParentDashboardPage />);
      expect(screen.getByText(/Loading child's dashboard.../i)).toBeInTheDocument();
    });

    test('renders error state for dashboard data', () => {
      useParentDashboard.mockReturnValue({
        ...initialMockContextValue,
        linkedChildren: mockChildren,
        selectedChildId: 1,
        errorDashboardData: 'Failed to load dashboard'
      });
      render(<ParentDashboardPage />);
      expect(screen.getByText(/Failed to load dashboard data: Failed to load dashboard/i)).toBeInTheDocument();
    });

    test('renders "no dashboard data available" message', () => {
        useParentDashboard.mockReturnValue({
          ...initialMockContextValue,
          linkedChildren: mockChildren,
          selectedChildId: 1,
          dashboardData: null
        });
        render(<ParentDashboardPage />);
        // This message appears if a child is selected but their dashboard data is null (and not loading/error)
        expect(screen.getByText(/No dashboard data available for this child./i)).toBeInTheDocument();
      });

    describe('With Dashboard Data Loaded', () => {
      const mockDashboardFullData = {
        child_id: 1,
        child_full_name: 'Child Alpha',
        total_tutoring_time_week_minutes: 120,
        total_tutoring_time_month_minutes: 480,
        sessions_completed_week: 5,
        sessions_completed_month: 20,
        overall_curriculum_progress: 75.5,
        strengths: ["Algebra", "Geometry"],
        weaknesses: ["Trigonometry"],
        progress_by_topic: [
          { topic_name: "Algebra", progress_percentage: 90.0, skill_rating: "Excellent" },
        ],
        recent_activity_log: [
          { timestamp: new Date().toISOString(), description: "Completed Algebra session", duration_minutes: 30, accuracy_percentage: 95.0 },
        ],
        performance_trends: [
          { date: "2024-01-01", value: 5.0 },
        ],
        alerts: [] // Initialize with empty alerts for most data tests
      };

      const mockDashboardWithAlerts = {
        ...mockDashboardFullData,
        alerts: [
            "Child has not had a session in over 5 days.",
            "Great job! Progress made in Algebra."
        ]
      };

      beforeEach(() => {
        useParentDashboard.mockReturnValue({
          ...initialMockContextValue,
          linkedChildren: mockChildren,
          selectedChildId: 1,
          dashboardData: mockDashboardFullData
        });
      });

      test('renders dashboard data correctly', () => {
        render(<ParentDashboardPage />);
        expect(screen.getByText(/Dashboard for Child Alpha \(ID: 1\)/i)).toBeInTheDocument();
        // Engagement
        expect(screen.getByText(/Total tutoring time this week: 120 minutes/i)).toBeInTheDocument();
        expect(screen.getByText(/Sessions completed this month: 20/i)).toBeInTheDocument();
        // Progress
        expect(screen.getByText(/Curriculum completed: 75.5%/i)).toBeInTheDocument();
        // Strengths
        expect(screen.getByText('Algebra')).toBeInTheDocument();
        expect(screen.getByText('Geometry')).toBeInTheDocument();
        // Weaknesses
        expect(screen.getByText('Trigonometry')).toBeInTheDocument();
        // Topic Progress
        expect(screen.getByText(/Algebra: 90% \(Excellent\)/i)).toBeInTheDocument();
        // Recent Activity
        expect(screen.getByText(/Completed Algebra session/i)).toBeInTheDocument();
        // Performance Chart (mocked)
        expect(screen.getByTestId('performance-chart-mock')).toBeInTheDocument();
        // Alerts section should not be visible if alerts array is empty
        expect(screen.queryByText('Important Alerts')).not.toBeInTheDocument();
      });

      test('renders alerts when present in dashboardData', () => {
        useParentDashboard.mockReturnValue({
            ...initialMockContextValue,
            linkedChildren: mockChildren,
            selectedChildId: 1,
            dashboardData: mockDashboardWithAlerts // Use data with alerts
          });
        render(<ParentDashboardPage />);
        expect(screen.getByText('Important Alerts')).toBeInTheDocument();
        expect(screen.getByText(mockDashboardWithAlerts.alerts[0])).toBeInTheDocument();
        expect(screen.getByText(mockDashboardWithAlerts.alerts[1])).toBeInTheDocument();
      });

      test('renders "None identified yet" for empty strengths/weaknesses', () => {
        const dataNoStrengthsWeaknesses = { ...mockDashboardFullData, strengths: [], weaknesses: [] };
        useParentDashboard.mockReturnValue({
            ...initialMockContextValue,
            linkedChildren: mockChildren,
            selectedChildId: 1,
            dashboardData: dataNoStrengthsWeaknesses
          });
        render(<ParentDashboardPage />);
        expect(screen.getAllByText(/None identified yet./i).length).toBe(2);
      });

      test('does not render performance chart if trend data is empty', () => {
        const dataNoTrends = { ...mockDashboardFullData, performance_trends: [] };
        useParentDashboard.mockReturnValue({
            ...initialMockContextValue,
            linkedChildren: mockChildren,
            selectedChildId: 1,
            dashboardData: dataNoTrends
          });
        render(<ParentDashboardPage />);
        // The PerformanceChart mock itself renders "No performance trend data available..."
        // but the page conditionally renders the chart component.
        // If the component itself handles empty data by rendering nothing or a message,
        // we'd check for that message or absence.
        // Here, our mock renders a div. The page wraps it in a section.
        // If performance_trends is empty, the section "Performance Trends" might still render,
        // but the chart component within it should show its "no data" message.
        // The current PerformanceChart mock doesn't have this logic, it just renders.
        // Let's assume the page itself would hide the chart or section if data is empty.
        // The current ParentDashboardPage.js *does* conditionally render the section:
        // {dashboardData.performance_trends && dashboardData.performance_trends.length > 0 && (...)}
        expect(screen.queryByTestId('performance-chart-mock')).not.toBeInTheDocument();
        expect(screen.queryByText('Performance Trends')).not.toBeInTheDocument(); // Assuming h3 is not rendered
      });
    });
  });
});
