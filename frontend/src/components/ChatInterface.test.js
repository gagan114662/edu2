import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom'; // For extended matchers like .toBeInTheDocument()

import ChatInterface from './ChatInterface';
import { AuthContext } from '../context/AuthContext'; // To provide mock context

// Mock fetch globally
global.fetch = jest.fn();

// Mock scrollToView as it's called by jsdom and can cause errors/warnings if not mocked
window.HTMLElement.prototype.scrollIntoView = jest.fn();

const mockAuthContextValue = {
  token: 'test-token',
  isAuthenticated: true,
  user: { name: 'Test User', email: 'test@example.com' },
  login: jest.fn(),
  logout: jest.fn(),
  loading: false,
};

// Wrapper component to provide the AuthContext
const WrappedChatInterface = () => (
  <AuthContext.Provider value={mockAuthContextValue}>
    <ChatInterface />
  </AuthContext.Provider>
);

describe('ChatInterface Component', () => {
  beforeEach(() => {
    // Clear mock call counts and implementations before each test
    fetch.mockClear();
    fetch.mockImplementation(() => // Default mock for successful responses
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ reply: 'Mocked AI response' }),
      })
    );
    window.HTMLElement.prototype.scrollIntoView.mockClear();
  });

  test('renders initial welcome message, input field, and send button', () => {
    render(<WrappedChatInterface />);

    expect(screen.getByText(/Hello! I'm your AI Tutor. How can I help you today?/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Ask your question.../i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send/i })).toBeInTheDocument();
  });

  test('allows user to type in the input field', () => {
    render(<WrappedChatInterface />);
    const inputElement = screen.getByPlaceholderText(/Ask your question.../i);

    fireEvent.change(inputElement, { target: { value: 'Hello tutor!' } });
    expect(inputElement.value).toBe('Hello tutor!');
  });

  test('sends message when send button is clicked and displays user and AI messages', async () => {
    render(<WrappedChatInterface />);
    const inputElement = screen.getByPlaceholderText(/Ask your question.../i);
    const sendButton = screen.getByRole('button', { name: /Send/i });

    fireEvent.change(inputElement, { target: { value: 'Test query' } });
    fireEvent.click(sendButton);

    expect(await screen.findByText('Test query')).toBeInTheDocument();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      '/api/askTutor',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
        body: JSON.stringify({
          query: 'Test query',
          history: [{ role: 'model', parts: ["Hello! I'm your AI Tutor. How can I help you today?"] }],
          grade_level: 'middle school',
        }),
      })
    );

    expect(await screen.findByText('Mocked AI response')).toBeInTheDocument();
    expect(inputElement.value).toBe('');
  });

  test('sends message when Enter key is pressed and displays messages', async () => {
    render(<WrappedChatInterface />);
    const inputElement = screen.getByPlaceholderText(/Ask your question.../i);

    fireEvent.change(inputElement, { target: { value: 'Enter key test' } });
    fireEvent.keyPress(inputElement, { key: 'Enter', code: 'Enter', charCode: 13 });

    expect(await screen.findByText('Enter key test')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      '/api/askTutor',
      expect.objectContaining({
        body: JSON.stringify(expect.objectContaining({ query: 'Enter key test' })),
      })
    );
    expect(await screen.findByText('Mocked AI response')).toBeInTheDocument();
    expect(inputElement.value).toBe('');
  });


  test('handles API error and displays error message in chat and error area', async () => {
    fetch.mockImplementationOnce(() => // Override fetch for this specific test
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ detail: 'Internal Server Error' }),
      })
    );

    render(<WrappedChatInterface />);
    const inputElement = screen.getByPlaceholderText(/Ask your question.../i);
    const sendButton = screen.getByRole('button', { name: /Send/i });

    fireEvent.change(inputElement, { target: { value: 'Query that causes error' } });
    fireEvent.click(sendButton);

    expect(await screen.findByText('Query that causes error')).toBeInTheDocument();
    expect(await screen.findByText(/Sorry, I encountered an error: Internal Server Error. Please try again./i)).toBeInTheDocument();

    // Check for the dedicated error display area
    const errorDisplayArea = await screen.findByText('Internal Server Error');
    expect(errorDisplayArea).toBeInTheDocument();
    expect(errorDisplayArea.closest('div')).toHaveClass('text-left text-red-600 mb-2 p-3 bg-red-100 border border-red-400 rounded-md');
  });

  test('does not send message if input is empty or only whitespace', () => {
    render(<WrappedChatInterface />);
    const sendButton = screen.getByRole('button', { name: /Send/i });
    const inputElement = screen.getByPlaceholderText(/Ask your question.../i);

    // Test with empty input
    fireEvent.click(sendButton);
    expect(fetch).not.toHaveBeenCalled();

    // Test with whitespace input
    fireEvent.change(inputElement, { target: { value: '   ' } });
    fireEvent.click(sendButton);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('disables input and button while loading', async () => {
    fetch.mockImplementationOnce(() =>
      new Promise(resolve => setTimeout(() => resolve({ // Simulate network latency
        ok: true,
        json: () => Promise.resolve({ reply: 'Delayed response' }),
      }), 100))
    );

    render(<WrappedChatInterface />);
    const inputElement = screen.getByPlaceholderText(/Ask your question.../i);
    const sendButton = screen.getByRole('button', { name: /Send/i });

    fireEvent.change(inputElement, { target: { value: 'Test loading state' } });
    fireEvent.click(sendButton);

    // Immediately after click, input and button should be disabled, button text changes
    expect(inputElement).toBeDisabled();
    expect(sendButton).toBeDisabled();
    expect(screen.getByRole('button', { name: /Sending.../i})).toBeInTheDocument();
    expect(screen.getByText(/Tutor is thinking.../i)).toBeInTheDocument(); // Loading message

    // Wait for the response and UI to update
    await waitFor(() => expect(inputElement).not.toBeDisabled());
    expect(sendButton).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /Send/i})).toBeInTheDocument(); // Button text back to Send
    expect(screen.queryByText(/Tutor is thinking.../i)).not.toBeInTheDocument(); // Loading message gone
    expect(await screen.findByText('Delayed response')).toBeInTheDocument();
  });

});
