import React from 'react';
import { render, screen } from '@testing-library/react';
import TopicsProgressView from './TopicsProgressView'; // Assuming the path is correct

describe('TopicsProgressView Component', () => {
  const mockTopicsData = {
    "Algebra": {
      questionsAttempted: 20,
      questionsCorrect: 15,
      masteryLevel: 0.75,
      lastPracticed: new Date('2023-10-25T12:00:00Z').toISOString(),
    },
    "Calculus": {
      questionsAttempted: 10,
      questionsCorrect: 5,
      masteryLevel: 0.5,
      lastPracticed: new Date('2023-10-24T10:30:00Z').toISOString(),
    },
    "Geometry": { // Topic with 0 mastery
      questionsAttempted: 5,
      questionsCorrect: 0,
      masteryLevel: 0.0,
      lastPracticed: new Date('2023-10-22T08:00:00Z').toISOString(),
    },
    "Trigonometry": { // Topic with no attempts yet (mastery should be 0)
        questionsAttempted: 0,
        questionsCorrect: 0,
        masteryLevel: 0, // Or could be undefined/null from backend, model defaults to 0
        lastPracticed: null,
    }
  };

  test('renders "no topic progress" message when topicsData is null or empty', () => {
    const { rerender } = render(<TopicsProgressView topicsData={null} />);
    expect(screen.getByText(/No specific topic progress recorded yet./i)).toBeInTheDocument();

    rerender(<TopicsProgressView topicsData={{}} />);
    expect(screen.getByText(/No specific topic progress recorded yet./i)).toBeInTheDocument();
  });

  test('renders all topic items correctly', () => {
    render(<TopicsProgressView topicsData={mockTopicsData} />);

    // Check for Algebra
    expect(screen.getByText('Algebra')).toBeInTheDocument();
    expect(screen.getByText((content, element) => content.startsWith('Mastery:') && content.includes('75%'))).toBeInTheDocument();
    expect(screen.getByText(/Attempted: 20, Correct: 15/i)).toBeInTheDocument();
    expect(screen.getByText(`Last Practiced: ${new Date(mockTopicsData.Algebra.lastPracticed).toLocaleDateString()}`)).toBeInTheDocument();

    // Check for Calculus
    expect(screen.getByText('Calculus')).toBeInTheDocument();
    expect(screen.getByText((content, element) => content.startsWith('Mastery:') && content.includes('50%'))).toBeInTheDocument();
    expect(screen.getByText(/Attempted: 10, Correct: 5/i)).toBeInTheDocument();

    // Check for Geometry (0% mastery)
    expect(screen.getByText('Geometry')).toBeInTheDocument();
    expect(screen.getByText((content, element) => content.startsWith('Mastery:') && content.includes('0%'))).toBeInTheDocument();

    // Check for Trigonometry (0 attempts)
    expect(screen.getByText('Trigonometry')).toBeInTheDocument();
    expect(screen.getByText((content, element) => content.startsWith('Mastery:') && content.includes('0%'))).toBeInTheDocument();
    expect(screen.getByText(/Attempted: 0, Correct: 0/i)).toBeInTheDocument();
    expect(screen.queryByText((content, element) => content.startsWith('Last Practiced:') && element.textContent.includes('Trigonometry'))).not.toBeInTheDocument(); // No last practiced date
  });

  test('renders progress bars with correct width and aria attributes', () => {
    render(<TopicsProgressView topicsData={mockTopicsData} />);

    const algebraProgress = mockTopicsData.Algebra.masteryLevel * 100;
    const algebraProgressBar = screen.getAllByRole('progressbar').find(bar => bar.getAttribute('aria-valuenow') === algebraProgress.toString());
    expect(algebraProgressBar).toBeInTheDocument();
    expect(algebraProgressBar).toHaveStyle(`width: ${algebraProgress}%`);
    expect(algebraProgressBar).toHaveAttribute('aria-valuenow', algebraProgress.toString());

    const calculusProgress = mockTopicsData.Calculus.masteryLevel * 100;
    const calculusProgressBar = screen.getAllByRole('progressbar').find(bar => bar.getAttribute('aria-valuenow') === calculusProgress.toString());
    expect(calculusProgressBar).toBeInTheDocument();
    expect(calculusProgressBar).toHaveStyle(`width: ${calculusProgress}%`);

    const geometryProgress = mockTopicsData.Geometry.masteryLevel * 100; // 0%
    const geometryProgressBar = screen.getAllByRole('progressbar').find(bar => bar.getAttribute('aria-valuenow') === geometryProgress.toFixed(0));
    expect(geometryProgressBar).toBeInTheDocument();
    expect(geometryProgressBar).toHaveStyle(`width: ${geometryProgress}%`);
  });

  test('handles topic progress with missing masteryLevel or lastPracticed gracefully', () => {
    const partialTopicData = {
      "Statistics": {
        questionsAttempted: 5,
        questionsCorrect: 2,
        // masteryLevel is missing
        // lastPracticed is missing
      }
    };
    render(<TopicsProgressView topicsData={partialTopicData} />);
    expect(screen.getByText('Statistics')).toBeInTheDocument();
    // masteryLevel defaults to 0 in TopicItem if undefined from prop
    expect(screen.getByText((content, element) => content.startsWith('Mastery:') && content.includes('0%'))).toBeInTheDocument();
    expect(screen.queryByText((content, element) => content.startsWith('Last Practiced:'))).not.toBeInTheDocument();
  });
});
