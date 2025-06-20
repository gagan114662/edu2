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

import { useAuth } from '../context/AuthContext'; // Import useAuth

// Mock the PerformanceChart component as it's lazy-loaded and complex
jest.mock('../components/PerformanceChart', () => () => <div data-testid="performance-chart-mock">Performance Chart Mock</div>);

// Mock useAuth for the whole test file, as ParentDashboardPage now uses it for getIdToken
jest.mock('../context/AuthContext', () => ({
  ...jest.requireActual('../context/AuthContext'),
  useAuth: jest.fn(),
}));


describe('ParentDashboardPage', () => {
  const mockSelectChild = jest.fn();
  let mockGetIdToken;

  const initialMockContextValue = {
    linkedChildren: [],
    selectedChildId: null,
    selectChild: mockSelectChild,
    isLoadingChildren: false,
    errorChildren: null,
    dashboardData: null,
    isLoadingDashboardData: false,
    errorDashboardData: null,
    // subjects_practiced should be part of dashboardData, not initial context directly
  };

  const baseMockDashboardData = { // For scenarios where dashboardData exists but specific parts are tested
    child_id: 1,
    child_full_name: 'Child Test',
    total_tutoring_time_week_minutes: 0,
    total_tutoring_time_month_minutes: 0,
    sessions_completed_week: 0,
    sessions_completed_month: 0,
    overall_curriculum_progress: 0,
    strengths: [],
    weaknesses: [],
    progress_by_topic: [],
    recent_activity_log: [],
    performance_trends: [],
    alerts: [],
    subjects_practiced: [], // Default empty
    specific_mastery_stats: [], // Default empty
    llm_summary: null, // Default to null
  };


  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    mockGetIdToken = jest.fn().mockResolvedValue('test-pdf-token');
    useAuth.mockReturnValue({ // Provide default mock for useAuth
      getIdToken: mockGetIdToken,
      // Add other properties from useAuth if ParentDashboardPage uses them directly
      // For now, only getIdToken is directly used by handleDownloadPdf
    });
    // Update initialMockContextValue to ensure dashboardData is at least null or a base structure
    useParentDashboard.mockReturnValue({ ...initialMockContextValue, dashboardData: null });
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
        alerts: [],
        subjects_practiced: ["Algebra", "Geometry", "Reading Comprehension"], // Added subjects
        specific_mastery_stats: [{"label": "Grade 5 Math Progress", "completed_percentage": 70.0}], // Added specific stats
        llm_summary: null, // Explicitly null for this comprehensive data test
      };

      const mockDashboardWithLlmSummary = {
        ...baseMockDashboardData,
        child_id: 1,
        child_full_name: 'Child Alpha',
        llm_summary: "This is a great summary from the AI. Child Alpha is showing good progress overall!",
        // Include other minimal necessary fields if any section relies on them before LLM summary
        subjects_practiced: ["Math"], // Example, so "Subjects Practiced" card renders if needed for layout testing
      };

      const mockDashboardWithAlertsAndNoSubjectsOrSpecificStats = {
        ...baseMockDashboardData, // Use base to ensure other fields are minimal
        child_id: 1, // Keep consistent child_id for context
        child_full_name: 'Child Alpha', // Keep consistent child_name
        subjects_practiced: [],
        specific_mastery_stats: [],
        alerts: [
            "Child has not had a session in over 5 days.",
            "Great job! Progress made in Algebra."
        ]
      };


      // Test suite for when dashboardData is fully loaded
      describe('When dashboardData is populated', () => {
        beforeEach(() => { // Nested beforeEach for this specific describe block
            useParentDashboard.mockReturnValue({
              ...initialMockContextValue,
              linkedChildren: mockChildren,
              selectedChildId: 1,
              dashboardData: mockDashboardFullData // mockDashboardFullData already has subjects and specific_mastery_stats
            });
          });

        test('renders dashboard data correctly including subjects and specific mastery stats', () => {
          render(<ParentDashboardPage />);
          expect(screen.getByText(/Dashboard for Child Alpha \(ID: 1\)/i)).toBeInTheDocument();
          // Engagement
          expect(screen.getByText(/Total tutoring time this week: 120 minutes/i)).toBeInTheDocument();
          expect(screen.getByText(/Curriculum completed: 75.5%/i)).toBeInTheDocument();
          expect(screen.getByText('Algebra')).toBeInTheDocument(); // Strength

          // Subjects Practiced
          expect(screen.getByText('Subjects Practiced')).toBeInTheDocument();
          expect(screen.getByText(/Algebra, Geometry, Reading Comprehension/i)).toBeInTheDocument();

          // Specific Mastery Stats
          expect(screen.getByText('Specific Progress:')).toBeInTheDocument();
          expect(screen.getByText(/Grade 5 Math Progress: 70.0%/i)).toBeInTheDocument();

          // Performance Chart (mocked)
          expect(screen.getByTestId('performance-chart-mock')).toBeInTheDocument();
          // Alerts section should not be visible if alerts array is empty (as it is in mockDashboardFullData which has alerts: [])
          expect(screen.queryByText('Important Alerts')).not.toBeInTheDocument();
          // LLM Summary section should not be visible if llm_summary is null
          expect(screen.queryByText('AI Generated Summary')).not.toBeInTheDocument();
        });

        test('renders LLM Summary when provided', () => {
          useParentDashboard.mockReturnValue({
            ...initialMockContextValue,
            linkedChildren: mockChildren,
            selectedChildId: 1,
            dashboardData: mockDashboardWithLlmSummary
          });
          render(<ParentDashboardPage />);
          expect(screen.getByText('AI Generated Summary')).toBeInTheDocument();
          expect(screen.getByText(mockDashboardWithLlmSummary.llm_summary)).toBeInTheDocument();
        });

        test('does not render "Subjects Practiced" or "Specific Progress" sections if their data is empty', () => {
            const dataWithNoSubjectsOrSpecificStats = {
                ...mockDashboardFullData,
                subjects_practiced: [],
                specific_mastery_stats: []
            };
            useParentDashboard.mockReturnValue({
                ...initialMockContextValue,
                linkedChildren: mockChildren,
                selectedChildId: 1,
                dashboardData: dataWithNoSubjectsOrSpecificStats
              });
            render(<ParentDashboardPage />);
            expect(screen.queryByText('Subjects Practiced')).not.toBeInTheDocument();
            expect(screen.queryByText('Specific Progress:')).not.toBeInTheDocument();
        });
      });


      test('renders alerts and hides empty sections for subjects and specific stats', () => {
        useParentDashboard.mockReturnValue({
            ...initialMockContextValue,
            linkedChildren: mockChildren,
            selectedChildId: 1,
            dashboardData: mockDashboardWithAlertsAndNoSubjectsOrSpecificStats
          });
        render(<ParentDashboardPage />);
        expect(screen.getByText('Important Alerts')).toBeInTheDocument();
        expect(screen.getByText(mockDashboardWithAlertsAndNoSubjectsOrSpecificStats.alerts[0])).toBeInTheDocument();
        expect(screen.getByText(mockDashboardWithAlertsAndNoSubjectsOrSpecificStats.alerts[1])).toBeInTheDocument();
        expect(screen.queryByText('Subjects Practiced')).not.toBeInTheDocument();
        expect(screen.queryByText('Specific Progress:')).not.toBeInTheDocument();
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
    }); // End of 'With Dashboard Data Loaded'
  }); // End of 'With Linked Children'

  describe('PDF Download Button Logic', () => {
    // Re-use mockChildren from the previous describe block or redefine if needed
    const mockChildren = [{ id: 1, full_name: 'Child Alpha' }];
    const mockDashboardDataForButton = { // Sufficient data to enable the button
        ...baseMockDashboardData, // Use base and override necessary
        child_id: 1,
        child_full_name: 'Child Alpha',
        // other fields can be minimal as button logic only checks for dashboardData presence
    };

    test('is disabled when no child is selected', () => {
      useParentDashboard.mockReturnValue({ ...initialMockContextValue, linkedChildren: mockChildren, selectedChildId: null, dashboardData: null });
      render(<ParentDashboardPage />);
      expect(screen.getByText('Download PDF Report')).toBeDisabled();
    });

    test('is disabled when dashboard data is loading', () => {
      useParentDashboard.mockReturnValue({ ...initialMockContextValue, linkedChildren: mockChildren, selectedChildId: 1, isLoadingDashboardData: true, dashboardData: null });
      render(<ParentDashboardPage />);
      expect(screen.getByText('Download PDF Report')).toBeDisabled();
    });

    test('is disabled when dashboard data is not present (null)', () => {
      useParentDashboard.mockReturnValue({ ...initialMockContextValue, linkedChildren: mockChildren, selectedChildId: 1, dashboardData: null });
      render(<ParentDashboardPage />);
      expect(screen.getByText('Download PDF Report')).toBeDisabled();
    });

    test('is enabled when a child is selected and dashboard data is present', () => {
      useParentDashboard.mockReturnValue({
        ...initialMockContextValue,
        linkedChildren: mockChildren,
        selectedChildId: 1,
        dashboardData: mockDashboardDataForButton
      });
      render(<ParentDashboardPage />);
      expect(screen.getByText('Download PDF Report')).toBeEnabled();
    });

    test('calls fetch with correct URL/headers and triggers download on click', async () => {
      // Mock window/document methods for download simulation
      global.URL.createObjectURL = jest.fn(() => 'mock-object-url');
      global.URL.revokeObjectURL = jest.fn();
      const mockLinkClick = jest.fn();
      const mockLinkRemove = jest.fn(); // remove is called on the element itself
      const mockSetAttribute = jest.fn();

      const mockAnchorElement = {
        href: '',
        setAttribute: mockSetAttribute,
        click: mockLinkClick,
        remove: mockLinkRemove,
        style: {},
      };
      jest.spyOn(document, 'createElement').mockReturnValue(mockAnchorElement);
      jest.spyOn(document.body, 'appendChild').mockImplementation(jest.fn()); // Mock appendChild
      jest.spyOn(document.body, 'removeChild').mockImplementation(jest.fn()); // Mock removeChild


      const mockPdfBlob = new Blob(['mock pdf content'], { type: 'application/pdf' });
      const mockFileName = "progress_report_child_alpha.pdf";
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        blob: async () => mockPdfBlob,
        headers: new Headers({ // Use new Headers() for proper interface
          'Content-Disposition': `attachment; filename="${mockFileName}"`
        }),
      });

      useParentDashboard.mockReturnValue({
        ...initialMockContextValue,
        linkedChildren: mockChildren,
        selectedChildId: 1,
        dashboardData: mockDashboardDataForButton
      });
      render(<ParentDashboardPage />);

      const downloadButton = screen.getByText('Download PDF Report');
      fireEvent.click(downloadButton);

      await waitFor(() => expect(mockGetIdToken).toHaveBeenCalled());
      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
        '/api/parent/children/1/progress_report_pdf',
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-pdf-token' }
        })
      ));

      await waitFor(() => expect(global.URL.createObjectURL).toHaveBeenCalledWith(mockPdfBlob));
      await waitFor(() => expect(document.createElement).toHaveBeenCalledWith('a'));
      expect(mockSetAttribute).toHaveBeenCalledWith('download', mockFileName);

      await waitFor(() => expect(mockLinkClick).toHaveBeenCalled());
      await waitFor(() => expect(document.body.removeChild).toHaveBeenCalledWith(mockAnchorElement)); // Check if removeChild was called on the mock anchor
      await waitFor(() => expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('mock-object-url'));

      // Restore original implementations if they were modified by spyOn(document.body, ...)
      jest.restoreAllMocks();
    });

    test('handles fetch error during PDF download', async () => {
        // Spy on window.alert
        jest.spyOn(window, 'alert').mockImplementation(() => {});

        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 500,
            statusText: "Internal Server Error",
            json: async () => ({ detail: "Server error during PDF generation." })
          });

        useParentDashboard.mockReturnValue({
            ...initialMockContextValue,
            linkedChildren: mockChildren,
            selectedChildId: 1,
            dashboardData: mockDashboardDataForButton
          });
        render(<ParentDashboardPage />);

        const downloadButton = screen.getByText('Download PDF Report');
        fireEvent.click(downloadButton);

        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
        await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Error downloading report: Server error during PDF generation.'));

        window.alert.mockRestore(); // Clean up spy
    });
  });
});
