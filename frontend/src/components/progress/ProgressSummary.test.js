import React from 'react';
import { render, screen } from '@testing-library/react';
import ProgressSummary from './ProgressSummary'; // Assuming the path is correct

describe('ProgressSummary Component', () => {
  test('renders loading state when no summaryData is provided', () => {
    render(<ProgressSummary summaryData={null} />);
    expect(screen.getByText(/Loading summary.../i)).toBeInTheDocument();
  });

  test('renders correctly with valid summaryData', () => {
    const mockData = {
      totalSessions: 5,
      totalTimeSpentSeconds: 3660, // 1 hour, 1 minute
      lastActivityTimestamp: new Date('2023-10-26T10:00:00Z').toISOString(),
    };
    render(<ProgressSummary summaryData={mockData} />);

    expect(screen.getByText(/Progress Summary/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Sessions Completed:/i)).toHaveTextContent('Total Sessions Completed: 5');
    expect(screen.getByText(/Total Time Spent Learning:/i)).toHaveTextContent('Total Time Spent Learning: 1 hour 1 minute');
    expect(screen.getByText(/Last Activity:/i)).toHaveTextContent(`Last Activity: ${new Date(mockData.lastActivityTimestamp).toLocaleDateString()}`);
  });

  test('renders correctly with zero values in summaryData', () => {
    const mockData = {
      totalSessions: 0,
      totalTimeSpentSeconds: 0,
      lastActivityTimestamp: null,
    };
    render(<ProgressSummary summaryData={mockData} />);

    expect(screen.getByText(/Total Sessions Completed:/i)).toHaveTextContent('Total Sessions Completed: 0');
    expect(screen.getByText(/Total Time Spent Learning:/i)).toHaveTextContent('Total Time Spent Learning: 0 minutes');
    expect(screen.getByText(/Last Activity:/i)).toHaveTextContent('Last Activity: N/A');
  });

  test('formats time correctly for various durations', () => {
    // Test cases for formatTime utility (indirectly)
    const testCases = [
      { seconds: 0, expected: '0 minutes' },
      { seconds: 59, expected: '0 minutes' }, // Assuming less than a minute is 0 minutes by current logic
      { seconds: 60, expected: '1 minute' },
      { seconds: 119, expected: '1 minute' },
      { seconds: 120, expected: '2 minutes' },
      { seconds: 3599, expected: '59 minutes' },
      { seconds: 3600, expected: '1 hour' },
      { seconds: 3660, expected: '1 hour 1 minute' },
      { seconds: 7200, expected: '2 hours' },
      { seconds: 7260, expected: '2 hours 1 minute' },
      { seconds: 7320, expected: '2 hours 2 minutes' },
    ];

    // Helper to render with specific time for focused testing
    const renderWithTime = (seconds) => {
      const data = { totalTimeSpentSeconds: seconds, totalSessions: 0, lastActivityTimestamp: null };
      return render(<ProgressSummary summaryData={data} />);
    };

    testCases.forEach(tc => {
      const { unmount } = renderWithTime(tc.seconds);
      expect(screen.getByText(/Total Time Spent Learning:/i)).toHaveTextContent(`Total Time Spent Learning: ${tc.expected}`);
      unmount(); // Clean up between renders
    });
  });

  test('formats time correctly when only minutes are present', () => {
    const mockData = { totalTimeSpentSeconds: 900 }; // 15 minutes
    render(<ProgressSummary summaryData={mockData} />);
    expect(screen.getByText(/Total Time Spent Learning:/i)).toHaveTextContent('Total Time Spent Learning: 15 minutes');
  });

  test('formats time correctly when only hours are present', () => {
    const mockData = { totalTimeSpentSeconds: 10800 }; // 3 hours
    render(<ProgressSummary summaryData={mockData} />);
    expect(screen.getByText(/Total Time Spent Learning:/i)).toHaveTextContent('Total Time Spent Learning: 3 hours');
  });

});
