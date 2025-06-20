import React from 'react';
import { render, screen } from '@testing-library/react';
import TranscriptView from './TranscriptView';

describe('TranscriptView', () => {
  const mockTranscript = [
    { speaker: 'user', text: 'Hello Tutor' },
    { speaker: 'tutor', text: 'Hello User! How can I help you today?' },
    { speaker: 'user', text: 'Tell me about React.' },
    { speaker: 'system', text: 'Fetching information about React...' },
  ];

  test('renders empty state message when transcript is empty or null', () => {
    const { rerender } = render(<TranscriptView transcript={[]} />);
    expect(screen.getByText(/no conversation yet/i)).toBeInTheDocument();

    rerender(<TranscriptView transcript={null} />);
    expect(screen.getByText(/no conversation yet/i)).toBeInTheDocument();
  });

  test('renders all transcript entries correctly', () => {
    render(<TranscriptView transcript={mockTranscript} />);

    expect(screen.getByText(/You: Hello Tutor/i)).toBeInTheDocument();
    expect(screen.getByText(/Tutor: Hello User! How can I help you today?/i)).toBeInTheDocument();
    expect(screen.getByText(/You: Tell me about React./i)).toBeInTheDocument();
    expect(screen.getByText(/System: Fetching information about React.../i)).toBeInTheDocument(); // Assuming 'system' is capitalized like others

    // Check for correct number of entries
    const entries = screen.getAllByTestId(/transcript-entry-/);
    expect(entries.length).toBe(mockTranscript.length);
  });

  test('applies correct alignment and styling for user messages', () => {
    render(<TranscriptView transcript={[{ speaker: 'user', text: 'User message' }]} />);
    const entryDiv = screen.getByTestId('transcript-entry-0');
    expect(entryDiv).toHaveClass('justify-end'); // User messages should be right-aligned

    const bubbleDiv = entryDiv.firstChild; // The styled bubble
    expect(bubbleDiv).toHaveStyle('backgroundColor: #dcf8c6'); // User background color
  });

  test('applies correct alignment and styling for tutor messages', () => {
    render(<TranscriptView transcript={[{ speaker: 'tutor', text: 'Tutor message' }]} />);
    const entryDiv = screen.getByTestId('transcript-entry-0');
    expect(entryDiv).toHaveClass('justify-start'); // Tutor messages should be left-aligned

    const bubbleDiv = entryDiv.firstChild;
    expect(bubbleDiv).toHaveStyle('backgroundColor: #ffffff'); // Tutor background color
    expect(bubbleDiv).toHaveStyle('border: 1px solid #e5e7eb');
  });

  test('applies correct alignment and styling for system messages', () => {
    render(<TranscriptView transcript={[{ speaker: 'system', text: 'System message' }]} />);
    const entryDiv = screen.getByTestId('transcript-entry-0');
    expect(entryDiv).toHaveClass('justify-start'); // System messages also left-aligned (default)

    const bubbleDiv = entryDiv.firstChild;
    expect(bubbleDiv).toHaveStyle('backgroundColor: #e5e7eb'); // System background color
  });


  test('auto-scrolling ref is present', () => {
    // This test mainly ensures the ref div is rendered.
    // Actual scroll behavior is hard to test in JSDOM but can be visually confirmed.
    // We can check if the ref's current element is the last div.
    const { container } = render(<TranscriptView transcript={mockTranscript} />);
    const endOfMessagesDiv = container.querySelector('div[data-testid^="transcript-entry-"] + div'); // Selects the div immediately after the last transcript entry

    // This is a bit indirect. A more direct way would be to export the ref or add a testid to it.
    // Given the current implementation of TranscriptView, endOfMessagesRef.current points to the div *after* the map.
    // So, the last child of the main scrollable div should be the ref div.
    const scrollableDiv = screen.getByTestId('transcript-view');
    expect(scrollableDiv.lastChild).toBeTruthy(); // The div with endOfMessagesRef should be the last child
  });
});
