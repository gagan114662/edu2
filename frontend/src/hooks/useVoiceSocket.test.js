import { renderHook, act, waitFor } from '@testing-library/react';
import useVoiceSocket from './useVoiceSocket';

// Mock global WebSocket
const mockWebSocketInstance = {
  send: jest.fn(),
  close: jest.fn(),
  readyState: WebSocket.CONNECTING, // Initial state
  onopen: null,
  onclose: null,
  onerror: null,
  onmessage: null,
};
global.WebSocket = jest.fn(() => mockWebSocketInstance);

describe('useVoiceSocket Hook', () => {
  const backendWsUrl = 'ws://localhost:8000/test';
  let mockOnAudioChunk;
  let mockOnTranscriptUpdate;
  let mockOnTutorSpeakingChange;
  let mockOnErrorChange;
  let mockOnConnectionStateChange;

  beforeEach(() => {
    // Reset WebSocket instance mocks for each test
    jest.clearAllMocks(); // Clears WebSocket constructor mock and instance method mocks
    mockWebSocketInstance.readyState = WebSocket.CONNECTING; // Reset to initial state
    mockWebSocketInstance.onopen = null;
    mockWebSocketInstance.onclose = null;
    mockWebSocketInstance.onerror = null;
    mockWebSocketInstance.onmessage = null;
    // Reset internal close mock calls if any specific checks needed
    mockWebSocketInstance.close.mockClear();


    mockOnAudioChunk = jest.fn();
    mockOnTranscriptUpdate = jest.fn();
    mockOnTutorSpeakingChange = jest.fn();
    mockOnErrorChange = jest.fn();
    mockOnConnectionStateChange = jest.fn();
  });

  const getHook = () => renderHook(() => useVoiceSocket(
    backendWsUrl,
    mockOnAudioChunk,
    mockOnTranscriptUpdate,
    mockOnTutorSpeakingChange,
    mockOnErrorChange,
    mockOnConnectionStateChange
  ));

  test('initial state', () => {
    const { result } = getHook();
    expect(result.current.connectionState).toBe('idle');
  });

  test('connectSocket establishes connection and updates state', () => {
    const { result } = getHook();
    act(() => {
      result.current.connectSocket();
    });

    expect(global.WebSocket).toHaveBeenCalledWith(backendWsUrl);
    expect(result.current.connectionState).toBe('connecting');
    expect(mockOnConnectionStateChange).toHaveBeenCalledWith('connecting', false); // wasUnexpected defaults to false

    // Simulate WebSocket open
    act(() => {
      if(mockWebSocketInstance.onopen) mockWebSocketInstance.onopen();
      mockWebSocketInstance.readyState = WebSocket.OPEN; // Manually update readyState for sendAudioData etc.
    });

    expect(result.current.connectionState).toBe('connected');
    expect(mockOnConnectionStateChange).toHaveBeenCalledWith('connected', false);
    expect(mockOnTranscriptUpdate).toHaveBeenCalledWith({speaker: 'system', text: 'Voice connection established.'});
  });

  test('disconnectSocket closes connection and updates state', () => {
    const { result } = getHook();
    act(() => { result.current.connectSocket(); });
    act(() => { if(mockWebSocketInstance.onopen) mockWebSocketInstance.onopen(); mockWebSocketInstance.readyState = WebSocket.OPEN; }); // Open socket

    act(() => {
      result.current.disconnectSocket();
    });

    expect(mockWebSocketInstance.close).toHaveBeenCalledWith(1000, "User disconnected");
    // Simulate onclose being called by the WebSocket mock
    act(() => {
        if(mockWebSocketInstance.onclose) mockWebSocketInstance.onclose({ code: 1000, reason: "User disconnected", wasClean: true });
        mockWebSocketInstance.readyState = WebSocket.CLOSED;
    });
    expect(result.current.connectionState).toBe('disconnected');
    expect(mockOnConnectionStateChange).toHaveBeenCalledWith('disconnected', false);
  });

  test('sendAudioData calls ws.send if connected', () => {
    const { result } = getHook();
    act(() => { result.current.connectSocket(); });
    act(() => { if(mockWebSocketInstance.onopen) mockWebSocketInstance.onopen(); mockWebSocketInstance.readyState = WebSocket.OPEN;});

    const audioData = new ArrayBuffer(10);
    act(() => {
      result.current.sendAudioData(audioData);
    });
    expect(mockWebSocketInstance.send).toHaveBeenCalledWith(audioData);
  });

  test('sendAudioData does not call ws.send if not connected', () => {
    const { result } = getHook(); // Socket is idle initially
    const audioData = new ArrayBuffer(10);
    act(() => {
      result.current.sendAudioData(audioData);
    });
    expect(mockWebSocketInstance.send).not.toHaveBeenCalled();
  });


  test('handles incoming text message (user_transcript)', () => {
    const { result } = getHook();
    act(() => { result.current.connectSocket(); });
    act(() => { if(mockWebSocketInstance.onopen) mockWebSocketInstance.onopen(); });

    const message = { type: 'user_transcript', text: 'Hello user' };
    act(() => {
      if(mockWebSocketInstance.onmessage) mockWebSocketInstance.onmessage({ data: JSON.stringify(message) });
    });
    expect(mockOnTranscriptUpdate).toHaveBeenCalledWith({ speaker: 'user', text: 'Hello user' });
  });

  test('handles incoming text message (tutor_transcript)', () => {
    const { result } = getHook();
    act(() => { result.current.connectSocket(); });
    act(() => { if(mockWebSocketInstance.onopen) mockWebSocketInstance.onopen(); });
    const message = { type: 'tutor_transcript', text: 'Hello tutor' };
    act(() => { if(mockWebSocketInstance.onmessage) mockWebSocketInstance.onmessage({ data: JSON.stringify(message) }); });
    expect(mockOnTranscriptUpdate).toHaveBeenCalledWith({ speaker: 'tutor', text: 'Hello tutor' });
  });

  test('handles incoming binary message (audio chunk)', () => {
    const { result } = getHook();
    act(() => { result.current.connectSocket(); });
    act(() => { if(mockWebSocketInstance.onopen) mockWebSocketInstance.onopen(); });

    const audioChunk = new ArrayBuffer(16);
    act(() => {
      if(mockWebSocketInstance.onmessage) mockWebSocketInstance.onmessage({ data: audioChunk });
    });
    expect(mockOnAudioChunk).toHaveBeenCalledWith(audioChunk);
  });

  test('handles tutor_speaking_started and tutor_speaking_finished messages', () => {
    const { result } = getHook();
    act(() => { result.current.connectSocket(); });
    act(() => { if(mockWebSocketInstance.onopen) mockWebSocketInstance.onopen(); });

    act(() => { if(mockWebSocketInstance.onmessage) mockWebSocketInstance.onmessage({ data: JSON.stringify({ type: 'tutor_speaking_started' }) }); });
    expect(mockOnTutorSpeakingChange).toHaveBeenCalledWith(true);

    act(() => { if(mockWebSocketInstance.onmessage) mockWebSocketInstance.onmessage({ data: JSON.stringify({ type: 'tutor_speaking_finished' }) }); });
    expect(mockOnTutorSpeakingChange).toHaveBeenCalledWith(false);
  });

  test('handles WebSocket onerror', () => {
    const { result } = getHook();
    act(() => { result.current.connectSocket(); });

    act(() => {
      if(mockWebSocketInstance.onerror) mockWebSocketInstance.onerror(new Event('error'));
    });
    expect(result.current.connectionState).toBe('error');
    expect(mockOnErrorChange).toHaveBeenCalledWith("Voice connection error. Please check console or try again.");
    expect(mockOnConnectionStateChange).toHaveBeenCalledWith('error', false);
  });

  test('handles WebSocket onclose (unexpected)', () => {
    const { result } = getHook();
    act(() => { result.current.connectSocket(); });
    act(() => { if(mockWebSocketInstance.onopen) mockWebSocketInstance.onopen(); mockWebSocketInstance.readyState = WebSocket.OPEN; });

    act(() => {
      if(mockWebSocketInstance.onclose) mockWebSocketInstance.onclose({ code: 1006, reason: "Abnormal closure", wasClean: false });
      mockWebSocketInstance.readyState = WebSocket.CLOSED;
    });
    expect(result.current.connectionState).toBe('disconnected');
    expect(mockOnErrorChange).toHaveBeenCalledWith("Voice service disconnected (Code: 1006).");
    expect(mockOnConnectionStateChange).toHaveBeenCalledWith('disconnected', true); // wasUnexpected = true
  });

  test('unmount calls disconnectSocket', () => {
    const { result, unmount } = getHook();
    act(() => { result.current.connectSocket(); });
    act(() => { if(mockWebSocketInstance.onopen) mockWebSocketInstance.onopen(); mockWebSocketInstance.readyState = WebSocket.OPEN; });

    act(() => {
      unmount();
    });
    expect(mockWebSocketInstance.close).toHaveBeenCalledWith(1000, "Component unmounting");
  });
});
