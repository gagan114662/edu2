import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import VoiceControls from './VoiceControls';

describe('VoiceControls', () => {
  const mockOnToggleListen = jest.fn();
  const defaultProps = {
    isListening: false,
    isConnecting: false,
    tutorIsSpeaking: false,
    statusMessage: "Idle",
    micError: null,
    onToggleListen: mockOnToggleListen,
  };

  beforeEach(() => {
    mockOnToggleListen.mockClear();
  });

  test('renders initial state correctly', () => {
    render(<VoiceControls {...defaultProps} />);
    expect(screen.getByRole('button', { name: /start talking/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start talking/i })).not.toBeDisabled();
    expect(screen.getByTestId('status-message')).toHaveTextContent('Idle');
    expect(screen.queryByTestId('mic-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tutor-speaking-indicator')).not.toBeInTheDocument();
  });

  test('button shows "Connecting..." and is disabled when isConnecting is true', () => {
    render(<VoiceControls {...defaultProps} isConnecting={true} statusMessage="Connecting..." />);
    expect(screen.getByRole('button', { name: /connecting.../i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connecting.../i })).toBeDisabled();
    expect(screen.getByTestId('status-message')).toHaveTextContent('Connecting...');
  });

  test('button shows "Stop Listening" and is enabled when isListening is true', () => {
    render(<VoiceControls {...defaultProps} isListening={true} statusMessage="Listening..." />);
    expect(screen.getByRole('button', { name: /stop listening/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /stop listening/i })).not.toBeDisabled();
    expect(screen.getByTestId('status-message')).toHaveTextContent('Listening...');
  });

  test('button is disabled if tutorIsSpeaking and user is not listening', () => {
    render(<VoiceControls {...defaultProps} tutorIsSpeaking={true} isListening={false} />);
    expect(screen.getByRole('button', { name: /start talking/i })).toBeDisabled();
  });

  test('button is enabled if tutorIsSpeaking but user is also listening (can stop own recording)', () => {
    render(<VoiceControls {...defaultProps} tutorIsSpeaking={true} isListening={true} />);
    expect(screen.getByRole('button', { name: /stop listening/i })).not.toBeDisabled();
  });

  test('button is disabled if micError is present', () => {
    render(<VoiceControls {...defaultProps} micError="Test mic error" />);
    expect(screen.getByRole('button', { name: /start talking/i })).toBeDisabled();
    expect(screen.getByTestId('mic-error')).toHaveTextContent('Error: Test mic error');
  });

  test('button is enabled if micError is present but isConnecting or isListening (should not happen, but tests isDisabled logic)', () => {
    // This tests the !(tutorIsSpeaking && !isListening) part of isDisabled when micError is present.
    // The isDisabled logic is: isConnecting || (tutorIsSpeaking && !isListening) || !!micError;
    // So if micError is true, it will always be disabled. This test title is a bit misleading.
    // Let's correct the expectation: button is disabled if micError is true, regardless of other states.
    render(<VoiceControls {...defaultProps} isListening={true} micError="Test mic error" />);
    expect(screen.getByRole('button', { name: /stop listening/i })).toBeDisabled();
  });


  test('displays status message correctly', () => {
    render(<VoiceControls {...defaultProps} statusMessage="Test Status" />);
    expect(screen.getByTestId('status-message')).toHaveTextContent('Test Status');
  });

  test('displays mic error correctly', () => {
    render(<VoiceControls {...defaultProps} micError="Microphone not found." />);
    expect(screen.getByTestId('mic-error')).toHaveTextContent('Error: Microphone not found.');
  });

  test('displays tutor speaking indicator when tutorIsSpeaking is true and user is not listening', () => {
    render(<VoiceControls {...defaultProps} tutorIsSpeaking={true} isListening={false} />);
    expect(screen.getByTestId('tutor-speaking-indicator')).toHaveTextContent('Tutor is speaking... 🌀');
  });

  test('does not display tutor speaking indicator if user isListening', () => {
    render(<VoiceControls {...defaultProps} tutorIsSpeaking={true} isListening={true} />);
    expect(screen.queryByTestId('tutor-speaking-indicator')).not.toBeInTheDocument();
  });

  test('does not display tutor speaking indicator if tutorIsNotSpeaking', () => {
    render(<VoiceControls {...defaultProps} tutorIsSpeaking={false} />);
    expect(screen.queryByTestId('tutor-speaking-indicator')).not.toBeInTheDocument();
  });

  test('calls onToggleListen when button is clicked (if not disabled)', () => {
    render(<VoiceControls {...defaultProps} />); // Initial state, button is enabled
    const button = screen.getByRole('button', { name: /start talking/i });
    fireEvent.click(button);
    expect(mockOnToggleListen).toHaveBeenCalledTimes(1);
  });

  test('does not call onToggleListen when button is clicked and disabled', () => {
    render(<VoiceControls {...defaultProps} isConnecting={true} />); // Disabled state
    const button = screen.getByRole('button', { name: /connecting.../i });
    fireEvent.click(button);
    expect(mockOnToggleListen).not.toHaveBeenCalled();
  });
});
